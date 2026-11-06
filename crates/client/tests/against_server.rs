//! Runs the client against a real server and MongoDB.
//! Needs `TEST_MONGODB_URI`; skipped without it.

use std::sync::Arc;

use api::{AuthorInput, PostInput};
use client::{Client, Error};
use mongodb::bson::oid::ObjectId;
use server::{AppState, Config, Db, app, auth};

const PASSWORD: &str = "client test password";

struct Running {
    url: String,
    runtime: tokio::runtime::Runtime,
    db_name: String,
    uri: String,
}

impl Running {
    fn start() -> Option<Self> {
        let Ok(uri) = std::env::var("TEST_MONGODB_URI") else {
            eprintln!("skipped: set TEST_MONGODB_URI to run database tests");
            return None;
        };
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        let db_name = format!("portfolio_client_test_{}", ObjectId::new().to_hex());
        let addr = runtime.block_on(async {
            let mongo = mongodb::Client::with_uri_str(&uri).await.unwrap();
            let db = Db::new(&mongo.database(&db_name));
            db.ensure_indexes().await.unwrap();
            auth::set_admin_password(&db, PASSWORD).await.unwrap();
            let state = Arc::new(AppState::new(Config::for_tests(&uri, &db_name), db));
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            tokio::spawn(async move {
                axum_serve(listener, state).await;
            });
            addr
        });
        Some(Self {
            url: format!("http://{addr}"),
            runtime,
            db_name,
            uri,
        })
    }

    fn finish(self) {
        self.runtime.block_on(async {
            let mongo = mongodb::Client::with_uri_str(&self.uri).await.unwrap();
            mongo.database(&self.db_name).drop().await.unwrap();
        });
    }
}

async fn axum_serve(listener: tokio::net::TcpListener, state: Arc<AppState>) {
    server::serve(listener, app(state)).await;
}

#[test]
fn full_publishing_flow() {
    let Some(srv) = Running::start() else { return };
    let mut c = Client::new(&srv.url).unwrap();

    assert_eq!(c.list_posts().unwrap_err(), Error::Unauthorized);
    assert_eq!(c.login("wrong password").unwrap_err(), Error::Unauthorized);
    c.login(PASSWORD).unwrap();
    assert!(c.token().is_some());

    let ada = c
        .create_author(&AuthorInput {
            name: "Ada Lovelace".into(),
            email: Some("ada@example.com".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(ada.slug, "ada-lovelace");

    let input = PostInput {
        title: "From the app".into(),
        markdown: "Hello *there*".into(),
        tags: vec!["Rust".into()],
        author_ids: vec![ada.id.clone()],
        ..Default::default()
    };
    let post = c.create_post(&input).unwrap();
    assert!(!post.is_published());
    assert_eq!(post.tags, vec!["rust"]);

    let published = c.publish_post(&post.id).unwrap();
    assert!(published.is_published());
    // Regression: the timestamp returned on publish must match what a later
    // read returns (MongoDB keeps milliseconds only).
    assert_eq!(
        c.get_post(&post.id).unwrap().published_at,
        published.published_at
    );

    let page = reqwest::blocking::get(format!("{}/posts/from-the-app", srv.url)).unwrap();
    assert_eq!(page.status(), 200);
    assert!(page.text().unwrap().contains("<em>there</em>"));

    let mut edit = input.clone();
    edit.title = String::new();
    match c.update_post(&post.id, &edit).unwrap_err() {
        Error::Api { status, message } => {
            assert_eq!(status, 422);
            assert!(message.contains("title"), "{message}");
        }
        other => panic!("unexpected {other:?}"),
    }

    let preview = c.preview("$$x$$").unwrap();
    assert!(preview.html.contains("katex"));

    assert_eq!(c.list_posts().unwrap().len(), 1);
    c.delete_post(&post.id).unwrap();
    assert!(c.list_posts().unwrap().is_empty());

    c.logout().unwrap();
    assert_eq!(c.list_posts().unwrap_err(), Error::Unauthorized);
    srv.finish();
}

#[test]
fn unreachable_server_is_a_network_error() {
    let c = Client::new("http://127.0.0.1:9").unwrap().with_token("x");
    assert!(matches!(c.list_posts(), Err(Error::Network(_))));
}
