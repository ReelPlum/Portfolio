//! Settings read from environment variables.

use std::net::SocketAddr;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    /// Shown in the header and page titles.
    pub site_name: String,
    /// Public address, e.g. `https://example.com`, used for canonical links.
    pub site_url: String,
    pub mongodb_uri: String,
    pub mongodb_db: String,
    pub bind_addr: SocketAddr,
    /// Folder with CSS, fonts and other static files.
    pub static_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let var =
            |name: &str, default: &str| std::env::var(name).unwrap_or_else(|_| default.to_owned());
        Ok(Self {
            site_name: var("SITE_NAME", "Portfolio"),
            site_url: var("SITE_URL", "http://localhost:3000")
                .trim_end_matches('/')
                .to_owned(),
            mongodb_uri: var("MONGODB_URI", "mongodb://localhost:27017"),
            mongodb_db: var("MONGODB_DB", "portfolio"),
            bind_addr: var("BIND_ADDR", "127.0.0.1:3000").parse()?,
            static_dir: var("STATIC_DIR", concat!(env!("CARGO_MANIFEST_DIR"), "/static")).into(),
        })
    }
}
