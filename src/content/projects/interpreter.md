---
title: My Interpreter
summary: A programming language interpreter written in Rust, compiled to WebAssembly so you can run it right here in the browser.
date: 2026-10-20
tags: [Rust, WebAssembly, Languages]
cover: /images/interpreter.svg
featured: true
status: active
source: https://github.com/ReelPlum
demo:
  type: wasi
  wasm: /wasm/interpreter/interpreter.wasm
  filename: main.txt
  example: |
    print("Hello from Rust + WASM")
---

This is where the write-up for the interpreter goes. Explain the design, the parser, the
evaluation model, and anything you're proud of.

When the WebAssembly build is ready, drop it into `public/wasm/interpreter/` and the playground
above lights up automatically.

## How it works

- **Lexer** turns source text into tokens.
- **Parser** builds an abstract syntax tree.
- **Evaluator** walks the tree and prints results.
