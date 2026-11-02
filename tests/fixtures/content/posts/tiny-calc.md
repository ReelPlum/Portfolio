---
title: Tiny Calc
description: A tiny calculator language in about 150 lines of Rust. Runs live in the browser through WASI.
date: 2026-10-01
tags: [project, Rust, WASI]
cover: /images/tiny-calc.svg
source: https://github.com/ReelPlum/Portfolio/tree/main/tests/fixtures/tiny-calc
demo:
  type: wasi
  wasm: /wasm/tiny-calc/tiny-calc.wasm
  filename: main.calc
  examples:
    - name: Basics
      code: |
        # Variables and arithmetic
        let width = 12
        let height = 3.5
        print "Area:"
        print width * height
    - name: Errors
      code: |
        let x = 10
        print x / (5 - 5)
---

Tiny Calc is an example of a WASI program running on this site. Press **Run** to execute the
code. Everything it prints to stdout and stderr shows up in the console.

It is built with `cargo build --release --target wasm32-wasip1`, and the resulting `.wasm` file
lives in `public/wasm/tiny-calc/`.
