//! Request handlers for the public pages.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use maud::{Markup, html};
use mongodb::bson::doc;
use serde::Deserialize;

use crate::components::{self as c, PageMeta};
use crate::{AppState, security};

#[derive(Deserialize)]
pub struct PageQuery {
    page: Option<u64>,
}

impl PageQuery {
    fn page(&self) -> u64 {
        self.page.unwrap_or(1).clamp(1, 10_000)
    }
}

type AppResult = Result<Response, AppError>;

fn meta<'a>(state: &'a AppState, path: &str, title: Option<&'a str>) -> PageMeta<'a> {
    PageMeta {
        site_name: &state.config.site_name,
        title,
        description: None,
        canonical: format!("{}{path}", state.config.site_url),
        math: false,
        mermaid: false,
    }
}

pub async fn home(State(state): State<Arc<AppState>>, Query(q): Query<PageQuery>) -> AppResult {
    let (views, more) = state.db.feed(doc! {}, q.page()).await?;
    let mut m = meta(&state, "/", None);
    m.math = views.iter().any(|v| v.post.has_math);
    Ok(c::layout(&m, c::feed(&views, q.page(), more, "/")).into_response())
}

pub async fn post(State(state): State<Arc<AppState>>, Path(slug): Path<String>) -> AppResult {
    let Some(view) = state.db.post_by_slug(&slug).await? else {
        return Ok(not_found(&state));
    };
    let path = format!("/posts/{slug}");
    let mut m = meta(&state, &path, Some(&view.post.title));
    m.math = view.post.has_math;
    m.mermaid = view.post.has_mermaid;
    if !view.post.summary.is_empty() {
        m.description = Some(&view.post.summary);
    }
    let page = c::layout(&m, c::post_page(&view));
    if view.post.has_mermaid {
        // Mermaid puts <style> elements inside the diagrams it draws.
        let csp = [(
            header::CONTENT_SECURITY_POLICY,
            security::CSP_WITH_INLINE_STYLES,
        )];
        return Ok((csp, page).into_response());
    }
    Ok(page.into_response())
}

pub async fn tag(
    State(state): State<Arc<AppState>>,
    Path(tag): Path<String>,
    Query(q): Query<PageQuery>,
) -> AppResult {
    let (views, more) = state.db.feed(doc! { "tags": &tag }, q.page()).await?;
    let path = format!("/tags/{tag}");
    let title = format!("#{tag}");
    let mut m = meta(&state, &path, Some(&title));
    m.math = views.iter().any(|v| v.post.has_math);
    let body = html! {
        h1 class="page-title" { (title) }
        (c::feed(&views, q.page(), more, &path))
    };
    Ok(c::layout(&m, body).into_response())
}

pub async fn author(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(q): Query<PageQuery>,
) -> AppResult {
    let Some(author) = state.db.author_by_slug(&slug).await? else {
        return Ok(not_found(&state));
    };
    let (views, more) = state
        .db
        .feed(doc! { "author_ids": author.id }, q.page())
        .await?;
    let path = format!("/authors/{slug}");
    let mut m = meta(&state, &path, Some(&author.name));
    m.math = views.iter().any(|v| v.post.has_math);
    let body = html! {
        (c::author_profile(&author))
        h2 class="section-title" { "Posts" }
        (c::feed(&views, q.page(), more, &path))
    };
    Ok(c::layout(&m, body).into_response())
}

pub async fn privacy(State(state): State<Arc<AppState>>) -> Response {
    let m = meta(&state, "/privacy", Some("Privacy"));
    c::layout(&m, privacy_text()).into_response()
}

fn privacy_text() -> Markup {
    html! {
        article class="card prose" {
            h1 { "Privacy" }
            p { "This site uses no cookies and no third-party trackers or fonts." }
            p { "Placeholder: the full policy (what is counted, why, and for how long) will be written together with the visitor statistics." }
        }
    }
}

pub async fn fallback(State(state): State<Arc<AppState>>) -> Response {
    not_found(&state)
}

fn not_found(state: &AppState) -> Response {
    let m = meta(state, "/", Some("Not found"));
    let body = c::message_page("Page not found", "There is nothing at this address.");
    (StatusCode::NOT_FOUND, c::layout(&m, body)).into_response()
}

/// Turns errors into a plain 500 page and logs the details, so internals
/// never reach the visitor.
pub struct AppError(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        tracing::error!(error = ?self.0, "request failed");
        let body = c::message_page("Something went wrong", "Please try again in a moment.");
        (StatusCode::INTERNAL_SERVER_ERROR, body).into_response()
    }
}
