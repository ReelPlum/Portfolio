//! Runs the website.
//!
//! - `server`               serve the site
//! - `server seed`          add example authors and posts to an empty database
//! - `server set-password`  set the password the Mac app logs in with (read
//!   from the `ADMIN_PASSWORD` variable, or typed on standard input)

use std::sync::Arc;

use server::{AppState, Config, Db, app, auth, seed};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;
    let client = mongodb::Client::with_uri_str(&config.mongodb_uri).await?;
    let db = Db::new(&client.database(&config.mongodb_db));
    db.ensure_indexes().await?;

    match std::env::args().nth(1).as_deref() {
        Some("seed") => return seed::run(&db).await,
        Some("set-password") => {
            let password = match std::env::var("ADMIN_PASSWORD") {
                Ok(p) => p,
                Err(_) => {
                    eprintln!("Type the new admin password and press Enter:");
                    let mut line = String::new();
                    std::io::stdin().read_line(&mut line)?;
                    line.trim_end_matches(['\r', '\n']).to_owned()
                }
            };
            auth::set_admin_password(&db, &password).await?;
            println!("Password set. Existing app logins were signed out.");
            return Ok(());
        }
        Some(other) => anyhow::bail!("unknown command {other:?}"),
        None => {}
    }

    let addr = config.bind_addr;
    let state = Arc::new(AppState::new(config, db));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{addr}");
    server::serve(listener, app(state)).await;
    Ok(())
}
