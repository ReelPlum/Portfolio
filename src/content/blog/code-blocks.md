---
title: Showing code on this site
date: 2026-11-01
description: Highlighted code blocks in any language, with a label, a file name and a copy button, plus code pulled straight from a source file.
tags: [Meta, Code]
---

Every code block on this site shows which language it is, can show a file name, and has a copy button in
its top right corner. Highlighting works for every language [Shiki](https://shiki.style/languages) knows,
and the colours follow your light or dark setting.

## A fenced block

Write three backticks and the language name, then the code, then three backticks:

```rust
fn main() {
    let names = ["Ada", "Grace", "Barbara"];
    for (i, name) in names.iter().enumerate() {
        println!("{i}: hello, {name}!");
    }
}
```

## With a file name

Add `title="..."` after the language and the name shows in the header:

```python title="fib.py"
from functools import cache

@cache
def fib(n: int) -> int:
    """The n-th Fibonacci number."""
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print([fib(n) for n in range(10)])
```

## Code from a file

Put the file in `public/code/` and write its path on a line of its own. The block is read from the file
when the site is built, so the post always shows the current version. The file name links to the raw file.

/code/interpreter/lexer.rs#L26-L46

Add `#L10-L20` to the path to show only those lines (as above), or leave it off for the whole file. A
path to a file that doesn't exist, or lines past the end of it, stops the build with a message saying
which post and which file, so a broken include never reaches the site.

## Many languages

```typescript
type Shape = { kind: 'circle'; r: number } | { kind: 'square'; side: number };

export const area = (s: Shape): number =>
  s.kind === 'circle' ? Math.PI * s.r ** 2 : s.side ** 2;
```

```go
package main

import "fmt"

func main() {
	ch := make(chan int)
	go func() { ch <- 42 }()
	fmt.Println(<-ch)
}
```

```c
#include <stdio.h>

int main(void) {
    for (int i = 1; i <= 3; i++) printf("%d\n", i * i);
    return 0;
}
```

```haskell
quicksort :: Ord a => [a] -> [a]
quicksort [] = []
quicksort (p:xs) = quicksort [x | x <- xs, x < p] ++ [p] ++ quicksort [x | x <- xs, x >= p]
```

```sql
SELECT author, count(*) AS posts
FROM blog
WHERE published_at > now() - interval '1 year'
GROUP BY author
ORDER BY posts DESC;
```

```bash
cargo build --target wasm32-wasip1 --release
cp target/wasm32-wasip1/release/interpreter.wasm public/wasm/interpreter/
```

```json
{ "name": "portfolio", "private": true, "scripts": { "build": "astro build" } }
```

```diff
- let total = items.len();
+ let total = items.iter().filter(|i| i.visible).count();
```

```text
Plain text stays plain: no colours, still copyable.
```
