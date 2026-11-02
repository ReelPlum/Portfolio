---
title: How a tree-walking interpreter runs your code
date: 2026-10-28
description: From characters to tokens to a syntax tree to output, and how the whole thing ends up running in a browser tab.
tags: [blog, Rust, Interpreters, WebAssembly]
---

An interpreter is a program that reads another program and does what it says. A tree-walking interpreter,
like the one in [[interpreter]], does it in three stages: it chops the text into tokens, arranges the
tokens into a tree, and then walks that tree, doing the work at each node. Each stage only knows about the
one before it, which keeps every part small enough to understand on its own.

## Lexing: from characters to tokens

The lexer reads the source one character at a time and groups characters into tokens: numbers, names,
strings, operators and brackets. It throws away whitespace and comments, and it is the only part of the
interpreter that counts lines, so it attaches line numbers to everything it produces. When the text
contains a character that can't start any token, like a stray `@`, the lexer is where the error comes from.

## Parsing: from tokens to a syntax tree

The parser takes the flat list of tokens and builds an abstract syntax tree, where every node is an
expression or a statement and its children are the parts it's made of. The hard part is operator
precedence: in `1 + 2 * 3` the multiplication has to end up deeper in the tree than the addition. A
recursive descent parser handles this with one function per precedence level, each calling the next
tighter level for its operands. Pratt parsing does the same with a table of binding powers instead.

## Evaluating: walking the tree

Evaluation is a recursive function over the tree. A number node returns its value, an addition node
evaluates both children and adds them, and a print statement evaluates its argument and writes it out.
Because the tree already encodes precedence and grouping, the evaluator never has to think about brackets.
This is why it's called tree walking: the computer literally visits each node every time the code runs.

## Variables and scopes

Variables live in an environment, a map from names to values. Every block or function call gets a new
environment that points to its parent, and looking up a name walks outward through the chain until it
finds a match. That chain is what makes shadowing work, and it is also what makes closures possible: a
function value keeps a reference to the environment it was created in, so it can still see those
variables after the surrounding function has returned.

## Reporting errors people can fix

A good error says what went wrong, where, and ideally what was expected instead. Since every token
carries its line and column, the parser can say "expected `)` after the argument list on line 4"
instead of just failing. Runtime errors, like dividing by zero or calling something that isn't a
function, are reported the same way, with the line of the node that was being evaluated.

## Memory without a garbage collector

In Rust there's no garbage collector to lean on. Values that are shared, such as environments captured
by several closures, are wrapped in reference-counted pointers (`Rc`), and the ones that can change are
wrapped again in `RefCell` so they can be mutated through a shared reference. The cost is that a closure
that refers to itself creates a cycle that is never freed, which is fine for short scripts but would need
weak references or a real collector in a long-running program.

## Running it in the browser with WebAssembly

The interpreter is compiled to WebAssembly with the `wasm32-wasip1` target, so it's an ordinary command
line program that reads a file and prints to standard output. The browser has no files or terminal, so
the page provides them with a small WASI shim: the code in the editor becomes a virtual file, and
whatever the program writes to stdout and stderr is captured and shown in the console under the editor.
Nothing runs on a server; it's all in the tab.

## Making it faster

Walking a tree is simple but slow, because every evaluation chases pointers and dispatches on node types.
The usual next step is to compile the tree to bytecode, a flat list of simple instructions for a small
virtual machine with a stack. Bytecode is more compact, friendlier to the CPU cache, and lets you do
optimisations like constant folding once instead of every time a loop runs. For a teaching language,
tree walking is plenty fast, and it's much easier to get right first.
