---
title: Running Rust in the browser with WASI
date: 2026-10-12
description: How a Rust program that just prints can run on a static website.
tags: [Rust, WebAssembly]
---

If your program reads a file and prints to stdout, compile it with
`cargo build --target wasm32-wasip1` and run it in the browser with a WASI shim.
