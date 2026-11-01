# Portfolio

My personal portfolio and blog, built with [Astro](https://astro.build) (JavaScript) and hosted on GitHub Pages.

**Write a Markdown file, get a page.** Drop a `.md` file into `src/content/` and it shows up on the site.

## Features

- New `.md` files become blog posts, project pages and standalone pages
- Google / Material Design 3 style: simple, flat colours, no gradients, nothing moves except icons
- Light and dark mode that follows the system setting (no toggle)
- Animated [Material Symbols](https://fonts.google.com/icons) on every button and link: they fill in and move on hover
- Search across projects and posts with every matching field shown and the matching text highlighted,
  combining keyword matching with vector (semantic) search
- LaTeX maths ($…$ and $$…$$) rendered with [KaTeX](https://katex.org), on pages and in search results
- Links between posts and projects with `[[slug]]`, and a "Referenced by" list on each page
- PDFs (for example Goodnotes exports) shown inline, page by page
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

### Maths

Write LaTeX between `$` signs for inline maths and between `$$` lines for display maths:

```markdown
Euler's identity $e^{i\pi} + 1 = 0$.

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
$$
```

### Linking to other posts and projects

`[[interpreter]]` links to the project or post called `interpreter.md` and uses its title as the link text.
Use `[[interpreter|custom text]]` for your own text, and `[[blog/name]]` or `[[projects/name]]` when a post and a
project share a name. A reference to something that doesn't exist fails the build, so links never break.
Every page lists the pages that link to it under "Referenced by".

### Goodnotes and other PDFs

Goodnotes files can't be shown directly (the format is closed), so export them: in Goodnotes choose
Share → Export → PDF. Put the PDF in `public/files/` and put its path on a line by itself:

```markdown
/files/lecture-4.pdf
```

The pages are shown inline with a link to the file underneath.

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

## Search

The search bar at the top searches titles, descriptions, tags and the full text of every project and post. Each
result shows the fields that matched with the matching words highlighted (LaTeX in results is rendered too).
Press `/` to jump to it, or Enter for the full results page.

Search is hybrid:

- **Keyword matching** ([Fuse.js](https://www.fusejs.io)) shows results instantly and tolerates typos.
- **Vector search** finds results with a similar meaning even when the words differ. When the site is built,
  every post and project is split into passages and embedded with
  [all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) into `search-vectors.json`. In the browser,
  the same model ([Transformers.js](https://huggingface.co/docs/transformers.js)) embeds the query. That download
  (about 30 MB, compressed) only happens the first time a visitor searches, is cached afterwards, and is skipped
  when the visitor's browser has data saver turned on. Keyword results show while it loads. Results that only match
  by meaning are labelled "Similar meaning" and show the passage that matched.

## Settings

`site.config.js` holds your name, tagline, email (used as a `mailto:` link on the contact page), social links, the
navigation and the link to this repository.

## Running locally

Needs [Node.js](https://nodejs.org/) 22.23.4 or newer (24 recommended).

```bash
npm install
npm run dev        # http://localhost:4321/Portfolio/
npm run build      # static site in dist/
npm run preview    # serve dist/
```

`npm run build` downloads the embedding model the first time (about 25 MB). Without internet it skips the vectors
with a warning and search falls back to keywords. In `npm run dev`, restart the server after adding a new file
so `[[references]]` to it resolve.

## Tests

```bash
npm test           # unit tests
npm run test:e2e   # browser tests (first time: npx playwright install chromium)
```

The browser tests build the site from `tests/fixtures/content` instead of your real posts, so changing your
content never breaks them. They use a tiny stand-in for the embedding model so they run offline; a separate CI job
(`semantic-search`) checks the real model end to end. `tests/fixtures/tiny-calc` is a tiny Rust program used to test the WebAssembly
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
│   ├── lib/            # search, embeds, references, WebAssembly runner, SEO helpers (unit tested)
│   ├── pages/          # routes
│   └── styles/         # design tokens and styles
├── public/             # images, favicon, wasm builds
├── tests/              # unit, e2e and fixtures
└── site.config.js
```

## Licence

No licence has been chosen yet, so all rights are reserved for now.
