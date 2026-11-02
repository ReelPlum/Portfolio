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
- LaTeX maths ($…$ and $$…$$) rendered with [KaTeX](https://katex.org), on pages and in search results, with
  per-post macros (`\newcommand`) from a preamble block
- Highlighted code blocks in any language with a language label, file name and copy button, and code included
  straight from a source file (`/code/main.rs#L10-L20` on its own line)
- 3D models (`.glb` / `.gltf`) you can rotate, WebAssembly canvas apps such as Rust + wgpu renderers, and text
  and CSV files shown inline
- Download links with an icon and the file size
- Links to other sites open in a new tab
- Wide layout for big screens: posts get a side column with the details and "On this page"
- Links between posts and projects with `[[slug]]`, and a "Referenced by" list on each page
- PDFs (for example Goodnotes exports) shown inline, page by page
- Live, in-browser project demos from WebAssembly (made for a Rust interpreter that prints to stdout)
- YouTube, Vimeo, video files and images inside posts
- Product reviews with a rating, pros and cons, and affiliate links and prices for the stores in the reader's country
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

### Links to other sites

Links to other websites open in a new tab and get a small arrow; links within the site open normally.

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

### Product reviews and affiliate links

A `product` block in a post becomes a review box with your rating, verdict, pros and cons, and a "Where to buy"
list with each store's price on the day you checked it. Readers only see the stores for their country, and can pick
another country (or "All countries") from the box.

````markdown
```product
name: WH-1000XM5
brand: Sony
image: /images/xm5.jpg
rating: 4.5                 # out of 5 (add `outOf: 10` for another scale)
verdict: The best noise cancelling I've tried, but the case is huge.
pros: [Very quiet, 30 hour battery]
cons: [Bulky case]
checked: 2026-10-30         # when you looked up the prices (defaults to the post's date)
asin: B09XS7JWHH            # the code after /dp/ in an Amazon link, for `amazon:` offers
offers:
  - store: Elgiganten
    url: https://www.elgiganten.dk/product/...   # your affiliate link
    price: 2499
    currency: DKK
    regions: [DK]
  - amazon: de              # link built from `asin` and your Amazon.de tracking ID in site.config.js
  - store: Sony
    url: https://electronics.sony.com/...
    price: 399.99
    currency: USD
    regions: [US, CA]
    note: Refurbished       # optional extra line
```
````

- **`regions`** takes two-letter country codes (`DK`, `US`, `GB` or `UK`), the groups `EU` and `Nordics`, or
  `worldwide` (the default when you leave it out). A typo fails the build.
- **Prices** can be written as `2499`, `"£279.99"` or `"1.299,00 kr."`, and are shown in the reader's own number
  format next to the date you checked them. Leave `price` out to show "See price".
- **The reader's country** is worked out in their browser from their time zone and language settings. Nothing is
  sent anywhere. If none of your stores sell there, every store is shown with a note. `?region=US` at the end of the
  address shows another country's stores (handy for checking).
- **Amazon:** `amazon: de` (or `com`, `co.uk`, `fr`, `se`, ...) links to that Amazon store and ships to its country
  by default. Put your tracking ID for each Amazon store you've joined in `affiliates.amazon` in `site.config.js`.
  Amazon's rules don't allow showing Amazon prices you typed in yourself, so leave `price` off Amazon offers.
- **Same product in several posts:** put the fields in `src/content/products/<name>.yaml` and write `use: <name>` in
  the block. Fields in the block (like a different `verdict`) override the file.

Store links get `rel="sponsored"` (what Google asks for on affiliate links), and the box ends with the disclosure
from `affiliates.disclosure` in `site.config.js`. Search engines also get the rating and prices as structured data.

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
