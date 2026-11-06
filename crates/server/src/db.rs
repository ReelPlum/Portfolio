//! MongoDB collections and the queries the pages need.

use chrono::{DateTime, Utc};
use futures_util::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId};
use mongodb::options::IndexOptions;
use mongodb::{Collection, Database, IndexModel};
use serde::{Deserialize, Serialize};

/// A person credited on posts. Authors are profiles, not accounts: only the
/// site owner logs in (through the Mac app).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Author {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub bio: String,
    /// Path or URL of the profile picture.
    #[serde(default)]
    pub avatar: Option<String>,
    /// Shown as a mail link that opens the visitor's mail app.
    #[serde(default)]
    pub email: Option<String>,
    /// Full LinkedIn profile URL.
    #[serde(default)]
    pub linkedin: Option<String>,
    /// Any other links (GitHub, website, Google Scholar, ...).
    #[serde(default)]
    pub links: Vec<Link>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub label: String,
    pub url: String,
}

/// A blog post. Markdown is the source; the HTML fields are rendered by the
/// `render` crate when the post is saved.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    /// Left out of feed queries (see `Db::feed`), hence the defaults.
    #[serde(default)]
    pub markdown: String,
    #[serde(default)]
    pub html: String,
    pub excerpt_html: String,
    #[serde(default)]
    pub has_math: bool,
    /// Whether the post contains Mermaid diagrams, so only those pages load
    /// the Mermaid script.
    #[serde(default)]
    pub has_mermaid: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    pub author_ids: Vec<ObjectId>,
    /// Slugs of posts this one links to with `[[slug]]`.
    #[serde(default)]
    pub links: Vec<String>,
    /// `None` while the post is a draft.
    #[serde(default, with = "opt_bson_datetime")]
    pub published_at: Option<DateTime<Utc>>,
    #[serde(with = "chrono_bson_datetime")]
    pub updated_at: DateTime<Utc>,
}

/// A post with its authors looked up, ready to show.
#[derive(Debug, Clone)]
pub struct PostView {
    pub post: Post,
    pub authors: Vec<Author>,
}

#[derive(Clone)]
pub struct Db {
    pub posts: Collection<Post>,
    pub authors: Collection<Author>,
}

pub const PAGE_SIZE: u64 = 10;

impl Db {
    pub fn new(db: &Database) -> Self {
        Self {
            posts: db.collection("posts"),
            authors: db.collection("authors"),
        }
    }

    pub async fn ensure_indexes(&self) -> mongodb::error::Result<()> {
        let unique = || IndexOptions::builder().unique(true).build();
        self.posts
            .create_indexes([
                IndexModel::builder()
                    .keys(doc! { "slug": 1 })
                    .options(unique())
                    .build(),
                IndexModel::builder()
                    .keys(doc! { "published_at": -1 })
                    .build(),
                IndexModel::builder()
                    .keys(doc! { "tags": 1, "published_at": -1 })
                    .build(),
                IndexModel::builder()
                    .keys(doc! { "author_ids": 1, "published_at": -1 })
                    .build(),
            ])
            .await?;
        self.authors
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "slug": 1 })
                    .options(unique())
                    .build(),
            )
            .await?;
        Ok(())
    }

    /// Published posts, newest first, matching `filter` (e.g. a tag or author).
    pub async fn feed(
        &self,
        filter: mongodb::bson::Document,
        page: u64,
    ) -> mongodb::error::Result<(Vec<PostView>, bool)> {
        let mut query = doc! { "published_at": { "$ne": null } };
        query.extend(filter);
        let posts: Vec<Post> = self
            .posts
            .find(query)
            .sort(doc! { "published_at": -1 })
            .skip(page.saturating_sub(1) * PAGE_SIZE)
            // One extra tells us whether there is a next page.
            .limit(PAGE_SIZE as i64 + 1)
            .projection(doc! { "markdown": 0, "html": 0 })
            .await?
            .try_collect()
            .await?;
        let has_more = posts.len() as u64 > PAGE_SIZE;
        let posts: Vec<Post> = posts.into_iter().take(PAGE_SIZE as usize).collect();
        Ok((self.with_authors(posts).await?, has_more))
    }

    pub async fn post_by_slug(&self, slug: &str) -> mongodb::error::Result<Option<PostView>> {
        let post = self
            .posts
            .find_one(doc! { "slug": slug, "published_at": { "$ne": null } })
            .await?;
        Ok(match post {
            Some(post) => self.with_authors(vec![post]).await?.pop(),
            None => None,
        })
    }

    pub async fn author_by_slug(&self, slug: &str) -> mongodb::error::Result<Option<Author>> {
        self.authors.find_one(doc! { "slug": slug }).await
    }

    async fn with_authors(&self, posts: Vec<Post>) -> mongodb::error::Result<Vec<PostView>> {
        let mut ids: Vec<ObjectId> = posts.iter().flat_map(|p| p.author_ids.clone()).collect();
        ids.sort();
        ids.dedup();
        let authors: Vec<Author> = self
            .authors
            .find(doc! { "_id": { "$in": ids } })
            .await?
            .try_collect()
            .await?;
        Ok(posts
            .into_iter()
            .map(|post| {
                // Keep the order the post lists its authors in.
                let authors = post
                    .author_ids
                    .iter()
                    .filter_map(|id| authors.iter().find(|a| &a.id == id).cloned())
                    .collect();
                PostView { post, authors }
            })
            .collect())
    }
}

mod chrono_bson_datetime {
    use chrono::{DateTime, Utc};
    use mongodb::bson;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(value: &DateTime<Utc>, s: S) -> Result<S::Ok, S::Error> {
        bson::DateTime::from_chrono(*value).serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<DateTime<Utc>, D::Error> {
        Ok(bson::DateTime::deserialize(d)?.to_chrono())
    }
}

mod opt_bson_datetime {
    use chrono::{DateTime, Utc};
    use mongodb::bson;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(
        value: &Option<DateTime<Utc>>,
        s: S,
    ) -> Result<S::Ok, S::Error> {
        value.map(bson::DateTime::from_chrono).serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<DateTime<Utc>>, D::Error> {
        Ok(Option::<bson::DateTime>::deserialize(d)?.map(|dt| dt.to_chrono()))
    }
}
