//! Helpers for tests that need MongoDB.
//!
//! Set `TEST_MONGODB_URI` (e.g. `mongodb://localhost:27017`) to run them;
//! without it they are skipped with a message. CI always sets it. Each test
//! gets its own database, dropped at the end.

#![allow(dead_code)]

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use mongodb::bson::oid::ObjectId;
use server::{AppState, Config, Db, app, auth};
use tower::ServiceExt;

pub const PASSWORD: &str = "a long test password";

pub struct TestApp {
    pub router: Router,
    pub db: Db,
    pub state: Arc<AppState>,
    database: mongodb::Database,
}

impl TestApp {
    /// A fresh app with an empty database and the admin password set, or
    /// `None` when no test database is configured.
    pub async fn new() -> Option<Self> {
        let Ok(uri) = std::env::var("TEST_MONGODB_URI") else {
            eprintln!("skipped: set TEST_MONGODB_URI to run database tests");
            return None;
        };
        let name = format!("portfolio_test_{}", ObjectId::new().to_hex());
        let client = mongodb::Client::with_uri_str(&uri).await.expect("connect");
        let database = client.database(&name);
        let db = Db::new(&database);
        db.ensure_indexes().await.expect("indexes");
        auth::set_admin_password(&db, PASSWORD)
            .await
            .expect("password");
        let state = Arc::new(AppState::new(Config::for_tests(&uri, &name), db.clone()));
        Some(Self {
            router: app(state.clone()),
            db,
            state,
            database,
        })
    }

    pub async fn finish(self) {
        self.database.drop().await.expect("drop test database");
    }

    pub async fn request(
        &self,
        method: &str,
        uri: &str,
        token: Option<&str>,
        body: Option<serde_json::Value>,
    ) -> (StatusCode, serde_json::Value, axum::http::HeaderMap) {
        let mut req = Request::builder().method(method).uri(uri);
        if let Some(t) = token {
            req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
        }
        let req = match body {
            Some(b) => req
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(b.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap();
        let res = self.router.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let headers = res.headers().clone();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        let json = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| serde_json::Value::String(String::from_utf8_lossy(&bytes).into()));
        (status, json, headers)
    }

    pub async fn get_html(&self, uri: &str) -> (StatusCode, String) {
        let (status, body, _) = self.request("GET", uri, None, None).await;
        (status, body.as_str().unwrap_or_default().to_owned())
    }

    pub async fn login(&self) -> String {
        let (status, body, _) = self
            .request(
                "POST",
                "/api/login",
                None,
                Some(serde_json::json!({ "password": PASSWORD })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        body["token"].as_str().unwrap().to_owned()
    }
}
