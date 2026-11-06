//! The JSON API the Mac app uses to manage posts and authors. See the `api`
//! crate for the routes and types. Every route except login requires an
//! [`Admin`] token.

use std::sync::Arc;

use api::{
    ApiError, AuthorDto, AuthorInput, LoginRequest, LoginResponse, PostDetail, PostInput,
    PostSummary, PreviewRequest, PreviewResponse,
};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId};

use crate::AppState;
use crate::auth::{self, Admin, ClientIp};
use crate::db::{Author, Post};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/posts", get(list_posts).post(create_post))
        .route(
            "/api/posts/{id}",
            get(get_post).put(update_post).delete(delete_post),
        )
        .route("/api/posts/{id}/publish", post(publish_post))
        .route("/api/posts/{id}/unpublish", post(unpublish_post))
        .route("/api/authors", get(list_authors).post(create_author))
        .route("/api/authors/{id}", axum::routing::put(update_author))
        .route("/api/preview", post(preview))
}

/// Errors returned by the API, each with a fitting status code.
#[derive(Debug)]
pub enum ApiErr {
    Unauthorized,
    TooManyRequests,
    NotFound,
    Invalid(String),
    Conflict(String),
    Internal(anyhow::Error),
}

impl IntoResponse for ApiErr {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiErr::Unauthorized => (StatusCode::UNAUTHORIZED, "Not logged in.".to_owned()),
            ApiErr::TooManyRequests => (
                StatusCode::TOO_MANY_REQUESTS,
                "Too many failed logins. Try again in 15 minutes.".to_owned(),
            ),
            ApiErr::NotFound => (StatusCode::NOT_FOUND, "Not found.".to_owned()),
            ApiErr::Invalid(m) => (StatusCode::UNPROCESSABLE_ENTITY, m),
            ApiErr::Conflict(m) => (StatusCode::CONFLICT, m),
            ApiErr::Internal(e) => {
                tracing::error!(error = ?e, "admin API request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Something went wrong on the server.".to_owned(),
                )
            }
        };
        (status, Json(ApiError { error: message })).into_response()
    }
}

impl From<mongodb::error::Error> for ApiErr {
    fn from(e: mongodb::error::Error) -> Self {
        if is_duplicate_key(&e) {
            return ApiErr::Conflict("That slug is already used. Choose another one.".into());
        }
        ApiErr::Internal(e.into())
    }
}

fn is_duplicate_key(e: &mongodb::error::Error) -> bool {
    use mongodb::error::{ErrorKind, WriteFailure};
    match &*e.kind {
        ErrorKind::Write(WriteFailure::WriteError(w)) => w.code == 11000,
        ErrorKind::Command(c) => c.code == 11000,
        _ => false,
    }
}

type ApiResult<T> = Result<Json<T>, ApiErr>;

fn parse_id(id: &str) -> Result<ObjectId, ApiErr> {
    ObjectId::parse_str(id).map_err(|_| ApiErr::NotFound)
}

// ---------------------------------------------------------------- login

async fn login(
    State(state): State<Arc<AppState>>,
    ClientIp(ip): ClientIp,
    Json(req): Json<LoginRequest>,
) -> ApiResult<LoginResponse> {
    if !state.login_limiter.allowed(ip) {
        return Err(ApiErr::TooManyRequests);
    }
    match auth::login(&state.db, &req.password)
        .await
        .map_err(ApiErr::Internal)?
    {
        Some((token, expires_at)) => Ok(Json(LoginResponse { token, expires_at })),
        None => {
            state.login_limiter.record_failure(ip);
            tracing::warn!(%ip, "failed admin login");
            Err(ApiErr::Unauthorized)
        }
    }
}

