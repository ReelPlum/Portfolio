import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { githubToLocal } from './lib/github-files.js';

// A link to a file on GitHub (https://github.com/you/repo/blob/main/file) becomes the copy the build downloads.
const file = () => z.string().transform(githubToLocal);

const md = '**/[^_]*.{md,mdx}'; // files starting with _ are ignored (drafts / partials)
// The tests build the site from tests/fixtures/content so they don't depend on your real posts.
const root = process.env.CONTENT_DIR || './src/content';

const demo = z.discriminatedUnion('type', [
  // A WASI program (e.g. Rust built with `cargo build --target wasm32-wasip1 --release`).
  // Drop the .wasm into public/wasm/<project>/ and point `wasm` at it. Whatever it prints
  // to stdout / stderr is shown in the console under the editor.
  z.object({
    type: z.literal('wasi'),
    wasm: file(),
    // How the code in the editor reaches the program:
    //   file  -> written to a virtual file and its path passed as the first argument (default)
    //   stdin -> piped to stdin
    input: z.enum(['file', 'stdin']).default('file'),
    filename: z.string().default('main.txt'),
    args: z.array(z.string()).default([]),
    example: z.string().default(''),
    examples: z.array(z.object({ name: z.string(), code: z.string() })).default([]),
  }),
  // A wasm-bindgen / wasm-pack build (--target web). `module` is the generated .js file.
  z.object({
    type: z.literal('bindgen'),
    module: file(),
    entry: z.string().default('run'),
    example: z.string().default(''),
    examples: z.array(z.object({ name: z.string(), code: z.string() })).default([]),
  }),
  // Any page (your own build in public/wasm, or an external URL) shown in a sandboxed frame.
  z.object({ type: z.literal('iframe'), src: file(), height: z.number().default(520) }),
]);

// Projects and blog posts are the same thing: a post. Its tags decide which pages and home page feeds it
// shows up in (see `tags` in site.config.js).
const posts = defineCollection({
  loader: glob({ pattern: md, base: `${root}/posts` }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    summary: z.string().optional(), // older name for description
    tags: z.array(z.string()).default([]),
    cover: file().optional(),
    source: z.string().url().optional(), // "View source" button
    link: z.string().url().optional(), // "Visit" button
    featured: z.boolean().default(false),
    order: z.number().default(0),
    demo: demo.optional(), // runnable playground at the top of the post
    draft: z.boolean().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: md, base: `${root}/pages` }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    nav: z.boolean().default(false),
  }),
});

export const collections = { posts, pages };
