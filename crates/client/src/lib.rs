//! A client for the site's admin API, used by the Mac app.
//!
//! Calls are blocking; the app runs them on a background thread so the UI
//! never waits on the network.

use std::time::Duration;

use api::{
    ApiError, AuthorDto, AuthorInput, LoginRequest, LoginResponse, PostDetail, PostInput,
    PostSummary, PreviewRequest, PreviewResponse,
};
use reqwest::StatusCode;
use reqwest::blocking::{Client as Http, RequestBuilder, Response};
use serde::de::DeserializeOwned;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Error {
    /// The token is missing, wrong or expired: log in again.
    #[error("You are not logged in, or your login expired.")]
    Unauthorized,
    /// The server refused the request and said why.
    #[error("{message}")]
    Api { status: u16, message: String },
    /// The server could not be reached.
    #[error("Could not reach the server: {0}")]
    Network(String),
    /// The server answered with something unexpected.
    #[error("Unexpected answer from the server: {0}")]
    Decode(String),
    /// The site address is not usable.
    #[error("{0}")]
    BadAddress(String),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone)]
pub struct Client {
    base_url: String,
    token: Option<String>,
    http: Http,
}

impl Client {
    /// A client for the site at `base_url`, e.g. `https://example.com`.
    /// Plain `http://` is only accepted for `localhost`, so the password and
    /// token are never sent unencrypted over the internet.
    pub fn new(base_url: &str) -> Result<Self> {
        let base_url = normalize_base_url(base_url)?;
        let http = Http::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("portfolio-studio/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| Error::Network(e.to_string()))?;
        Ok(Self {
            base_url,
            token: None,
            http,
        })
    }

    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    /// Logs in and keeps the token for later calls.
    pub fn login(&mut self, password: &str) -> Result<LoginResponse> {
        let req = self.http.post(self.url("/api/login")).json(&LoginRequest {
            password: password.to_owned(),
        });
        let res: LoginResponse = decode(send(req)?)?;
        self.token = Some(res.token.clone());
        Ok(res)
    }

    pub fn logout(&mut self) -> Result<()> {
        let res = send(self.authed(self.http.post(self.url("/api/logout"))));
        self.token = None;
        res.map(|_| ())
    }

    pub fn list_posts(&self) -> Result<Vec<PostSummary>> {
        self.get("/api/posts")
    }

    pub fn get_post(&self, id: &str) -> Result<PostDetail> {
        self.get(&format!("/api/posts/{}", path_segment(id)?))
    }

    pub fn create_post(&self, input: &PostInput) -> Result<PostDetail> {
        decode(send(
            self.authed(self.http.post(self.url("/api/posts")).json(input)),
        )?)
    }

    pub fn update_post(&self, id: &str, input: &PostInput) -> Result<PostDetail> {
        let url = self.url(&format!("/api/posts/{}", path_segment(id)?));
        decode(send(self.authed(self.http.put(url).json(input)))?)
    }

    pub fn delete_post(&self, id: &str) -> Result<()> {
        let url = self.url(&format!("/api/posts/{}", path_segment(id)?));
        send(self.authed(self.http.delete(url))).map(|_| ())
    }

    pub fn publish_post(&self, id: &str) -> Result<PostDetail> {
        self.post_empty(&format!("/api/posts/{}/publish", path_segment(id)?))
    }

    pub fn unpublish_post(&self, id: &str) -> Result<PostDetail> {
        self.post_empty(&format!("/api/posts/{}/unpublish", path_segment(id)?))
    }

    pub fn list_authors(&self) -> Result<Vec<AuthorDto>> {
        self.get("/api/authors")
    }

    pub fn create_author(&self, input: &AuthorInput) -> Result<AuthorDto> {
        decode(send(
            self.authed(self.http.post(self.url("/api/authors")).json(input)),
        )?)
    }

    pub fn update_author(&self, id: &str, input: &AuthorInput) -> Result<AuthorDto> {
        let url = self.url(&format!("/api/authors/{}", path_segment(id)?));
        decode(send(self.authed(self.http.put(url).json(input)))?)
    }

    pub fn preview(&self, markdown: &str) -> Result<PreviewResponse> {
        let req = self
            .http
            .post(self.url("/api/preview"))
            .json(&PreviewRequest {
                markdown: markdown.to_owned(),
            });
        decode(send(self.authed(req))?)
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }

    fn authed(&self, req: RequestBuilder) -> RequestBuilder {
        match &self.token {
            Some(t) => req.bearer_auth(t),
            None => req,
        }
    }

    fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        decode(send(self.authed(self.http.get(self.url(path))))?)
    }

