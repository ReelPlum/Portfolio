//! Login for the Mac app.
//!
//! There is one admin (the site owner). Their password is stored as an
//! Argon2id hash. Logging in returns a random API token; only its SHA-256
//! hash is stored, so a database leak does not leak working tokens. Tokens
//! expire after [`TOKEN_LIFETIME_DAYS`] and are all revoked when the
//! password changes. Failed logins are rate limited per address and in total.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use argon2::Argon2;
use argon2::password_hash::rand_core::{OsRng, RngCore};
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use chrono::{DateTime, Utc};
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::AppState;
use crate::admin_api::ApiErr;
use crate::db::Db;

pub const TOKEN_LIFETIME_DAYS: i64 = 30;
pub const MIN_PASSWORD_LEN: usize = 12;

/// The admin's stored password, as one document with `_id: "admin"`.
#[derive(Debug, Serialize, Deserialize)]
pub struct AdminDoc {
    #[serde(rename = "_id")]
    pub id: String,
    pub password_hash: String,
}

/// A login session of the Mac app.
#[derive(Debug, Serialize, Deserialize)]
pub struct TokenDoc {
    /// SHA-256 of the token, hex encoded.
    #[serde(rename = "_id")]
    pub hash: String,
    pub created_at: mongodb::bson::DateTime,
    pub expires_at: mongodb::bson::DateTime,
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("hashing failed: {e}"))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

/// A new random token: 32 bytes from the OS, hex encoded.
pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// Sets the admin password and signs out every existing session.
pub async fn set_admin_password(db: &Db, password: &str) -> anyhow::Result<()> {
    anyhow::ensure!(
        password.chars().count() >= MIN_PASSWORD_LEN,
        "the password must be at least {MIN_PASSWORD_LEN} characters"
    );
    let doc = AdminDoc {
        id: "admin".into(),
        password_hash: hash_password(password)?,
    };
    db.admin
        .replace_one(doc! { "_id": "admin" }, &doc)
        .upsert(true)
        .await?;
    db.tokens.delete_many(doc! {}).await?;
    Ok(())
}

/// Checks the password and, if right, creates a token.
pub async fn login(db: &Db, password: &str) -> anyhow::Result<Option<(String, DateTime<Utc>)>> {
    let Some(admin) = db.admin.find_one(doc! { "_id": "admin" }).await? else {
        return Ok(None);
    };
    if !verify_password(password, &admin.password_hash) {
        return Ok(None);
    }
    let token = new_token();
    let now = Utc::now();
    let expires = now + chrono::Duration::days(TOKEN_LIFETIME_DAYS);
    db.tokens
        .insert_one(TokenDoc {
            hash: hash_token(&token),
            created_at: now.into(),
            expires_at: expires.into(),
        })
        .await?;
    Ok(Some((token, expires)))
}

pub async fn logout(db: &Db, token: &str) -> mongodb::error::Result<()> {
    db.tokens
        .delete_one(doc! { "_id": hash_token(token) })
        .await?;
    Ok(())
}

/// Proof that the request carries a valid, unexpired token. Add it as a
/// handler argument to require login.
pub struct Admin {
    pub token: String,
}

impl FromRequestParts<Arc<AppState>> for Admin {
    type Rejection = ApiErr;

    async fn from_request_parts(parts: &mut Parts, state: &Arc<AppState>) -> Result<Self, ApiErr> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or(ApiErr::Unauthorized)?;
        let now: mongodb::bson::DateTime = Utc::now().into();
        let found = state
            .db
            .tokens
            .find_one(doc! { "_id": hash_token(token), "expires_at": { "$gt": now } })
            .await
            .map_err(|e| ApiErr::Internal(e.into()))?;
        match found {
            Some(_) => Ok(Admin {
                token: token.to_owned(),
            }),
            None => Err(ApiErr::Unauthorized),
        }
    }
}

