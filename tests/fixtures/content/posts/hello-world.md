---
title: Hello, world
date: 2026-11-01
description: Why I built this site, and how adding a post is just adding a markdown file.
tags: [blog, Meta]
---

```preamble
\usepackage{amsmath}
\newcommand{\R}{\mathbb{R}}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
```

Welcome to my new site. Every post is a markdown file in `src/content/posts/`.

## Images

![Mountains at dusk](/images/sample-photo.svg)

## Video

Paste a YouTube or Vimeo link on its own line and it becomes a player:

https://www.youtube.com/watch?v=aqz-KE-bpKQ

https://vimeo.com/76979871

## Maths

Euler's identity $e^{i\pi} + 1 = 0$ is written inline, and display maths gets its own line:

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
$$

Macros from the preamble work everywhere in the post: $\boxed{\norm{x} \in \R}$ for every vector, and $\fbox{text in a box}$.

## References

The site is built with [Astro](https://astro.build), and the source is on [GitHub](https://github.com/ReelPlum/Portfolio).

Try the calculator in [[tiny-calc]], or read [[blog/writing-an-interpreter|my interpreter notes]].

## Notes

/files/lecture-notes.pdf

## Code

```rust
fn main() {
    println!("Hello from Rust");
}
```

```js title="greet.js"
export const greet = (name) => `Hello, ${name}!`;
```

```notalanguage
plain text for an unknown language
```

The calculator's statement runner, straight from its source file:

/code/tiny-calc/main.rs#L27-L43
