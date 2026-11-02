# Portfolio

My personal portfolio and blog, built with [Astro](https://astro.build) (JavaScript) and hosted on GitHub Pages.

**Write a Markdown file, get a page.** Drop a `.md` file into `src/content/` and it shows up on the site.

## Features

- New `.md` files become posts and standalone pages. Projects and blog posts are both posts; their tags decide
  which pages and home page feeds they appear in, and every tag gets its own page
- Google / Material Design 3 style: simple, flat colours, no gradients, nothing moves except icons
- Light and dark mode that follows the system setting (no toggle)
- Animated [Material Symbols](https://fonts.google.com/icons) on every button and link: they fill in and move on hover
- Search across projects and posts with every matching field shown and the matching text highlighted,
  combining keyword matching with vector (semantic) search
- LaTeX maths ($…$ and $$…$$) rendered with [KaTeX](https://katex.org), on pages and in search results, with
  per-post macros (`\newcommand`) from a preamble block
- Highlighted code blocks in any language with a language label, file name and copy button, and code included
  straight from a source file (`/code/main.rs#L10-L20` on its own line)
- 3D models (`.glb` / `.gltf`) you can rotate, WebAssembly canvas apps such as Rust + wgpu renderers, and text
  and CSV files shown inline
- Download links with an icon and the file size
- Files from your other GitHub repositories, private ones too: paste a link to a file on GitHub and it is shown,
  embedded or offered for download like a file in `public/`
- Links to other sites open in a new tab
- Wide layout for big screens: posts get a side column with the details and "On this page"
- Links between posts and projects with `[[slug]]`, and a "Referenced by" list on each page
- PDFs (for example Goodnotes exports) shown inline, page by page
- Live, in-browser project demos from WebAssembly (made for a Rust interpreter that prints to stdout)
- YouTube, Vimeo, video files and images inside posts
- Search-engine friendly: static HTML, sitemap, `robots.txt`, RSS, Open Graph tags and JSON-LD structured data
- Unit tests (Vitest) and browser tests (Playwright), run on every push

## Adding content

```
src/content/
├── posts/      # interpreter.md (tagged project) → /projects/interpreter/
│               # hello-world.md (tagged blog)    → /blog/hello-world/
└── pages/      # about.md                        → /about/
```

Files whose name starts with `_` are ignored, and `draft: true` hides a post from the live site
(drafts still show in `npm run dev`).

### Post

Projects and blog posts are the same thing: a post in `src/content/posts/`. What makes one a project is the
`project` tag. `src/content/posts/my-first-post.md`:

```markdown
---
title: My first post
date: 2026-11-01
description: A short summary shown in cards, lists, link previews and search results.
tags: [blog, Rust, Interpreters]
cover: /images/my-first-post.png   # optional
---

Write your post here using normal **Markdown**.
```

### Tags: which posts go where

The `tags` section of `site.config.js` decides where posts show up:

```js
tags: {
  // Tags that get their own page. A post is on a page when it has any of the page's tags.
  pages: [
    { path: 'projects', title: 'Projects', tags: ['project'], layout: 'cards', sort: 'featured', icon: 'code', name: 'Project' },
    { path: 'blog', title: 'Blog', tags: ['blog'], layout: 'list', icon: 'article', name: 'Post' },
  ],
  // The feeds on the home page, top to bottom.
  home: [
    { title: 'Featured', tags: ['project'], featured: true, limit: 1, layout: 'large' },
    { title: 'Projects', tags: ['project'], sort: 'featured', limit: 4, layout: 'cards', link: '/projects/' },
    { title: 'Latest writing', tags: ['blog'], limit: 4, layout: 'list', link: '/blog/' },
  ],
  // Every tag gets a page at /tags/<tag>/, /tags/ lists them all, and tags on posts are clickable.
  tagPages: true,
},
```

- **Add a page for a tag**: add `{ path: 'talks', title: 'Talks', tags: ['talk'] }` to `pages` and tag posts with
  `talk`. They then live at `/talks/<name>/`. Add `{ label: 'Talks', href: '/talks/' }` to `nav` to show it in the
  top bar.
- **Add a feed to the home page**: add `{ title: 'Talks', tags: ['talk'], limit: 3, link: '/talks/' }` to `home`.
  A post shown in one feed is left out of the feeds below it, unless that feed says `repeat: true`.
- Leave `tags` out to include every post, and use `exclude: ['draft-ideas']` to leave posts with a tag out.
- `layout` is `'cards'` (tiles with the cover image), `'list'` (rows) or `'large'` (one big tile per post).
- `sort` is `'date'` (newest first) or `'featured'` (`featured: true` first, then `order`, then newest).
- A post's address is under the first page in `pages` that it is on. Posts on no page live at `/posts/<name>/`
  and still show up on their tag pages and in search.
- Tags match whatever their case, so `Rust` and `rust` are one tag.

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

To use your own commands in a post, put a `preamble` block at the top. It isn't shown, and every formula in the
post (and in search results for it) can use what it defines:

````markdown
```preamble
\newcommand{\R}{\mathbb{R}}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
```

For every $x \in \R^n$, $\norm{x} \ge 0$.
````

KaTeX supports `\newcommand`, `\renewcommand`, `\def` and most of what `amsmath` and `amssymb` provide (including
`\boxed{...}` and `\fbox{text}`), but it can't load packages, so `\usepackage` lines are skipped with a warning
in the build. Macros never leak from one post into another.

### Code

Fenced code blocks are highlighted for every language [Shiki](https://shiki.style/languages) knows and show the
language name and a copy button. Add `title="..."` to show a file name:

````markdown
```rust title="src/main.rs"
fn main() {
    println!("Hello");
}
```
````

To show code from a file, put the file in `public/code/` and write its path on a line by itself. Add `#L10-L20` to
show only those lines. The language comes from the file extension, and the file name links to the raw file:

```markdown
/code/interpreter/lexer.rs
/code/interpreter/lexer.rs#L26-L46
```

A missing file or a line range past the end of the file fails the build.

### Text and CSV files

Any text file (`.txt`, `.log`, `.json`, `.toml`, `.md` and so on) with its path on a line by itself is shown with its
contents, like a code file. A `.csv` or `.tsv` file is shown as a table, with the first row as the header:

```markdown
/files/notes.txt
/files/results.csv
```

### 3D models

Put a `.glb` or `.gltf` file in `public/models/` and write its path on a line by itself. Visitors can drag to rotate
and scroll or pinch to zoom, and there's a download link. The viewer
([model-viewer](https://modelviewer.dev)) only loads on pages that have a model.

```markdown
/models/robot.glb
```

### Rust + wgpu (or any wasm-bindgen app) in a canvas

Build the app for the web with wasm-bindgen and put the output in `public/wasm/<name>/`, then write the path to its
`.js` file on a line by itself. The page gives the app a canvas and starts it when the visitor presses Run. Until
the files are there it shows a "coming soon" placeholder.

```markdown
/wasm/renderer/renderer.js
/wasm/renderer/renderer.js?height=600&entry=run
```

The page calls the module's default export (wasm-bindgen's `init`) and then `start(canvas)`, so export a `start`
function that takes the canvas:

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub async fn start(canvas: web_sys::HtmlCanvasElement) -> Result<(), JsValue> {
    let instance = wgpu::Instance::default(); // WebGPU, or WebGL 2 with the "webgl" feature
    let surface = instance
        .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    // ... request an adapter and device, configure the surface, then draw each frame
    // with requestAnimationFrame.
    Ok(())
}
```

```bash
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir public/wasm/renderer target/wasm32-unknown-unknown/release/renderer.wasm
```

Enable wgpu's `webgl` feature to also run in browsers without WebGPU.

### Download links

Give a link to a file in `public/` the title `"download"` and clicking it downloads the file instead of opening it.
It's shown as a button with a download icon and the file size. Links to archives and installers (`.zip`, `.tar.gz`,
`.7z`, `.exe`, `.dmg` and so on) always download. A download link to a file that doesn't exist fails the build.

```markdown
[The slides](/files/talk.pdf "download")
[Source code](/files/project.zip)
```

### Files from other GitHub repositories

Anything above that takes a file from `public/` also takes a link to a file in another GitHub repository: code
blocks, text and CSV files, PDFs, videos, 3D models, canvas apps, images, download links, and `cover`, `wasm` and
`module` in frontmatter. Open the file on GitHub, copy the address from the browser and use it instead of the path.
To show some lines, select them on GitHub (click a line number, shift-click another) and copy the address then.

```markdown
https://github.com/ReelPlum/my-interpreter/blob/main/src/lexer.rs#L26-L46

https://github.com/ReelPlum/my-interpreter/blob/v1.0/examples/results.csv

![The architecture](https://github.com/ReelPlum/my-interpreter/blob/main/docs/architecture.png)

[The release](https://github.com/ReelPlum/my-interpreter/blob/main/dist/interpreter.zip)

https://github.com/ReelPlum/renderer/blob/main/pkg/renderer.js?height=600
```

```yaml
cover: https://github.com/ReelPlum/my-interpreter/blob/main/docs/screenshot.png
demo:
  type: wasi
  wasm: https://github.com/ReelPlum/my-interpreter/blob/main/web/interpreter.wasm
```

The build downloads each file and publishes a copy with the site (under `/_github/`), so visitors never need access
to the repository. A `.js` file with a wasm-bindgen `<name>_bg.wasm` next to it runs as a canvas app; any other `.js`
file is shown as code. A link inside a sentence stays a normal link to GitHub. A file that can't be downloaded
fails the build with the reason, so a post never shows a broken file.

Tips:

- **Branches move.** A link to `blob/main/...` shows whatever is on `main` when the site is built. Use a tag
  (`blob/v1.0/...`) or a commit (press `y` on GitHub to turn the address into one) to keep a post showing the same code.
- Branch names with a `/` in them (like `feature/parser`) can't be told apart from folders; use a tag or commit instead.
- Raw links (`https://raw.githubusercontent.com/...`) work too.

#### Private repositories

> [!WARNING]
> A file you reference from a private repository is **published on your site, where anyone can read it**. Only
> reference files you are happy to make public. The rest of the repository stays private.

The build needs a token that can read those repositories:

1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** →
   [**Fine-grained tokens**](https://github.com/settings/personal-access-tokens/new) → **Generate new token**.
2. Give it a name (like "Portfolio files") and an expiration date. Under **Repository access** choose
   **Only select repositories** and pick the private repositories you want to use files from.
3. Under **Permissions** → **Repository permissions**, set **Contents** to **Read-only**. Nothing else is needed.
4. Generate the token and copy it.
5. In this repository go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name it
   `PRIVATE_REPOS_TOKEN` and paste the token.

The deploy workflow passes it to the build as `GITHUB_FILES_TOKEN`. Without the secret, public repositories still
work. When the token expires the build fails with a message saying so; make a new one and replace the secret.

To build locally with private files, set the token in your shell first:

```bash
GITHUB_FILES_TOKEN=github_pat_... npm run dev
```

Downloaded files are kept in `.cache/github-files/` (not committed). Delete that folder to clear them.

### Links to other sites

Links to other websites open in a new tab and get a small arrow; links within the site open normally.

### Linking to other posts and projects

`[[interpreter]]` links to the post called `interpreter.md` and uses its title as the link text.
Use `[[interpreter|custom text]]` for your own text, and `[[posts/name]]` or `[[pages/name]]` when a post and a
page share a name. A reference to something that doesn't exist fails the build, so links never break.
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

A project is a post tagged `project`, with a few extra fields:

```markdown
---
title: My Interpreter
description: One or two sentences for the project card.
date: 2026-10-20
tags: [project, Rust, WebAssembly]
cover: /images/interpreter.svg
featured: true                       # shows in the Featured feed on the home page and first on Projects
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
3. Point the project at it (already set up in `src/content/posts/interpreter.md`):
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
  every post and project gets one vector for the whole document and one for each paragraph, embedded with
  [nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) into `search-vectors.json`. In the browser,
  the same model ([Transformers.js](https://huggingface.co/docs/transformers.js)) embeds the query. That download
  (about 140 MB) only happens the first time a visitor searches, is cached afterwards, and is skipped
  when the visitor's browser has data saver turned on. Keyword results show while it loads. Results that only match
  by meaning are labelled "Similar meaning" and show the paragraph that matched best. To use a smaller model, set
  `SEARCH_MODEL=Xenova/all-MiniLM-L6-v2` (about 23 MB) in the deploy step, or add another entry to
  `EMBED_MODELS` in `src/lib/search.js`.

## Settings

`site.config.js` holds your name, tagline, email (used as a `mailto:` link on the contact page), social links, the
navigation, the link to this repository and which tags get pages and home page feeds (see above).

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
playground for real. Files "from GitHub" in the test posts are read from `tests/fixtures/github/<owner>/<repo>/<ref>/`
instead of the network.

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
