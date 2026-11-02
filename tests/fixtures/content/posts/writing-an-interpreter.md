---
title: Notes on writing an interpreter in Rust
date: 2026-10-24
description: Tokens, trees and tree-walking. What I learned building my first language.
tags: [blog, Rust, Languages]
---

Building an interpreter is one of the best ways to learn how programming languages work.
The project page is [[projects/interpreter]].

> The first version only needs to add two numbers. Everything else is detail.

A parser turns $a_1 + a_2$ into a syntax tree before the evaluator walks it.
