//! The post being edited: its fields as typed, whether they differ from what
//! was last saved, and what to send to the server.

use api::{PostDetail, PostInput};

/// The editable fields of a post, as shown in the editor.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Fields {
    pub title: String,
    pub slug: String,
    pub summary: String,
    /// Comma separated, as typed.
    pub tags: String,
    pub markdown: String,
    pub author_ids: Vec<String>,
}

impl Fields {
    fn from_detail(p: &PostDetail) -> Self {
        Self {
            title: p.title.clone(),
            slug: p.slug.clone(),
            summary: p.summary.clone(),
            tags: p.tags.join(", "),
            markdown: p.markdown.clone(),
            author_ids: p.author_ids.clone(),
        }
    }

    /// Fields compared after the same clean-up the server does, so typing a
    /// space after a tag doesn't count as a change.
    fn normalized(&self) -> (String, String, String, Vec<String>, &str, &[String]) {
        (
            self.title.trim().to_owned(),
            self.slug.trim().to_owned(),
            self.summary.trim().to_owned(),
            api::parse_tag_field(&self.tags),
            &self.markdown,
            &self.author_ids,
        )
    }
}

/// A post open in the editor.
#[derive(Debug, Clone)]
pub struct Draft {
    /// `None` until the post is saved for the first time.
    pub id: Option<String>,
    pub fields: Fields,
    /// What the server has, to detect unsaved changes.
    saved: Fields,
    pub published: bool,
    /// Whether the slug was typed by hand. If not, it follows the title.
    slug_edited: bool,
}

impl Draft {
    /// A new, empty post credited to `default_authors`.
    pub fn new(default_authors: Vec<String>) -> Self {
        let fields = Fields {
            author_ids: default_authors,
            ..Fields::default()
        };
        Self {
            id: None,
            saved: fields.clone(),
            fields,
            published: false,
            slug_edited: false,
        }
    }

    pub fn from_detail(p: &PostDetail) -> Self {
        let fields = Fields::from_detail(p);
        Self {
            id: Some(p.id.clone()),
            saved: fields.clone(),
            slug_edited: fields.slug != render::slugify(&fields.title),
            fields,
            published: p.is_published(),
        }
    }

    /// Records a finished save. `sent` is what the fields were when the
    /// save started. If nothing was typed since, the editor shows the
    /// server's cleaned-up values (normalized tags, generated slug);
    /// otherwise the newer typing is kept and stays unsaved.
    pub fn mark_saved(&mut self, sent: &Fields, p: &PostDetail) {
        let typed_since = self.fields.normalized() != sent.normalized();
        self.id = Some(p.id.clone());
        self.published = p.is_published();
        self.saved = Fields::from_detail(p);
        if !typed_since {
            self.fields = self.saved.clone();
        }
    }

    /// Records a publish or unpublish, which changes nothing else.
    pub fn mark_published(&mut self, p: &PostDetail) {
        self.published = p.is_published();
    }

    pub fn is_new(&self) -> bool {
        self.id.is_none()
    }

    /// Whether there are changes that are not saved yet.
    pub fn is_dirty(&self) -> bool {
        self.fields.normalized() != self.saved.normalized()
    }

    pub fn set_title(&mut self, title: &str) {
        self.fields.title = title.to_owned();
        if !self.slug_edited {
            self.fields.slug = render::slugify(title);
        }
    }

    pub fn set_slug(&mut self, slug: &str) {
        self.fields.slug = slug.to_owned();
        // Clearing the slug hands it back to the title.
        self.slug_edited = !slug.trim().is_empty();
        if !self.slug_edited {
            self.fields.slug = render::slugify(&self.fields.title);
        }
    }

    pub fn toggle_author(&mut self, id: &str) {
        if let Some(i) = self.fields.author_ids.iter().position(|a| a == id) {
            self.fields.author_ids.remove(i);
        } else {
            self.fields.author_ids.push(id.to_owned());
        }
    }

    pub fn has_author(&self, id: &str) -> bool {
        self.fields.author_ids.iter().any(|a| a == id)
    }

    /// Problems to fix before saving, in plain words. Empty when ready.
    /// The server checks the same rules; this just answers faster.
    pub fn problems(&self) -> Vec<String> {
        let mut out = Vec::new();
        let title = self.fields.title.trim();
        if title.is_empty() {
            out.push("Add a title.".to_owned());
        } else if title.chars().count() > api::MAX_TITLE_LEN {
            out.push(format!(
                "Shorten the title to {} characters.",
                api::MAX_TITLE_LEN
            ));
        }
        let slug = self.effective_slug();
        if !title.is_empty() && !api::is_valid_slug(&slug) {
            out.push("Use only lowercase letters, digits and dashes in the slug.".to_owned());
        }
        if self.fields.author_ids.is_empty() {
            out.push("Pick at least one author.".to_owned());
        }
        if self.fields.markdown.len() > api::MAX_MARKDOWN_LEN {
            out.push("The post is over 1 MB; split it up.".to_owned());
        }
        out
    }