async fn logout(State(state): State<Arc<AppState>>, admin: Admin) -> Result<StatusCode, ApiErr> {
    auth::logout(&state.db, &admin.token).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------- posts

fn summary(p: &Post) -> PostSummary {
    PostSummary {
        id: p.id.to_hex(),
        slug: p.slug.clone(),
        title: p.title.clone(),
        tags: p.tags.clone(),
        author_ids: p.author_ids.iter().map(|id| id.to_hex()).collect(),
        published_at: p.published_at,
        updated_at: p.updated_at,
    }
}

fn detail(p: &Post) -> PostDetail {
    PostDetail {
        id: p.id.to_hex(),
        slug: p.slug.clone(),
        title: p.title.clone(),
        summary: p.summary.clone(),
        markdown: p.markdown.clone(),
        tags: p.tags.clone(),
        author_ids: p.author_ids.iter().map(|id| id.to_hex()).collect(),
        published_at: p.published_at,
        updated_at: p.updated_at,
    }
}

async fn list_posts(State(state): State<Arc<AppState>>, _: Admin) -> ApiResult<Vec<PostSummary>> {
    let posts: Vec<Post> = state
        .db
        .posts
        .find(doc! {})
        .sort(doc! { "updated_at": -1 })
        .projection(doc! { "markdown": 0, "html": 0, "excerpt_html": 0 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(posts.iter().map(summary).collect()))
}

async fn get_post(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Path(id): Path<String>,
) -> ApiResult<PostDetail> {
    let post = find_post(&state, &id).await?;
    Ok(Json(detail(&post)))
}

async fn find_post(state: &AppState, id: &str) -> Result<Post, ApiErr> {
    state
        .db
        .posts
        .find_one(doc! { "_id": parse_id(id)? })
        .await?
        .ok_or(ApiErr::NotFound)
}

/// Checked and cleaned-up post fields.
struct ValidPost {
    title: String,
    slug: String,
    summary: String,
    markdown: String,
    tags: Vec<String>,
    author_ids: Vec<ObjectId>,
}

async fn validate_post(state: &AppState, input: PostInput) -> Result<ValidPost, ApiErr> {
    let title = input.title.trim().to_owned();
    if title.is_empty() {
        return Err(ApiErr::Invalid("The post needs a title.".into()));
    }
    if title.chars().count() > api::MAX_TITLE_LEN {
        return Err(ApiErr::Invalid(format!(
            "The title can be at most {} characters.",
            api::MAX_TITLE_LEN
        )));
    }
    if input.markdown.len() > api::MAX_MARKDOWN_LEN {
        return Err(ApiErr::Invalid("The post is too long (over 1 MB).".into()));
    }
    let slug = match input.slug.trim() {
        "" => render::slugify(&title),
        s => s.to_owned(),
    };
    if !api::is_valid_slug(&slug) {
        return Err(ApiErr::Invalid(
            "The slug can only use lowercase letters, digits and single dashes.".into(),
        ));
    }
    let author_ids = parse_author_ids(state, &input.author_ids).await?;
    Ok(ValidPost {
        title,
        slug,
        summary: input.summary.trim().to_owned(),
        markdown: input.markdown,
        tags: api::normalize_tags(&input.tags),
        author_ids,
    })
}

async fn parse_author_ids(state: &AppState, ids: &[String]) -> Result<Vec<ObjectId>, ApiErr> {
    if ids.is_empty() {
        return Err(ApiErr::Invalid(
            "The post needs at least one author.".into(),
        ));
    }
    let mut parsed: Vec<ObjectId> = Vec::new();
    for id in ids {
        let oid = ObjectId::parse_str(id)
            .map_err(|_| ApiErr::Invalid(format!("Unknown author {id:?}.")))?;
        if !parsed.contains(&oid) {
            parsed.push(oid);
        }
    }
    let found = state
        .db
        .authors
        .count_documents(doc! { "_id": { "$in": &parsed } })
        .await?;
    if found as usize != parsed.len() {
        return Err(ApiErr::Invalid("One of the authors does not exist.".into()));
    }
    Ok(parsed)
}

async fn create_post(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Json(input): Json<PostInput>,
) -> Result<(StatusCode, Json<PostDetail>), ApiErr> {
    let v = validate_post(&state, input).await?;
    let r = render::render(&v.markdown);
    let post = Post {
        id: ObjectId::new(),
        slug: v.slug,
        title: v.title,
        summary: v.summary,
        markdown: v.markdown,
        html: r.html,
        excerpt_html: r.excerpt_html,
        has_math: r.has_math,
        has_mermaid: r.has_mermaid,
        tags: v.tags,
        author_ids: v.author_ids,
        links: r.links,
        published_at: None,
        updated_at: crate::db::now(),
    };
    state.db.posts.insert_one(&post).await?;
    Ok((StatusCode::CREATED, Json(detail(&post))))
}

async fn update_post(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Path(id): Path<String>,
    Json(input): Json<PostInput>,
) -> ApiResult<PostDetail> {
    let mut post = find_post(&state, &id).await?;
    let v = validate_post(&state, input).await?;
    let r = render::render(&v.markdown);
    post.slug = v.slug;
    post.title = v.title;
    post.summary = v.summary;
    post.markdown = v.markdown;
    post.html = r.html;
    post.excerpt_html = r.excerpt_html;
    post.has_math = r.has_math;
    post.has_mermaid = r.has_mermaid;
    post.tags = v.tags;
    post.author_ids = v.author_ids;
    post.links = r.links;
    post.updated_at = crate::db::now();
    state
        .db
        .posts
        .replace_one(doc! { "_id": post.id }, &post)
        .await?;
    Ok(Json(detail(&post)))
}

async fn delete_post(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiErr> {
    let result = state
        .db
        .posts
        .delete_one(doc! { "_id": parse_id(&id)? })
        .await?;
    if result.deleted_count == 0 {
        return Err(ApiErr::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn publish_post(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Path(id): Path<String>,
) -> ApiResult<PostDetail> {
    let mut post = find_post(&state, &id).await?;
    if post.published_at.is_none() {
        let now = crate::db::now();
        post.published_at = Some(now);
        post.updated_at = now;
        state
            .db
            .posts
            .replace_one(doc! { "_id": post.id }, &post)
            .await?;
    }
    Ok(Json(detail(&post)))
}

async fn unpublish_post(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Path(id): Path<String>,
) -> ApiResult<PostDetail> {
    let mut post = find_post(&state, &id).await?;
    if post.published_at.is_some() {
        post.published_at = None;
        post.updated_at = crate::db::now();
        state
            .db
            .posts
            .replace_one(doc! { "_id": post.id }, &post)
            .await?;
    }
    Ok(Json(detail(&post)))
}

// ---------------------------------------------------------------- authors

fn author_dto(a: &Author) -> AuthorDto {
    AuthorDto {
        id: a.id.to_hex(),
        slug: a.slug.clone(),
        name: a.name.clone(),
        bio: a.bio.clone(),
        avatar: a.avatar.clone(),
        email: a.email.clone(),
        linkedin: a.linkedin.clone(),
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
}

fn validate_author(input: AuthorInput) -> Result<AuthorInput, ApiErr> {
    let name = input.name.trim().to_owned();
    if name.is_empty() {
        return Err(ApiErr::Invalid("The author needs a name.".into()));
    }
    let slug = match input.slug.trim() {
        "" => render::slugify(&name),
        s => s.to_owned(),
    };
    if !api::is_valid_slug(&slug) {
        return Err(ApiErr::Invalid(
            "The slug can only use lowercase letters, digits and single dashes.".into(),
        ));
    }
    let email = non_empty(input.email);
    if let Some(e) = &email {
        let valid = e.split_once('@').is_some_and(|(user, host)| {
            !user.is_empty() && host.contains('.') && !e.contains(char::is_whitespace)
        });
        if !valid {
            return Err(ApiErr::Invalid(format!("{e:?} is not an email address.")));
        }
    }
    let linkedin = non_empty(input.linkedin);
    if let Some(url) = &linkedin
        && !url.starts_with("https://")
    {
        return Err(ApiErr::Invalid(
            "The LinkedIn link must start with https://.".into(),
        ));
    }
    let avatar = non_empty(input.avatar);
    if let Some(url) = &avatar
        && !(url.starts_with("https://") || url.starts_with('/'))
    {
        return Err(ApiErr::Invalid(
            "The picture must be an https:// link or a path on this site.".into(),
        ));
    }
    Ok(AuthorInput {
        name,
        slug,
        bio: input.bio.trim().to_owned(),
        avatar,
        email,
        linkedin,
    })
}

async fn list_authors(State(state): State<Arc<AppState>>, _: Admin) -> ApiResult<Vec<AuthorDto>> {
    let authors: Vec<Author> = state
        .db
        .authors
        .find(doc! {})
        .sort(doc! { "name": 1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(authors.iter().map(author_dto).collect()))
}

async fn create_author(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Json(input): Json<AuthorInput>,
) -> Result<(StatusCode, Json<AuthorDto>), ApiErr> {
    let v = validate_author(input)?;
    let author = Author {
        id: ObjectId::new(),
        slug: v.slug,
        name: v.name,
        bio: v.bio,
        avatar: v.avatar,
        email: v.email,
        linkedin: v.linkedin,
        links: vec![],
    };
    state.db.authors.insert_one(&author).await?;
    Ok((StatusCode::CREATED, Json(author_dto(&author))))
}

async fn update_author(
    State(state): State<Arc<AppState>>,
    _: Admin,
    Path(id): Path<String>,
    Json(input): Json<AuthorInput>,
) -> ApiResult<AuthorDto> {
    let oid = parse_id(&id)?;
    let mut author = state
        .db
        .authors
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or(ApiErr::NotFound)?;
    let v = validate_author(input)?;
    author.slug = v.slug;
    author.name = v.name;
    author.bio = v.bio;
    author.avatar = v.avatar;
    author.email = v.email;
    author.linkedin = v.linkedin;
    state
        .db
        .authors
        .replace_one(doc! { "_id": oid }, &author)
        .await?;
    Ok(Json(author_dto(&author)))
}

// ---------------------------------------------------------------- preview

async fn preview(_: Admin, Json(req): Json<PreviewRequest>) -> ApiResult<PreviewResponse> {
    if req.markdown.len() > api::MAX_MARKDOWN_LEN {
        return Err(ApiErr::Invalid("The post is too long (over 1 MB).".into()));
    }
    // KaTeX rendering is CPU work; keep it off the async worker threads.
    let r = tokio::task::spawn_blocking(move || render::render(&req.markdown))
        .await
        .map_err(|e| ApiErr::Internal(e.into()))?;
    Ok(Json(PreviewResponse {
        html: r.html,
        excerpt_html: r.excerpt_html,
        links: r.links,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn author(name: &str) -> AuthorInput {
        AuthorInput {
            name: name.into(),
            ..Default::default()
        }
    }

    #[test]
    fn author_slug_comes_from_name() {
        let v = validate_author(author("  Ada Lovelace ")).unwrap();
        assert_eq!(v.name, "Ada Lovelace");
        assert_eq!(v.slug, "ada-lovelace");
    }

    #[test]
    fn author_empty_fields_become_none() {
        let mut input = author("A");
        input.email = Some("   ".into());
        input.linkedin = Some(String::new());
        let v = validate_author(input).unwrap();
        assert_eq!(v.email, None);
        assert_eq!(v.linkedin, None);
    }

    #[test]
    fn author_rejects_bad_links() {
        for (email, linkedin, avatar) in [
            (Some("not-an-email"), None, None),
            (Some("a b@c.de"), None, None),
            (None, Some("javascript:alert(1)"), None),
            (None, Some("http://linkedin.com/in/x"), None),
            (None, None, Some("javascript:alert(1)")),
        ] {
            let mut input = author("A");
            input.email = email.map(Into::into);
            input.linkedin = linkedin.map(Into::into);
            input.avatar = avatar.map(Into::into);
            assert!(
                validate_author(input).is_err(),
                "{email:?} {linkedin:?} {avatar:?}"
            );
        }
    }
}
