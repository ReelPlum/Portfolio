# Portfolio

My personal portfolio and blog, built with JavaScript and hosted on GitHub Pages.

The idea is simple: **write a Markdown file, get a page.** Drop a `.md` file into the content folder and it shows up on the site as a new page or blog post, with no HTML to write.

> **Status: early days.** The repository is being set up right now. Three design directions are being prototyped so one can be picked (or mixed and matched). Anything marked _(planned)_ below describes how the site is meant to work and is not built yet. This README will be updated as each piece lands.

## Features

| Feature | Status |
| --- | --- |
| New `.md` files become pages and blog posts | _(planned)_ |
| Clean Apple-inspired design: flat colours, no gradients | _(planned, 3 designs in progress)_ |
| Light and dark mode, following the system setting with a manual toggle | _(planned)_ |
| Animated icons for every action (theme toggle, menu, links, copy, and so on) | _(planned)_ |
| Embedded projects, such as a live, in-browser interpreter demo | _(planned)_ |
| YouTube, Vimeo and image support inside posts | _(planned)_ |
| Automated tests for everything, plus a regression test for every bug fixed | _(planned)_ |
| Automatic deploy to GitHub Pages on every push to `main` | _(planned)_ |

## Adding content _(planned)_

All content lives in Markdown files. The folder layout below is the intended one and may change slightly once the design is chosen.

```
content/
├── pages/          # Standalone pages, e.g. about.md → /about
├── blog/           # Blog posts, e.g. 2026-11-01-hello-world.md → /blog/hello-world
└── projects/       # Project write-ups, optionally with an embedded demo
```

### A new blog post

Create `content/blog/my-first-post.md`:

```markdown
---
title: My first post
date: 2026-11-01
description: A short summary shown in lists and link previews.
tags: [javascript, interpreters]
cover: /assets/images/my-first-post/cover.jpg
draft: false
---

Write your post here using normal **Markdown**.
```

Commit and push it, and it appears on the blog. Set `draft: true` to keep a post off the live site.

### A new page

Create `content/pages/uses.md` with a `title` in the front matter. It is served at `/uses`. Add `nav: true` to show it in the navigation bar.

### Images

Put images under `assets/images/` and use standard Markdown:

```markdown
![Alt text describing the image](/assets/images/my-first-post/diagram.png)
```

### YouTube and Vimeo

Paste the video link on a line by itself and it is turned into a responsive embed:

```markdown
https://www.youtube.com/watch?v=VIDEO_ID

https://vimeo.com/VIDEO_ID
```

### Embedding a project

Projects can ship a live demo (for example, an interpreter you can type code into). The demo's files go in `projects/<name>/`, and the project's Markdown file points at it:

```markdown
---
title: My Interpreter
embed: /projects/my-interpreter/index.html
repo: https://github.com/ReelPlum/my-interpreter
---

Some words about how the interpreter works.
```

The exact embed format is still being decided. It will most likely be either an iframe of a static build or a JavaScript module that mounts into the page.

## Running locally _(planned)_

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/ReelPlum/Portfolio.git
cd Portfolio
npm install
npm run dev      # start a local server with live reload
```

Then open the URL the dev server prints (usually `http://localhost:5173` or similar).

To produce the static site that gets deployed:

```bash
npm run build    # output goes to dist/
npm run preview  # serve the built site locally
```

## Running the tests _(planned)_

```bash
npm test                 # unit tests (Markdown parsing, routing, embeds, ...)
npm run test:e2e         # browser tests (navigation, theme toggle, embeds)
npm run test:coverage    # unit tests with a coverage report in coverage/
```

House rule: **every bug that gets fixed gets a test** that reproduces it, so it can't come back.

## Deploying to GitHub Pages _(planned)_

Deployment is meant to be automatic through GitHub Actions:

1. In the repository on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/` installs dependencies, runs the tests, builds the site and publishes it.

The site will be served at `https://reelplum.github.io/Portfolio/`. To use a custom domain, add it under **Settings → Pages → Custom domain** and commit a `CNAME` file containing the domain.

## Project structure _(planned)_

```
.
├── content/            # Markdown pages, posts and project write-ups
├── assets/             # Images and other static files
├── projects/           # Embeddable project demos
├── src/                # Site JavaScript, styles and icons
├── tests/              # Unit and end-to-end tests
└── .github/workflows/  # Build, test and deploy pipeline
```

## Licence

No licence has been chosen yet, so all rights are reserved for now.