    fn effective_slug(&self) -> String {
        match self.fields.slug.trim() {
            "" => render::slugify(&self.fields.title),
            s => s.to_owned(),
        }
    }

    /// What to send to the server.
    pub fn to_input(&self) -> PostInput {
        PostInput {
            title: self.fields.title.trim().to_owned(),
            slug: self.effective_slug(),
            summary: self.fields.summary.trim().to_owned(),
            markdown: self.fields.markdown.clone(),
            tags: api::parse_tag_field(&self.fields.tags),
            author_ids: self.fields.author_ids.clone(),
        }
    }

    /// Path of the post on the website.
    pub fn public_path(&self) -> String {
        format!("/posts/{}", self.effective_slug())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn detail() -> PostDetail {
        PostDetail {
            id: "65f0".into(),
            slug: "hello-world".into(),
            title: "Hello World".into(),
            summary: String::new(),
            markdown: "Body".into(),
            tags: vec!["rust".into(), "web".into()],
            author_ids: vec!["a1".into()],
            published_at: None,
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn new_draft_is_clean_until_typed_in() {
        let mut d = Draft::new(vec!["a1".into()]);
        assert!(!d.is_dirty());
        d.set_title("Hi");
        assert!(d.is_dirty());
    }

    #[test]
    fn slug_follows_title_until_edited() {
        let mut d = Draft::new(vec![]);
        d.set_title("My First Post!");
        assert_eq!(d.fields.slug, "my-first-post");
        d.set_slug("custom");
        d.set_title("Changed");
        assert_eq!(d.fields.slug, "custom");
        d.set_slug("");
        assert_eq!(
            d.fields.slug, "changed",
            "clearing the slug links it to the title again"
        );
    }

    #[test]
    fn loaded_post_with_custom_slug_keeps_it() {
        let mut p = detail();
        p.slug = "hello".into();
        let mut d = Draft::from_detail(&p);
        d.set_title("Hello Again");
        assert_eq!(d.fields.slug, "hello");
    }

    #[test]
    fn loaded_post_with_generated_slug_follows_title() {
        let mut d = Draft::from_detail(&detail());
        d.set_title("Hello There");
        assert_eq!(d.fields.slug, "hello-there");
    }

    #[test]
    fn dirty_ignores_whitespace_and_tag_formatting() {
        let mut d = Draft::from_detail(&detail());
        assert!(!d.is_dirty());
        d.fields.tags = "Rust,  web ".into();
        d.fields.title = "Hello World ".into();
        assert!(!d.is_dirty(), "same after the server's clean-up");
        d.fields.markdown.push('!');
        assert!(d.is_dirty());
    }

    #[test]
    fn mark_saved_takes_server_values() {
        let mut d = Draft::new(vec!["a1".into()]);
        d.set_title("Hello World");
        d.fields.tags = "Rust, web".into();
        d.fields.markdown = "Body".into();
        let sent = d.fields.clone();
        d.mark_saved(&sent, &detail());
        assert_eq!(d.id.as_deref(), Some("65f0"));
        assert!(!d.is_dirty());
        assert_eq!(d.fields.tags, "rust, web");
    }

    #[test]
    fn mark_saved_keeps_typing_done_during_save() {
        let mut d = Draft::from_detail(&detail());
        let sent = d.fields.clone();
        // The save is in flight; the user keeps typing.
        d.fields.markdown = "Body and more".into();
        d.mark_saved(&sent, &detail());
        assert_eq!(d.fields.markdown, "Body and more");
        assert!(d.is_dirty());
    }

    #[test]
    fn problems_are_listed() {
        let mut d = Draft::new(vec![]);
        let p = d.problems();
        assert!(p.iter().any(|m| m.contains("title")));
        assert!(p.iter().any(|m| m.contains("author")));
        d.set_title("???");
        assert!(
            d.problems().iter().any(|m| m.contains("slug")),
            "title with no usable slug"
        );
        d.set_title("Fine");
        d.toggle_author("a1");
        assert!(d.problems().is_empty());
    }

    #[test]
    fn authors_toggle_in_order() {
        let mut d = Draft::new(vec!["a".into()]);
        d.toggle_author("b");
        d.toggle_author("c");
        d.toggle_author("a");
        assert_eq!(d.fields.author_ids, vec!["b", "c"]);
        assert!(d.has_author("c") && !d.has_author("a"));
    }

    #[test]
    fn input_is_cleaned_up() {
        let mut d = Draft::new(vec!["a1".into()]);
        d.set_title("  Spaced Title ");
        d.fields.tags = "One, two words,".into();
        let input = d.to_input();
        assert_eq!(input.title, "Spaced Title");
        assert_eq!(input.slug, "spaced-title");
        assert_eq!(input.tags, vec!["one", "two-words"]);
        assert_eq!(d.public_path(), "/posts/spaced-title");
    }
}
