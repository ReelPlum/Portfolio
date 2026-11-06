//! Turns a post's Markdown into HTML.
//!
//! This crate is shared by the server and the Mac app, so the preview in the
//! app matches the website exactly. Rendering happens once, when a post is
//! saved; the server stores the result and serves it as-is.
//!
//! Supported: GitHub flavoured Markdown (tables, task lists, footnotes,
//! strikethrough, autolinks), heading anchors, `$…$` / `$$…$$` maths rendered
//! with KaTeX on the server, highlighted code blocks, and `[[post-slug]]`
//! links between posts.
//!
//! Raw HTML written in a post is escaped, never passed through, so a post can
//! not inject scripts into the site.

use std::collections::BTreeSet;
use std::sync::OnceLock;

use comrak::nodes::{NodeHtmlBlock, NodeValue};
use comrak::options::Plugins;
use comrak::plugins::syntect::{SyntectAdapter, SyntectAdapterBuilder};
use comrak::{Arena, Options, format_html_with_plugins, parse_document};
use serde::{Deserialize, Serialize};

/// Line in a post that marks where the feed excerpt ends.
pub const MORE_MARKER: &str = "<!-- more -->";

/// Number of top-level blocks used for the excerpt when a post has no
/// [`MORE_MARKER`].
const EXCERPT_BLOCKS: usize = 2;

/// The result of rendering one post.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rendered {
    /// The full post body.
    pub html: String,
    /// The start of the post, shown on feed cards above "Read more".
    pub excerpt_html: String,
    /// Slugs of other posts this post links to with `[[slug]]`, for the graph
    /// and "linked from" lists.
    pub links: Vec<String>,
    /// Whether the post contains maths, so pages only load KaTeX's CSS when
    /// needed.
    pub has_math: bool,
    /// Whether the post contains ```` ```mermaid ```` diagrams, so only those
    /// pages load the Mermaid script.
    pub has_mermaid: bool,
}

/// Renders a post's Markdown to HTML.
pub fn render(markdown: &str) -> Rendered {
    let (excerpt_md, has_marker) = match markdown.split_once(MORE_MARKER) {
        Some((before, _)) => (Some(before), true),
        None => (None, false),
    };

    let full = render_fragment(&markdown.replace(MORE_MARKER, ""), None);
    let excerpt = match excerpt_md {
        Some(md) if has_marker => render_fragment(md, None),
        _ => render_fragment(markdown, Some(EXCERPT_BLOCKS)),
    };

    Rendered {
        html: full.html,
        excerpt_html: excerpt.html,
        links: full.links.into_iter().collect(),
        has_math: full.has_math,
        has_mermaid: full.has_mermaid,
    }
}

struct Fragment {
    html: String,
    links: BTreeSet<String>,
    has_math: bool,
    has_mermaid: bool,
}

fn options() -> Options<'static> {
    let mut options = Options::default();
    let ext = &mut options.extension;
    ext.strikethrough = true;
    ext.table = true;
    ext.autolink = true;
    ext.tasklist = true;
    ext.footnotes = true;
    ext.math_dollars = true;
    ext.wikilinks_title_after_pipe = true;
    ext.header_id_prefix = Some(String::new());
    // We pass our own trusted HTML (maths) through; anything the author wrote
    // as raw HTML is turned into text before rendering (see `escape_raw_html`).
    options.render.r#unsafe = true;
    options
}

fn highlighter() -> &'static SyntectAdapter {
    static ADAPTER: OnceLock<SyntectAdapter> = OnceLock::new();
    // CSS classes instead of inline colours, so code follows light/dark mode.
    ADAPTER.get_or_init(|| SyntectAdapterBuilder::new().css().build())
}

fn render_fragment(markdown: &str, max_blocks: Option<usize>) -> Fragment {
    let arena = Arena::new();
    let options = options();
    let root = parse_document(&arena, markdown, &options);

    if let Some(max) = max_blocks {
        for (i, child) in root.children().collect::<Vec<_>>().into_iter().enumerate() {
            let is_footnote = matches!(child.data().value, NodeValue::FootnoteDefinition(_));
            if i >= max || is_footnote {
                child.detach();
            }
        }
    }

    let mut links = BTreeSet::new();
    let mut has_math = false;
    let mut has_mermaid = false;
    for node in root.descendants() {
        let replacement = {
            let data = node.data();
            match &data.value {
                NodeValue::HtmlInline(raw) => Some(NodeValue::Text(raw.clone().into())),
                NodeValue::HtmlBlock(block) => Some(escaped_block(&block.literal)),
                NodeValue::CodeBlock(code) if code.info.trim() == "mermaid" => {
                    has_mermaid = true;
                    // Drawn in the browser by Mermaid; the source stays
                    // escaped text until then.
                    Some(NodeValue::HtmlBlock(NodeHtmlBlock {
                        block_type: 0,
                        literal: format!(
                            "<pre class=\"mermaid\">{}</pre>\n",
                            escape_html(&code.literal)
                        ),
                    }))
                }
                NodeValue::Math(math) => {
                    has_math = true;
                    Some(math_node(&math.literal, math.display_math))
                }
                NodeValue::WikiLink(link) => {
                    let slug = slugify(&link.url);
                    if !slug.is_empty() {
                        links.insert(slug.clone());
                    }
                    let mut wl = link.clone();
                    wl.url = format!("/posts/{slug}");
                    Some(NodeValue::WikiLink(wl))
                }
                _ => None,
            }
        };
        if let Some(value) = replacement {
            node.data_mut().value = value;
        }
    }

    let mut plugins = Plugins::default();
    plugins.render.codefence_syntax_highlighter = Some(highlighter());

    let mut html = String::new();
    format_html_with_plugins(root, &options, &mut html, &plugins)
        .expect("writing to a String cannot fail");

    Fragment {
        html,
        links,
        has_math,
        has_mermaid,
    }
}

