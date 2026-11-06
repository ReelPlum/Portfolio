//! Reusable pieces of HTML. Each component is a plain function returning
//! `Markup`; pages are built by combining them. Maud escapes all text by
//! default, so only HTML produced by the `render` crate is inserted raw.

use chrono::{DateTime, Utc};
use maud::{DOCTYPE, Markup, PreEscaped, html};

use crate::db::{Author, PostView};

pub struct PageMeta<'a> {
    pub site_name: &'a str,
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub canonical: String,
    /// Loads KaTeX's stylesheet; only pages showing maths need it.
    pub math: bool,
    /// Loads Mermaid to draw diagrams; only pages with diagrams need it.
    pub mermaid: bool,
}

/// The outer page: head, header, main content and footer.
pub fn layout(meta: &PageMeta, content: Markup) -> Markup {
    let title = match meta.title {
        Some(t) => format!("{t} · {}", meta.site_name),
        None => meta.site_name.to_owned(),
    };
    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                meta name="color-scheme" content="light dark";
                title { (title) }
                @if let Some(d) = meta.description { meta name="description" content=(d); }
                link rel="canonical" href=(meta.canonical);
                meta property="og:title" content=(title);
                meta property="og:url" content=(meta.canonical);
                link rel="stylesheet" href="/static/site.css";
                link rel="stylesheet" href="/static/highlight.css";
                @if meta.math { link rel="stylesheet" href="/static/katex/katex.min.css"; }
                @if meta.mermaid {
                    script src="/static/mermaid/mermaid.min.js" defer {}
                    script src="/static/js/mermaid-init.js" defer {}
                }
            }
            body {
                (site_header(meta.site_name))
                main id="main" class="container" { (content) }
                (site_footer())
            }
        }
    }
}

pub fn site_header(site_name: &str) -> Markup {
    html! {
        header class="site-header" {
            div class="container site-header__inner" {
                a class="site-header__name" href="/" { (site_name) }
                nav aria-label="Main" {
                    a href="/" { "Feed" }
                }
            }
        }
    }
}

pub fn site_footer() -> Markup {
    html! {
        footer class="site-footer" {
            div class="container" {
                a href="/privacy" { "Privacy" }
                " · No cookies, no third-party trackers."
            }
        }
    }
}

/// Round profile picture, falling back to the author's initials.
pub fn avatar(author: &Author, size: u32) -> Markup {
    let style = format!("--size:{size}px");
    html! {
        @if let Some(src) = &author.avatar {
            img class="avatar" src=(src) alt="" width=(size) height=(size) style=(style) loading="lazy";
        } @else {
            span class="avatar avatar--initials" style=(style) aria-hidden="true" { (initials(&author.name)) }
        }
    }
}

/// Avatars and names of a post's authors, each linking to their profile.
pub fn author_line(authors: &[Author]) -> Markup {
    html! {
        div class="author-line" {
            div class="author-line__avatars" {
                @for a in authors { (avatar(a, 36)) }
            }
            div class="author-line__names" {
                @for (i, a) in authors.iter().enumerate() {
                    @if i > 0 { @if i + 1 == authors.len() { " and " } @else { ", " } }
                    a href={ "/authors/" (a.slug) } { (a.name) }
                }
            }
        }
    }
}

pub fn tag_list(tags: &[String]) -> Markup {
    html! {
        @if !tags.is_empty() {
            ul class="tags" aria-label="Tags" {
                @for t in tags {
                    li { a class="tag" href={ "/tags/" (t) } { "#" (t) } }
                }
            }
        }
    }
}

pub fn date(dt: &DateTime<Utc>) -> Markup {
    html! {
        time datetime=(dt.to_rfc3339()) { (dt.format("%-d %b %Y")) }
    }
}

/// A post in the feed: authors, date, title, tags, the excerpt and
/// "Read more".
pub fn post_card(view: &PostView) -> Markup {
    let post = &view.post;
    let href = format!("/posts/{}", post.slug);
    html! {
        article class="card post-card" {
            header class="post-card__head" {
                (author_line(&view.authors))
                @if let Some(p) = &post.published_at { span class="muted" { (date(p)) } }
            }
            h2 class="post-card__title" { a href=(href) { (post.title) } }
            div class="prose post-card__excerpt" { (PreEscaped(&post.excerpt_html)) }
            footer class="post-card__foot" {
                (tag_list(&post.tags))
                a class="read-more" href=(href) { "Read more" span aria-hidden="true" { " →" } }
            }
        }
    }
}

/// A list of post cards with "Newer" / "Older" links.
pub fn feed(views: &[PostView], page: u64, has_more: bool, base: &str) -> Markup {
    html! {
        @if views.is_empty() {
            p class="muted empty" { "No posts yet." }
        }
        div class="feed" {
            @for v in views { (post_card(v)) }
        }
        @if page > 1 || has_more {
            nav class="pager" aria-label="Pages" {
                @if page > 1 { a href={ (base) "?page=" (page - 1) } { "← Newer" } } @else { span {} }
                @if has_more { a href={ (base) "?page=" (page + 1) } { "Older →" } }
            }
        }
    }
}

/// The full post page.
pub fn post_page(view: &PostView) -> Markup {
    let post = &view.post;
    html! {
        article class="card post" {
            header class="post__head" {
                (author_line(&view.authors))
                @if let Some(p) = &post.published_at { span class="muted" { (date(p)) } }
                h1 { (post.title) }
                (tag_list(&post.tags))
            }
            div class="prose post__body" data-post=(post.id.to_hex()) { (PreEscaped(&post.html)) }
        }
    }
}

/// An author's profile header, shown above their posts.
pub fn author_profile(author: &Author) -> Markup {
    html! {
        section class="card profile" {
            (avatar(author, 96))
            div {
                h1 { (author.name) }
                @if !author.bio.is_empty() { p { (author.bio) } }
                ul class="profile__links" {
                    @if let Some(email) = &author.email {
                        li { a href={ "mailto:" (email) } { "Email" } }
                    }
                    @if let Some(url) = &author.linkedin {
                        li { a href=(url) rel="me noopener" { "LinkedIn" } }
                    }
                    @for l in &author.links { li { a href=(l.url) rel="me noopener" { (l.label) } } }
                }
            }
        }
    }
}

pub fn message_page(title: &str, text: &str) -> Markup {
    html! {
        section class="card message" {
            h1 { (title) }
            p { (text) }
            p { a href="/" { "Back to the feed" } }
        }
    }
}

fn initials(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|w| w.chars().next())
        .take(2)
        .flat_map(char::to_uppercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::oid::ObjectId;

    fn author(name: &str) -> Author {
        Author {
            id: ObjectId::new(),
            slug: render::slugify(name),
            name: name.into(),
            bio: String::new(),
            avatar: None,
            email: Some("a@example.com".into()),
            linkedin: None,
            links: vec![],
        }
    }

    #[test]
    fn initials_of_names() {
        assert_eq!(initials("Ada Lovelace"), "AL");
        assert_eq!(initials("plato"), "P");
    }

    #[test]
    fn author_line_joins_names() {
        let html = author_line(&[author("A B"), author("C D"), author("E F")]).into_string();
        assert!(html.contains("A B</a>, <a"), "{html}");
        assert!(html.contains("C D</a> and <a"), "{html}");
    }

    #[test]
    fn profile_has_mail_link() {
        let html = author_profile(&author("A B")).into_string();
        assert!(html.contains("href=\"mailto:a@example.com\""), "{html}");
    }

    #[test]
    fn text_is_escaped() {
        let html = author_profile(&author("<script>")).into_string();
        assert!(!html.contains("<script>"));
    }
}
