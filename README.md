# Portfolio

A personal portfolio and blog, written in Rust: a feed of blog posts, each by one or more authors, with tags,
author profiles, maths, highlighted code and diagrams. Built to run on a small, cheap server.

## Project layout

```
crates/
├── render/   Markdown → HTML, shared by the server and the Mac app so previews match the site
├── api/      Types shared by the server and the Mac app (the admin API's JSON)
├── client/   Client for the admin API, used by the Mac app
├── server/   The website and admin API: Axum + MongoDB, pages built from reusable Maud components
│   ├── src/components.rs   layout, post card, author line, tags, profile, …
│   ├── static/             CSS, KaTeX and Mermaid (served from the site itself, no CDNs)
│   └── seed/               example posts for `server seed`
└── app/      Portfolio Studio, the Mac app for writing and managing posts (Rust + GPUI)
```

## Portfolio Studio (the Mac app)

Write, edit, publish and unpublish posts, credit one or more authors, tag posts, and manage authors (name,
email, LinkedIn, bio). The editor shows a live preview next to the Markdown and warns before you leave a post
with unsaved changes.

1. Set the password the app logs in with, on the server: `docker compose exec web /app/server set-password`
   (or `cargo run -p server -- set-password` locally). It must be at least 12 characters.
2. Build and start the app on your Mac: `cargo run --release -p app`
3. Enter the site's address (for example `https://example.com`) and the password.

The login is kept in the macOS Keychain, and the app talks to the server only over HTTPS (plain `http://` is
allowed for `localhost` only). Shortcuts: ⌘N new post, ⌘S save, ⇧⌘U publish/unpublish, ⇧⌘P preview,
⇧⌘O open on the website.

The preview in the app shows Markdown and code; maths and diagrams are drawn on the website itself.

## Writing posts

Posts are Markdown with these extras:

- Maths: `$a^2 + b^2$` inline and `$$ … $$` on its own line, rendered with KaTeX on the server
- Code blocks with syntax highlighting that follows light and dark mode
- Mermaid diagrams in a ```` ```mermaid ```` block
- Links to other posts with `[[post-slug]]` or `[[post-slug|link text]]`
- Tables, task lists, footnotes and strikethrough
- `<!-- more -->` on its own line ends the excerpt shown in the feed (otherwise the first two paragraphs)

Raw HTML in a post is shown as text, never run.

## Running locally

You need Rust and MongoDB (for example `docker run -d -p 27017:27017 mongo:8`).

```sh
cargo run -p server -- seed   # adds example authors and posts to an empty database
cargo run -p server           # http://localhost:3000
cargo test                    # all tests
```

Tests that need a database run when `TEST_MONGODB_URI` is set (each uses its own temporary database):

```sh
TEST_MONGODB_URI=mongodb://localhost:27017 cargo test
```

Settings come from environment variables: `SITE_NAME`, `SITE_URL`, `MONGODB_URI`, `MONGODB_DB`, `BIND_ADDR`,
`STATIC_DIR`.

## Deploying

The whole site runs on one small server (a 2 GB VPS is enough) with Docker Compose: Caddy handles HTTPS,
the Rust server renders pages, and MongoDB stores the content. Only Caddy is reachable from the internet.

1. Point your domain's DNS (A/AAAA records) at the server.
2. Copy `.env.example` to `.env` and fill it in.
3. `docker compose up -d --build`

## Security

- Admin login: Argon2id password hash, random API tokens stored only as SHA-256 hashes, 30-day expiry,
  all sessions revoked on password change, failed logins rate limited per address and in total
- Strict Content Security Policy: only the site's own scripts and styles, no inline scripts
- Security headers on every response (HSTS, nosniff, no framing, referrer and permissions policies)
- HTML escaped by default in every component; post HTML comes only from the renderer, which escapes raw HTML
- MongoDB is not exposed and requires a password; request size limits and timeouts on the server
- No cookies, no third-party scripts, fonts or trackers; Caddy logs leave out visitors' IP addresses

## Roadmap

- Mac app: image and demo uploads, statistics views, maths in the preview
- Likes without accounts, private visitor statistics (views, referrers, scroll depth, read time, reading heatmap)
- Citations and author publication lists (BibTeX via hayagriva)
- Python (Pyodide) and WebAssembly demos in a sandboxed subdomain: terminal, code editor or canvas
- Private graph of how posts, tags and authors connect
- Recommendations: related posts for everyone and an opt-in "For you" list kept in the visitor's browser