/// Raw HTML blocks written by the author become an escaped paragraph.
fn escaped_block(literal: &str) -> NodeValue {
    NodeValue::HtmlBlock(NodeHtmlBlock {
        block_type: 0,
        literal: format!("<p>{}</p>\n", escape_html(literal.trim_end())),
    })
}

fn math_node(tex: &str, display: bool) -> NodeValue {
    let opts = katex::Opts::builder()
        .display_mode(display)
        .output_type(katex::OutputType::Html)
        .throw_on_error(false)
        .trust(false)
        .build()
        .expect("valid KaTeX options");
    let html = katex::render_with_opts(tex, &opts)
        .unwrap_or_else(|_| format!("<code class=\"math-error\">{}</code>", escape_html(tex)));
    if display {
        NodeValue::HtmlBlock(NodeHtmlBlock {
            block_type: 0,
            literal: format!("<div class=\"math-display\">{html}</div>\n"),
        })
    } else {
        NodeValue::HtmlInline(html)
    }
}

/// Turns a title or `[[link]]` target into a URL slug: lowercase ASCII
/// letters, digits and single dashes.
pub fn slugify(input: &str) -> String {
    let mut slug = String::with_capacity(input.len());
    for c in input.trim().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    slug
}

fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_basic_markdown() {
        let r = render("# Hello\n\nSome *text*.");
        assert!(r.html.contains("<h1"), "{}", r.html);
        assert!(r.html.contains("<em>text</em>"));
    }

    #[test]
    fn escapes_raw_html() {
        let r = render("Hi <script>alert(1)</script>\n\n<div onclick=\"x\">block</div>");
        assert!(!r.html.contains("<script>"), "{}", r.html);
        assert!(!r.html.contains("<div onclick"), "{}", r.html);
        assert!(r.html.contains("&lt;script&gt;"));
    }

    #[test]
    fn renders_math_with_katex() {
        let r = render("Inline $a^2 + b^2$ and\n\n$$\\int_0^1 x\\,dx$$\n");
        assert!(r.has_math);
        assert!(r.html.contains("class=\"katex\""), "{}", r.html);
        assert!(r.html.contains("math-display"));
    }

    #[test]
    fn highlights_code_with_classes() {
        let r = render("```rust\nfn main() {}\n```\n");
        assert!(r.html.contains("<span class="), "{}", r.html);
        assert!(!r.html.contains("style=\"color"), "{}", r.html);
    }

    #[test]
    fn mermaid_blocks_become_diagram_containers() {
        let r = render("```mermaid\ngraph LR; A-->B<script>\n```\n");
        assert!(r.has_mermaid);
        assert!(
            r.html
                .contains("<pre class=\"mermaid\">graph LR; A--&gt;B&lt;script&gt;"),
            "{}",
            r.html
        );
    }

    #[test]
    fn collects_wikilinks() {
        let r = render("See [[Tree Walking Interpreter]] and [[intro|the intro]].");
        assert_eq!(r.links, vec!["intro", "tree-walking-interpreter"]);
        assert!(
            r.html.contains("href=\"/posts/tree-walking-interpreter\""),
            "{}",
            r.html
        );
    }

    #[test]
    fn excerpt_uses_more_marker() {
        let r = render("First.\n\nSecond.\n\n<!-- more -->\n\nHidden.");
        assert!(r.excerpt_html.contains("Second."));
        assert!(!r.excerpt_html.contains("Hidden."));
        assert!(r.html.contains("Hidden."));
        assert!(!r.html.contains("more"));
    }

    #[test]
    fn excerpt_defaults_to_first_blocks() {
        let r = render("One.\n\nTwo.\n\nThree.");
        assert!(r.excerpt_html.contains("Two."));
        assert!(!r.excerpt_html.contains("Three."));
    }

    #[test]
    fn slugify_works() {
        assert_eq!(slugify("  Hello, World! "), "hello-world");
        assert_eq!(slugify("Rust 2024"), "rust-2024");
    }
}