/// The address a request came from.
pub struct ClientIp(pub IpAddr);

impl FromRequestParts<Arc<AppState>> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let forwarded = state
            .config
            .trust_proxy
            .then(|| parts.headers.get("x-forwarded-for"))
            .flatten()
            .and_then(|v| v.to_str().ok())
            // Caddy appends the real address last; earlier entries can be forged.
            .and_then(|v| v.rsplit(',').next())
            .and_then(|v| v.trim().parse().ok());
        let direct = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip());
        Ok(ClientIp(
            forwarded
                .or(direct)
                .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED)),
        ))
    }
}

/// Limits failed logins: [`LoginLimiter::PER_IP`] per address and
/// [`LoginLimiter::TOTAL`] overall within [`LoginLimiter::WINDOW`].
#[derive(Default)]
pub struct LoginLimiter {
    failures: Mutex<HashMap<IpAddr, Vec<Instant>>>,
}

impl LoginLimiter {
    pub const PER_IP: usize = 5;
    pub const TOTAL: usize = 50;
    pub const WINDOW: Duration = Duration::from_secs(15 * 60);

    /// Whether `ip` may try to log in now.
    pub fn allowed(&self, ip: IpAddr) -> bool {
        self.allowed_at(ip, Instant::now())
    }

    pub fn record_failure(&self, ip: IpAddr) {
        self.record_failure_at(ip, Instant::now());
    }

    pub fn allowed_at(&self, ip: IpAddr, now: Instant) -> bool {
        let mut map = self.failures.lock().expect("limiter lock");
        prune(&mut map, now);
        let total: usize = map.values().map(Vec::len).sum();
        let mine = map.get(&ip).map_or(0, Vec::len);
        mine < Self::PER_IP && total < Self::TOTAL
    }

    pub fn record_failure_at(&self, ip: IpAddr, now: Instant) {
        let mut map = self.failures.lock().expect("limiter lock");
        map.entry(ip).or_default().push(now);
    }
}

fn prune(map: &mut HashMap<IpAddr, Vec<Instant>>, now: Instant) {
    map.retain(|_, times| {
        times.retain(|t| now.saturating_duration_since(*t) < LoginLimiter::WINDOW);
        !times.is_empty()
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_round_trip() {
        let hash = hash_password("correct horse battery").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password("correct horse battery", &hash));
        assert!(!verify_password("wrong", &hash));
        assert!(!verify_password("x", "not a hash"));
    }

    #[test]
    fn tokens_are_random_and_hashed() {
        let (a, b) = (new_token(), new_token());
        assert_ne!(a, b);
        assert_eq!(a.len(), 64);
        assert_eq!(hash_token(&a), hash_token(&a));
        assert_ne!(hash_token(&a), a);
    }

    #[test]
    fn limiter_blocks_after_failures_and_recovers() {
        let limiter = LoginLimiter::default();
        let ip: IpAddr = "10.0.0.1".parse().unwrap();
        let other: IpAddr = "10.0.0.2".parse().unwrap();
        let t0 = Instant::now();
        for _ in 0..LoginLimiter::PER_IP {
            assert!(limiter.allowed_at(ip, t0));
            limiter.record_failure_at(ip, t0);
        }
        assert!(!limiter.allowed_at(ip, t0));
        assert!(
            limiter.allowed_at(other, t0),
            "other addresses are unaffected"
        );
        assert!(limiter.allowed_at(ip, t0 + LoginLimiter::WINDOW));
    }

    #[test]
    fn limiter_caps_total_failures() {
        let limiter = LoginLimiter::default();
        let t0 = Instant::now();
        for i in 0..LoginLimiter::TOTAL {
            let ip = IpAddr::V4(Ipv4Addr::from(i as u32 + 1));
            limiter.record_failure_at(ip, t0);
        }
        assert!(!limiter.allowed_at("192.168.1.1".parse().unwrap(), t0));
    }
}
