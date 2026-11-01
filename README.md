# Portfolio

My personal portfolio and blog, built with [Astro](https://astro.build) (JavaScript) and hosted on GitHub Pages.

**Write a Markdown file, get a page.** Drop a `.md` file into `src/content/` and it shows up on the site.

## Features

- New `.md` files become blog posts, project pages and standalone pages
- Apple-inspired design: flat colours, no gradients, frosted navigation bar
- Light and dark mode that follows the system setting, with a toggle that remembers your choice
- Animated icons ([Lucide](https://lucide.dev)) on every button and link, plus scroll-in animations ([Motion](https://motion.dev))
- Live, in-browser project demos from WebAssembly (made for a Rust interpreter that prints to stdout)
- YouTube, Vimeo, video files and images inside posts
- Search-engine friendly: static HTML, sitemap, `robots.txt`, RSS, Open Graph tags and JSON-LD structured data
- Unit tests (Vitest) and browser tests (Playwright), run on every push

## Adding content

```
src/content/
├── blog/       # hello-world.md  → /blog/hello-world/
├── projects/   # interpreter.md  → /projects/interpreter/
└── pages/      # about.md        → /about/
```

Files whose name starts with `_` are ignored, and `draft: true` hides a post or project from the live site
(drafts still show in `npm run dev`).

### Blog post

`src/content/blog/my-first-post.md`:

```markdown
---
title: My first post
date: 2026-11-01
description: A short summary shown in lists, link previews and search results.
tags: [Rust, Interpreters]
cover: /images/my-first-post.png   # optional
---

Write your post here using normal **Markdown**.
```

### Page

`src/content/pages/uses.md` with a `title` (and optional `description`) becomes `/uses/`. To show it in the top
bar, add it to `nav` in `site.config.js`.

### Images and video

Put images in `public/images/` and write `![What the image shows](/images/diagram.png)`.

Paste a YouTube or Vimeo link (or a link to an `.mp4` / `.webm` file) **on a line by itself** and it becomes a player:

```markdown
https://www.youtube.com/watch?v=VIDEO_ID

https://vimeo.com/VIDEO_ID
```

A link inside a sentence stays a normal link.

### Project

```markdown
---
title: My Interpreter
summary: One or two sentences for the project card.
date: 2026-10-20
tags: [Rust, WebAssembly]
cover: /images/interpreter.svg
featured: true                       # featured projects come first; the first one is the big tile on the home page
source: https://github.com/ReelPlum/my-interpreter   # adds a "View source" button
link: https://example.com            # optional "Visit" button
---
```

### Embedding the interpreter (WebAssembly)

The project page shows a code editor with a **Run** button and a console. Whatever the program prints to
stdout / stderr appears in the console.

1. Build the interpreter for WASI:
   ```bash
   rustup target add wasm32-wasip1
   cargo build --release --target wasm32-wasip1
   ```
2. Copy `target/wasm32-wasip1/release/<name>.wasm` to `public/wasm/interpreter/interpreter.wasm`.
3. Point the project at it (already set up in `src/content/projects/interpreter.md`):
   ```yaml
   demo:
     type: wasi
     wasm: /wasm/interpreter/interpreter.wasm
     filename: main.txt        # the editor's code is saved to this file and its name passed as the first argument
     # input: stdin            # use this instead if your interpreter reads the program from stdin
     examples:
       - name: Hello
         code: |
           print("hello")
   ```

Until the `.wasm` file exists, the page shows "Playground coming soon".

Other options: `type: bindgen` for a `wasm-pack build --target web` module (point `module:` at the generated
`.js`; output printed with `console.log` is captured), or `type: iframe` with `src:` for any web page.

## Settings

`site.config.js` holds your name, tagline, email (used as a `mailto:` link on the contact page), social links, the
navigation and the link to this repository.

## Running locally

Needs [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev        # http://localhost:4321/Portfolio/
npm run build      # static site in dist/
npm run preview    # serve dist/
```

## Tests

```bash
npm test           # unit tests
npm run test:e2e   # browser tests (first time: npx playwright install chromium)
```

The browser tests build the site from `tests/fixtures/content` instead of your real posts, so changing your
content never breaks them. `tests/fixtures/tiny-calc` is a tiny Rust program used to test the WebAssembly
playground for real.

House rule: every bug that gets fixed gets a test that reproduces it, marked with a `Regression:` comment.

## Deploying to GitHub Pages

1. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. The workflow in `.github/workflows/deploy.yml` runs all tests, builds and publishes the site.

The site is served at `https://reelplum.github.io/Portfolio/`. The workflow reads the base path from GitHub, so if
you rename the repository to `reelplum.github.io` or add a custom domain, it moves to `/` automatically (also set
`base: '/'` in `site.config.js` so local builds match).

## Project structure

```
.
├── src/
│   ├── content/        # your Markdown
│   ├── components/     # header, footer, cards, playground, icons
│   ├── layouts/        # page shell (meta tags, theme script)
│   ├── lib/            # embeds, WebAssembly runner, SEO helpers (all unit tested)
│   ├── pages/          # routes
│   └── styles/         # design tokens and styles
├── public/             # images, favicon, wasm builds
├── tests/              # unit, e2e and fixtures
└── site.config.js
```

## Licence

No licence has been chosen yet, so all rights are reserved for now.
