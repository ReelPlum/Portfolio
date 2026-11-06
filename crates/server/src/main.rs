//! The portfolio website.

mod components;
mod config;
mod db;
mod pages;
mod security;
mod seed;

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::http::StatusCode;
use axum::routing::get;
use tower_http::compression::CompressionLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::ServeDir;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::db::Db;

pub struct AppState {
    pub config: Config,
    pub db: Db,
}

pub fn app(state: Arc<AppState>) -> Router {
    let static_files = ServeDir::new(&state.config.static_dir);
    let router = Router::new()
        .route("/", get(pages::home))
        .route("/posts/{slug}", get(pages::post))
        .route("/tags/{tag}", get(pages::tag))
        .route("/authors/{slug}", get(pages::author))
        .route("/privacy", get(pages::privacy))
        .route("/healthz", get(|| async { "ok" }))
        .nest_service("/static", static_files)
        .fallback(pages::fallback)
        .with_state(state)
        .layer(CompressionLayer::new())
        .layer(RequestBodyLimitLayer::new(64 * 1024))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(10),
        ))
        .layer(TraceLayer::new_for_http());
    security::apply(router)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;
    let client = mongodb::Client::with_uri_str(&config.mongodb_uri).await?;
    let db = Db::new(&client.database(&config.mongodb_db));
    db.ensure_indexes().await?;

    if std::env::args().nth(1).as_deref() == Some("seed") {
        return seed::run(&db).await;
    }

    let addr = config.bind_addr;
    let state = Arc::new(AppState { config, db });
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{addr}");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
