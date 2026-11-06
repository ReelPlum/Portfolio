# Portfolio

A personal portfolio and blog, written in Rust: a feed of blog posts, each by one or more authors, with tags,
author profiles, maths, highlighted code and diagrams. Built to run on a small, cheap server.

## Project layout

```
crates/
├── render/   Markdown → HTML, shared by the server and the Mac app so previews match the site
├── server/   The website: Axum + MongoDB, pages built from reusable Maud components
│   ├── src/components.rs   layout, post card, author line, tags, profile, …
│   ├── static/             CSS, KaTeX and Mermaid (served from the site itself, no CDNs)
│   └── seed/               example posts for `server seed`
└── app/      Portfolio Studio, the Mac app for writing and managing posts (Rust + GPUI)
```

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
cargo test                    # renderer and server tests
```

Settings come from environment variables: `SITE_NAME`, `SITE_URL`, `MONGODB_URI`, `MONGODB_DB`, `BIND_ADDR`,
`STATIC_DIR`.

The Mac app builds only on macOS: `cargo run -p app`.

## Deploying

The whole site runs on one small server (a 2 GB VPS is enough) with Docker Compose: Caddy handles HTTPS,
the Rust server renders pages, and MongoDB stores the content. Only Caddy is reachable from the internet.

1. Point your domain's DNS (A/AAAA records) at the server.
2. Copy `.env.example` to `.env` and fill it in.
3. `docker compose up -d --build`

## Security

- Strict Content Security Policy: only the site's own scripts and styles, no inline scripts
- Security headers on every response (HSTS, nosniff, no framing, referrer and permissions policies)
- HTML escaped by default in every component; post HTML comes only from the renderer, which escapes raw HTML
- MongoDB is not exposed and requires a password; request size limits and timeouts on the server
- No cookies, no third-party scripts, fonts or trackers; Caddy logs leave out visitors' IP addresses

## Roadmap

- Mac app: post editor with live preview, authors, tags, uploads and publishing over an authenticated API
- Likes without accounts, private visitor statistics (views, referrers, scroll depth, read time, reading heatmap)
- Citations and author publication lists (BibTeX via hayagriva)
- Python (Pyodide) and WebAssembly demos in a sandboxed subdomain: terminal, code editor or canvas
- Private graph of how posts, tags and authors connect
