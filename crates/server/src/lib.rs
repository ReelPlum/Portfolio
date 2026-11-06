//! The portfolio website: public pages plus the admin API used by the Mac app.

pub mod admin_api;
pub mod auth;
pub mod components;
pub mod config;
pub mod db;
pub mod pages;
pub mod security;
pub mod seed;

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::http::{HeaderValue, StatusCode, header};
use axum::routing::get;
use tower_http::compression::CompressionLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

pub use crate::config::Config;
pub use crate::db::Db;

pub struct AppState {
    pub config: Config,
    pub db: Db,
    pub login_limiter: auth::LoginLimiter,
}

impl AppState {
    pub fn new(config: Config, db: Db) -> Self {
        Self {
            config,
            db,
            login_limiter: auth::LoginLimiter::default(),
        }
    }
}

/// Largest request body for public pages (they take no uploads).
const PUBLIC_BODY_LIMIT: usize = 64 * 1024;
/// Largest request body for the admin API: a post plus JSON overhead.
const API_BODY_LIMIT: usize = api::MAX_MARKDOWN_LEN + 256 * 1024;

pub fn app(state: Arc<AppState>) -> Router {
    let static_files = ServeDir::new(&state.config.static_dir);
    let public = Router::new()
        .route("/", get(pages::home))
        .route("/posts/{slug}", get(pages::post))
        .route("/tags/{tag}", get(pages::tag))
        .route("/authors/{slug}", get(pages::author))
        .route("/privacy", get(pages::privacy))
        .route("/healthz", get(|| async { "ok" }))
        .nest_service("/static", static_files)
        .layer(RequestBodyLimitLayer::new(PUBLIC_BODY_LIMIT));

    let api = admin_api::routes()
        .layer(RequestBodyLimitLayer::new(API_BODY_LIMIT))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ));

    let router = public
        .merge(api)
        .fallback(pages::fallback)
        .with_state(state)
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(10),
        ))
        .layer(TraceLayer::new_for_http());
    security::apply(router)
}

/// Serves `router` on `listener`, passing each visitor's address to the
/// handlers (used for login rate limiting).
pub async fn serve(listener: tokio::net::TcpListener, router: Router) {
    if let Err(e) = axum::serve(
        listener,
        router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await
    {
        tracing::error!(error = %e, "server stopped");
    }
}