    fn post_empty<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        decode(send(self.authed(self.http.post(self.url(path))))?)
    }
}

fn send(req: RequestBuilder) -> Result<Response> {
    let res = req.send().map_err(|e| Error::Network(e.to_string()))?;
    let status = res.status();
    if status.is_success() {
        return Ok(res);
    }
    if status == StatusCode::UNAUTHORIZED {
        return Err(Error::Unauthorized);
    }
    let text = res.text().unwrap_or_default();
    let message = serde_json::from_str::<ApiError>(&text)
        .map(|e| e.error)
        .unwrap_or_else(|_| format!("The server answered {status}."));
    Err(Error::Api {
        status: status.as_u16(),
        message,
    })
}

fn decode<T: DeserializeOwned>(res: Response) -> Result<T> {
    let text = res.text().map_err(|e| Error::Network(e.to_string()))?;
    serde_json::from_str(&text).map_err(|e| Error::Decode(e.to_string()))
}

/// Ids go into URL paths; only accept the hex ids the server hands out.
fn path_segment(id: &str) -> Result<&str> {
    if !id.is_empty() && id.bytes().all(|b| b.is_ascii_hexdigit()) {
        Ok(id)
    } else {
        Err(Error::Api {
            status: 404,
            message: "Not found.".into(),
        })
    }
}

/// Trims, removes trailing slashes, adds `https://` when no scheme is
/// given, and refuses plain `http://` except for local addresses.
pub fn normalize_base_url(input: &str) -> Result<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(Error::BadAddress("Enter the site's address.".into()));
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };
    let url = reqwest::Url::parse(&with_scheme)
        .map_err(|_| Error::BadAddress(format!("{input:?} is not a web address.")))?;
    let host = url.host_str().unwrap_or_default();
    let local = matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1");
    match url.scheme() {
        "https" => {}
        "http" if local => {}
        "http" => {
            return Err(Error::BadAddress(
                "Use https:// so your password is sent encrypted.".into(),
            ));
        }
        _ => return Err(Error::BadAddress("Use an https:// address.".into())),
    }
    if !url.path().trim_end_matches('/').is_empty() || url.query().is_some() {
        return Err(Error::BadAddress(
            "Use just the site's address, without a path.".into(),
        ));
    }
    // Rebuilt from the parsed parts, so odd input can't sneak through.
    Ok(url.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_urls() {
        assert_eq!(
            normalize_base_url(" example.com/ ").unwrap(),
            "https://example.com"
        );
        assert_eq!(
            normalize_base_url("https://example.com").unwrap(),
            "https://example.com"
        );
        assert_eq!(
            normalize_base_url("http://localhost:3000").unwrap(),
            "http://localhost:3000"
        );
        assert_eq!(
            normalize_base_url("http://127.0.0.1:3000/").unwrap(),
            "http://127.0.0.1:3000"
        );
        // Regression: "https://" used to become "https://https:".
        for bad in [
            "",
            "http://example.com",
            "ftp://example.com",
            "https://example.com/blog",
            "https://",
        ] {
            assert!(normalize_base_url(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn ids_must_be_hex() {
        assert!(path_segment("65f0a1").is_ok());
        assert!(path_segment("../login").is_err());
        assert!(path_segment("").is_err());
    }
}
