//! The post list in the sidebar: search and the All / Drafts / Published
//! filter.

use api::PostSummary;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Filter {
    #[default]
    All,
    Drafts,
    Published,
}

impl Filter {
    pub const ALL: [Filter; 3] = [Filter::All, Filter::Drafts, Filter::Published];

    pub fn label(self) -> &'static str {
        match self {
            Filter::All => "All",
            Filter::Drafts => "Drafts",
            Filter::Published => "Published",
        }
    }

    fn matches(self, p: &PostSummary) -> bool {
        match self {
            Filter::All => true,
            Filter::Drafts => p.published_at.is_none(),
            Filter::Published => p.published_at.is_some(),
        }
    }
}

/// Posts matching `filter` and every word of `search` (in the title, slug or
/// tags, ignoring case), most recently edited first.
pub fn visible<'a>(posts: &'a [PostSummary], filter: Filter, search: &str) -> Vec<&'a PostSummary> {
    let words: Vec<String> = search.split_whitespace().map(str::to_lowercase).collect();
    let mut out: Vec<&PostSummary> = posts
        .iter()
        .filter(|p| filter.matches(p))
        .filter(|p| {
            let haystack = format!("{} {} {}", p.title, p.slug, p.tags.join(" ")).to_lowercase();
            words
                .iter()
                .all(|w| haystack.contains(w.trim_start_matches('#')))
        })
        .collect();
    out.sort_by_key(|p| std::cmp::Reverse(p.updated_at));
    out
}

/// Short status shown under each post title.
pub fn status_line(p: &PostSummary) -> String {
    match p.published_at {
        Some(at) => format!("Published {}", at.format("%-d %b %Y")),
        None => format!("Draft · edited {}", p.updated_at.format("%-d %b %Y")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};

    fn post(title: &str, tags: &[&str], published: bool, age_days: i64) -> PostSummary {
        let at = Utc::now() - Duration::days(age_days);
        PostSummary {
            id: title.into(),
            slug: render::slugify(title),
            title: title.into(),
            tags: tags.iter().map(|t| t.to_string()).collect(),
            author_ids: vec![],
            published_at: published.then_some(at),
            updated_at: at,
        }
    }

    #[test]
    fn filters_and_sorts() {
        let posts = vec![
            post("Old draft", &[], false, 9),
            post("New post", &["rust"], true, 1),
            post("Middle", &["math"], true, 5),
        ];
        let titles = |v: Vec<&PostSummary>| v.iter().map(|p| p.title.clone()).collect::<Vec<_>>();
        assert_eq!(
            titles(visible(&posts, Filter::All, "")),
            ["New post", "Middle", "Old draft"]
        );
        assert_eq!(titles(visible(&posts, Filter::Drafts, "")), ["Old draft"]);
        assert_eq!(
            titles(visible(&posts, Filter::Published, "")),
            ["New post", "Middle"]
        );
    }

    #[test]
    fn search_matches_all_words_in_title_slug_and_tags() {
        let posts = vec![
            post("Tree walking interpreter", &["rust"], true, 1),
            post("Notes", &["math"], false, 2),
        ];
        assert_eq!(visible(&posts, Filter::All, "TREE rust").len(), 1);
        assert_eq!(visible(&posts, Filter::All, "#math").len(), 1);
        assert!(visible(&posts, Filter::All, "tree math").is_empty());
    }

    #[test]
    fn status_lines() {
        assert!(status_line(&post("a", &[], true, 0)).starts_with("Published "));
        assert!(status_line(&post("a", &[], false, 0)).starts_with("Draft"));
    }
}
