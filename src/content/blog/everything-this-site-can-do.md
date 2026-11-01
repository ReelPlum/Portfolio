---
title: Everything this site can do
date: 2026-10-30
description: "One post that uses every feature: images, videos, PDFs, 3D models, WebAssembly apps, maths with macros, code, file views, downloads, references and links."
tags: [Meta]
---

```preamble
\newcommand{\R}{\mathbb{R}}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
\newcommand{\abs}[1]{\left\lvert #1 \right\rvert}
\newcommand{\dd}{\,\mathrm{d}}
```

This post is a tour of what you can put in a post or a project page. Each section says how to write it.
Posts are markdown files in `src/content/blog/` and projects are in `src/content/projects/`.

## Images

Write `![Description](/images/file.png)` with the file in `public/images/`:

![The interpreter's logo](/images/interpreter.svg)

## Videos

A YouTube or Vimeo link on a line of its own becomes a player:

https://www.youtube.com/watch?v=aqz-KE-bpKQ

https://vimeo.com/76979871

## PDFs and Goodnotes

A link to a PDF on its own line shows the pages right in the post. For Goodnotes, use Export → PDF and
put the file in `public/files/`:

/files/sample-notes.pdf

## 3D models

A `.glb` or `.gltf` file on its own line becomes a viewer you can rotate and zoom. Put the file in
`public/models/`:

/models/crystal.glb

## Rendered with Rust and wgpu

A Rust program that draws with [wgpu](https://wgpu.rs), built for the web with wasm-bindgen, runs in a
canvas on the page. Put the build in `public/wasm/<name>/` and write the path to its `.js` file on its own
line. It starts when you press Run, and shows a placeholder like this one until the files are there:

/wasm/renderer/renderer.js

## Maths

Inline maths goes between single dollar signs, like $e^{i\pi} + 1 = 0$, and display maths between double
ones:

$$
\int_{-\infty}^{\infty} e^{-x^2} \dd x = \sqrt{\pi}
$$

The `preamble` block at the top of this post defines `\R`, `\norm`, `\abs` and `\dd`, and every formula
in the post can use them. For every $x \in \R^n$ the triangle inequality says
$\norm{x + y} \le \norm{x} + \norm{y}$, and $\abs{\langle x, y \rangle} \le \norm{x}\,\norm{y}$ is
Cauchy–Schwarz. Boxes work too: $\boxed{E = mc^2}$ and $\fbox{text in a box}$.

## Code

Fenced code gets highlighting, a language label and a copy button:

```rust title="hello.rs"
fn main() {
    println!("Hello from Rust");
}
```

A path to a source file on its own line includes the file (here, only the token type):

/code/interpreter/lexer.rs#L3-L14

There's more on this in [[code-blocks|Showing code on this site]].

## Files

Text files show their contents, and CSV files become a table. Put them anywhere in `public/` and write
the path on its own line:

/files/interpreter-notes.txt

/files/benchmarks.csv

## Downloads

A link to a file gets a download button with its size when you give it the title `"download"`, like
`[the notes](/files/sample-notes.pdf "download")`. Archives such as `.zip` files always download. Both
are below: [the lexer source](/files/interpreter-lexer.zip) and
[the sample notes](/files/sample-notes.pdf "download").

## Links between posts and projects

Write `[[slug]]` to link to another post or project by its file name, or `[[slug|your own text]]` to
choose the link text. This links to [[interpreter]] and to
[[how-a-tree-walking-interpreter-works|the post about how it works]]. Pages that are linked to list the
posts that link to them under "Referenced by", and a link to something that doesn't exist stops the build.

## Links to other sites

Ordinary links to other websites, like [the Rust book](https://doc.rust-lang.org/book/) or
[WebAssembly.org](https://webassembly.org), open in a new tab and get a small arrow so you can tell.

## Live demos

A project can run a WebAssembly build right on its page. The [[interpreter]] project has a playground
where you type code and see what it prints. It shows a placeholder until the `.wasm` file is added to
`public/wasm/interpreter/`.

## Search

Everything here is searchable from the bar at the top, by keyword or by meaning, and formulas in the
results are rendered too. Try searching for "triangle inequality" or "how are closures stored".
