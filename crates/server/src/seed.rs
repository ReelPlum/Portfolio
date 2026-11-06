//! `server seed`: fills an empty database with example authors and posts, for
//! trying the site locally before the Mac app can publish.

use chrono::{Duration, Utc};
use mongodb::bson::{doc, oid::ObjectId};

use crate::db::{Author, Db, Link, Post};

pub async fn run(db: &Db) -> anyhow::Result<()> {
    if db.posts.count_documents(doc! {}).await? > 0 {
        println!("The database already has posts; nothing seeded.");
        return Ok(());
    }

    let ada = Author {
        id: ObjectId::new(),
        slug: "ada-lovelace".into(),
        name: "Ada Lovelace".into(),
        bio: "Writes about analytical engines and the poetry of numbers.".into(),
        avatar: None,
        email: Some("ada@example.com".into()),
        linkedin: Some("https://www.linkedin.com/in/example".into()),
        links: vec![Link {
            label: "GitHub".into(),
            url: "https://github.com/example".into(),
        }],
    };
    let alan = Author {
        id: ObjectId::new(),
        slug: "alan-turing".into(),
        name: "Alan Turing".into(),
        bio: "Computability, morphogenesis and long-distance running.".into(),
        avatar: None,
        email: None,
        linkedin: None,
        links: vec![],
    };
    db.authors.insert_many([&ada, &alan]).await?;

    let samples = [
        (
            "Building a tree-walking interpreter",
            vec!["rust", "interpreters"],
            vec![ada.id],
            include_str!("../seed/interpreter.md"),
        ),
        (
            "Notes on computable numbers",
            vec!["math", "theory"],
            vec![alan.id, ada.id],
            include_str!("../seed/computable.md"),
        ),
    ];

    let now = Utc::now();
    for (i, (title, tags, authors, markdown)) in samples.into_iter().enumerate() {
        let r = render::render(markdown);
        let post = Post {
            id: ObjectId::new(),
            slug: render::slugify(title),
            title: title.into(),
            summary: String::new(),
            markdown: markdown.into(),
            html: r.html,
            excerpt_html: r.excerpt_html,
            has_math: r.has_math,
            has_mermaid: r.has_mermaid,
            tags: tags.into_iter().map(String::from).collect(),
            author_ids: authors,
            links: r.links,
            published_at: Some(now - Duration::days(i as i64 * 3)),
            updated_at: now,
        };
        db.posts.insert_one(&post).await?;
        println!("Seeded /posts/{}", post.slug);
    }
    Ok(())
}
