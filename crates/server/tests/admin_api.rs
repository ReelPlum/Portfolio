//! End-to-end tests of the admin API and the public pages it feeds.

mod common;

use axum::http::StatusCode;
use common::{PASSWORD, TestApp};
use serde_json::json;

macro_rules! app {
    () => {
        match TestApp::new().await {
            Some(app) => app,
            None => return,
        }
    };
}

async fn make_author(app: &TestApp, token: &str, name: &str) -> String {
    let (status, body, _) = app
        .request(
            "POST",
            "/api/authors",
            Some(token),
            Some(json!({ "name": name, "email": "a@b.dk" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    body["id"].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn login_with_right_and_wrong_password() {
    let app = app!();
    let (status, body, headers) = app
        .request(
            "POST",
            "/api/login",
            None,
            Some(json!({ "password": "wrong" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(body["error"].is_string());
    assert_eq!(headers["cache-control"], "no-store");

    let token = app.login().await;
    assert_eq!(token.len(), 64);
    let (status, _, _) = app.request("GET", "/api/posts", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK);
    app.finish().await;
}

#[tokio::test]
async fn api_requires_a_valid_token() {
    let app = app!();
    for (method, uri) in [
        ("GET", "/api/posts"),
        ("POST", "/api/posts"),
        ("GET", "/api/authors"),
        ("POST", "/api/preview"),
        ("POST", "/api/logout"),
    ] {
        let body = (method == "POST").then(|| json!({}));
        let (status, _, _) = app.request(method, uri, None, body.clone()).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "{method} {uri} without token"
        );
        let (status, _, _) = app.request(method, uri, Some("made-up"), body).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "{method} {uri} with a fake token"
        );
    }
    app.finish().await;
}

#[tokio::test]
async fn logout_and_password_change_revoke_tokens() {
    let app = app!();
    let a = app.login().await;
    let b = app.login().await;
    let (status, _, _) = app.request("POST", "/api/logout", Some(&a), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _, _) = app.request("GET", "/api/posts", Some(&a), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "logged out token");
    let (status, _, _) = app.request("GET", "/api/posts", Some(&b), None).await;
    assert_eq!(status, StatusCode::OK, "other sessions stay");

    server::auth::set_admin_password(&app.db, "another long password")
        .await
        .unwrap();
    let (status, _, _) = app.request("GET", "/api/posts", Some(&b), None).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "password change signs everyone out"
    );
    app.finish().await;
}

#[tokio::test]
async fn short_passwords_are_refused() {
    let app = app!();
    assert!(
        server::auth::set_admin_password(&app.db, "short")
            .await
            .is_err()
    );
    let (status, _, _) = app
        .request(
            "POST",
            "/api/login",
            None,
            Some(json!({ "password": PASSWORD })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "old password still works");
    app.finish().await;
}

#[tokio::test]
async fn failed_logins_are_rate_limited() {
    let app = app!();
    for _ in 0..server::auth::LoginLimiter::PER_IP {
        let (status, _, _) = app
            .request(
                "POST",
                "/api/login",
                None,
                Some(json!({ "password": "nope" })),
            )
            .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    let (status, _, _) = app
        .request(
            "POST",
            "/api/login",
            None,
            Some(json!({ "password": PASSWORD })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "even the right password waits"
    );
    app.finish().await;
}

#[tokio::test]
async fn draft_publish_unpublish_cycle() {
    let app = app!();
    let token = app.login().await;
    let ada = make_author(&app, &token, "Ada Lovelace").await;
    let alan = make_author(&app, &token, "Alan Turing").await;

    let (status, post, _) = app
        .request(
            "POST",
            "/api/posts",
            Some(&token),
            Some(json!({
                "title": "  Hello World  ",
                "markdown": "Intro with $x^2$.\n\n<!-- more -->\n\nRest.",
                "tags": ["Rust", " rust ", "Web Dev"],
                "author_ids": [ada, alan, ada],
            })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{post}");
    assert_eq!(post["slug"], "hello-world");
    assert_eq!(post["title"], "Hello World");
    assert_eq!(post["tags"], json!(["rust", "web-dev"]));
    assert_eq!(
        post["author_ids"],
        json!([ada, alan]),
        "duplicates removed, order kept"
    );
    assert!(post["published_at"].is_null(), "new posts are drafts");
    let id = post["id"].as_str().unwrap().to_owned();

    let (status, _) = app.get_html("/posts/hello-world").await;
    assert_eq!(status, StatusCode::NOT_FOUND, "drafts are not public");
    let (_, feed) = app.get_html("/").await;
    assert!(!feed.contains("Hello World"));

    let (status, post, _) = app
        .request(
            "POST",
            &format!("/api/posts/{id}/publish"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let first_published = post["published_at"].clone();
    assert!(first_published.is_string());

    let (status, page) = app.get_html("/posts/hello-world").await;
    assert_eq!(status, StatusCode::OK);
    assert!(page.contains("Ada Lovelace") && page.contains("Alan Turing"));
    assert!(page.contains("class=\"katex\""), "maths rendered on save");
    assert!(page.contains("katex.min.css"));
    let (_, feed) = app.get_html("/").await;
    assert!(feed.contains("Hello World") && feed.contains("Intro with") && !feed.contains("Rest."));

    // Publishing again keeps the original date.
    let (_, post, _) = app
        .request(
            "POST",
            &format!("/api/posts/{id}/publish"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(post["published_at"], first_published);

    let (_, post, _) = app
        .request(
            "POST",
            &format!("/api/posts/{id}/unpublish"),
            Some(&token),
            None,
        )
        .await;
    assert!(post["published_at"].is_null());
    let (status, _) = app.get_html("/posts/hello-world").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    app.finish().await;
}

#[tokio::test]
async fn update_rerenders_and_keeps_publish_state() {
    let app = app!();
    let token = app.login().await;
    let ada = make_author(&app, &token, "Ada").await;
    let (_, post, _) = app
        .request(
            "POST",
            "/api/posts",
            Some(&token),
            Some(json!({
                "title": "First", "markdown": "Old text", "author_ids": [ada]
            })),
        )
        .await;
    let id = post["id"].as_str().unwrap().to_owned();
    app.request(
        "POST",
        &format!("/api/posts/{id}/publish"),
        Some(&token),
        None,
    )
    .await;

    let (status, post, _) = app
        .request(
            "PUT",
            &format!("/api/posts/{id}"),
            Some(&token),
            Some(json!({
                "title": "First", "slug": "renamed", "markdown": "New **text**", "author_ids": [ada]
            })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{post}");
    assert!(post["published_at"].is_string(), "still published");
    let (status, page) = app.get_html("/posts/renamed").await;
    assert_eq!(status, StatusCode::OK);
    assert!(page.contains("<strong>text</strong>"));
    let (status, _) = app.get_html("/posts/first").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, got, _) = app
        .request("GET", &format!("/api/posts/{id}"), Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(got["markdown"], "New **text**");
    app.finish().await;
}

#[tokio::test]
async fn invalid_posts_are_rejected() {
    let app = app!();
    let token = app.login().await;
    let ada = make_author(&app, &token, "Ada").await;
    let cases = [
        json!({ "title": "  ", "markdown": "x", "author_ids": [ada] }),
        json!({ "title": "x".repeat(201), "markdown": "x", "author_ids": [ada] }),
        json!({ "title": "Ok", "slug": "Bad Slug", "markdown": "x", "author_ids": [ada] }),
        json!({ "title": "Ok", "markdown": "x", "author_ids": [] }),
        json!({ "title": "Ok", "markdown": "x", "author_ids": ["not-an-id"] }),
        json!({ "title": "Ok", "markdown": "x", "author_ids": ["65f000000000000000000000"] }),
        json!({ "title": "!!!", "markdown": "x", "author_ids": [ada] }),
    ];
    for case in cases {
        let (status, body, _) = app
            .request("POST", "/api/posts", Some(&token), Some(case.clone()))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{case} → {body}");
        assert!(body["error"].as_str().is_some_and(|e| !e.is_empty()));
    }
    app.finish().await;
}

#[tokio::test]
async fn duplicate_slugs_conflict() {
    let app = app!();
    let token = app.login().await;
    let ada = make_author(&app, &token, "Ada").await;
    let body = json!({ "title": "Same", "markdown": "x", "author_ids": [ada] });
    let (status, _, _) = app
        .request("POST", "/api/posts", Some(&token), Some(body.clone()))
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let (status, err, _) = app
        .request("POST", "/api/posts", Some(&token), Some(body))
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{err}");
    let (status, _, _) = app
        .request(
            "POST",
            "/api/authors",
            Some(&token),
            Some(json!({ "name": "Ada" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    app.finish().await;
}

#[tokio::test]
async fn unknown_ids_are_not_found() {
    let app = app!();
    let token = app.login().await;
    for (method, uri) in [
        ("GET", "/api/posts/65f000000000000000000000"),
        ("GET", "/api/posts/garbage"),
        ("DELETE", "/api/posts/65f000000000000000000000"),
        ("POST", "/api/posts/65f000000000000000000000/publish"),
    ] {
        let (status, _, _) = app.request(method, uri, Some(&token), None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {uri}");
    }
    app.finish().await;
}

#[tokio::test]
async fn delete_removes_the_post() {
    let app = app!();
    let token = app.login().await;
    let ada = make_author(&app, &token, "Ada").await;
    let (_, post, _) = app
        .request(
            "POST",
            "/api/posts",
            Some(&token),
            Some(json!({ "title": "Gone", "markdown": "x", "author_ids": [ada] })),
        )
        .await;
    let id = post["id"].as_str().unwrap();
    // Regression: listing failed with a 500 once a post existed, because the
    // list leaves out `excerpt_html`, which was a required field.
    let (status, list, _) = app.request("GET", "/api/posts", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list[0]["title"], "Gone");
    let (status, _, _) = app
        .request("DELETE", &format!("/api/posts/{id}"), Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list, _) = app.request("GET", "/api/posts", Some(&token), None).await;
    assert_eq!(list, json!([]));
    app.finish().await;
}

#[tokio::test]
async fn authors_can_be_edited_and_appear_on_profiles() {
    let app = app!();
    let token = app.login().await;
    let id = make_author(&app, &token, "Grace Hopper").await;
    let (status, author, _) = app
        .request(
            "PUT",
            &format!("/api/authors/{id}"),
            Some(&token),
            Some(json!({
                "name": "Grace Hopper", "bio": "Compilers.", "email": "grace@navy.mil",
                "linkedin": "https://www.linkedin.com/in/grace"
            })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{author}");
    let (status, page) = app.get_html("/authors/grace-hopper").await;
    assert_eq!(status, StatusCode::OK);
    assert!(page.contains("mailto:grace@navy.mil"));
    assert!(page.contains("https://www.linkedin.com/in/grace"));
    assert!(page.contains("Compilers."));
    app.finish().await;
}

#[tokio::test]
async fn preview_renders_markdown() {
    let app = app!();
    let token = app.login().await;
    let (status, body, _) = app
        .request(
            "POST",
            "/api/preview",
            Some(&token),
            Some(json!({ "markdown": "# Hi\n\nSee [[other-post]]" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["html"].as_str().unwrap().contains("<h1"));
    assert_eq!(body["links"], json!(["other-post"]));
    app.finish().await;
}

#[tokio::test]
async fn oversized_bodies_are_refused() {
    let app = app!();
    let token = app.login().await;
    let huge = "x".repeat(api::MAX_MARKDOWN_LEN + 300 * 1024);
    let (status, _, _) = app
        .request(
            "POST",
            "/api/preview",
            Some(&token),
            Some(json!({ "markdown": huge })),
        )
        .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    app.finish().await;
}
