//! JSON types for the admin API that the Mac app uses to manage the site.
//!
//! Every route lives under `/api` and, except for login, needs an
//! `Authorization: Bearer <token>` header.
//!
//! | Method | Path                          | Body            | Returns          |
//! |--------|-------------------------------|-----------------|------------------|
//! | POST   | /api/login                    | `LoginRequest`  | `LoginResponse`  |
//! | POST   | /api/logout                   |                 |                  |
//! | GET    | /api/posts                    |                 | `Vec<PostSummary>` |
//! | POST   | /api/posts                    | `PostInput`     | `PostDetail`     |
//! | GET    | /api/posts/{id}               |                 | `PostDetail`     |
//! | PUT    | /api/posts/{id}               | `PostInput`     | `PostDetail`     |
//! | DELETE | /api/posts/{id}               |                 |                  |
//! | POST   | /api/posts/{id}/publish       |                 | `PostDetail`     |
//! | POST   | /api/posts/{id}/unpublish     |                 | `PostDetail`     |
//! | GET    | /api/authors                  |                 | `Vec<AuthorDto>` |
//! | POST   | /api/authors                  | `AuthorInput`   | `AuthorDto`      |
//! | PUT    | /api/authors/{id}             | `AuthorInput`   | `AuthorDto`      |
//! | POST   | /api/preview                  | `PreviewRequest`| `PreviewResponse`|
//!
//! Errors come back with a 4xx/5xx status and an [`ApiError`] body.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

/// A post in the app's post list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PostSummary {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub tags: Vec<String>,
    pub author_ids: Vec<String>,
    /// `None` while the post is a draft.
    pub published_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

/// A post with its Markdown, for editing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PostDetail {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub markdown: String,
    pub tags: Vec<String>,
    pub author_ids: Vec<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

impl PostDetail {
    pub fn is_published(&self) -> bool {
        self.published_at.is_some()
    }
}

/// What the app sends to create or update a post.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PostInput {
    pub title: String,
    /// Left empty, the server makes one from the title.
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub summary: String,
    pub markdown: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub author_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorDto {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub bio: String,
    pub avatar: Option<String>,
    pub email: Option<String>,
    pub linkedin: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorInput {
    pub name: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub bio: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub linkedin: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreviewRequest {
    pub markdown: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreviewResponse {
    pub html: String,
    pub excerpt_html: String,
    pub links: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiError {
    pub error: String,
}

/// Longest allowed title, in characters.
pub const MAX_TITLE_LEN: usize = 200;
/// Largest allowed post body, in bytes.
pub const MAX_MARKDOWN_LEN: usize = 1024 * 1024;

/// Whether `slug` can be used in a URL: lowercase ASCII letters, digits and
/// single dashes, not starting or ending with a dash, at most 100 characters.
pub fn is_valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 100
        && !slug.starts_with('-')
        && !slug.ends_with('-')
        && !slug.contains("--")
        && slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Cleans up tags typed by a person: trims them, lowercases them, turns
/// spaces into dashes, drops empty ones and duplicates, and keeps the order.
pub fn normalize_tags<S: AsRef<str>>(tags: impl IntoIterator<Item = S>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in tags {
        let tag = tag
            .as_ref()
            .trim()
            .trim_start_matches('#')
            .to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-");
        if !tag.is_empty() && !out.contains(&tag) {
            out.push(tag);
        }
    }
    out
}

/// Splits a comma separated tag field, as typed in the app, into tags.
pub fn parse_tag_field(field: &str) -> Vec<String> {
    normalize_tags(field.split(','))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs() {
        assert!(is_valid_slug("hello-world-2"));
        for bad in [
            "",
            "-a",
            "a-",
            "a--b",
            "Hello",
            "a b",
            "a/b",
            "æ",
            &"a".repeat(101),
        ] {
            assert!(!is_valid_slug(bad), "{bad:?} should be invalid");
        }
    }

    #[test]
    fn tags_are_normalized() {
        assert_eq!(
            normalize_tags(["  Rust ", "rust", "#Machine Learning", "", "WASM"]),
            vec!["rust", "machine-learning", "wasm"]
        );
    }

    #[test]
    fn tag_field_is_split_on_commas() {
        assert_eq!(
            parse_tag_field("rust, web dev,,Rust"),
            vec!["rust", "web-dev"]
        );
        assert!(parse_tag_field("  ").is_empty());
    }
}
