import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import { STATUS_NAMES } from './lib/status.js';

const md = '**/[^_]*.{md,mdx}'; // files starting with _ are ignored (drafts / partials)
// The tests build the site from tests/fixtures/content so they don't depend on your real posts.
const root = process.env.CONTENT_DIR || './src/content';

const blog = defineCollection({
  loader: glob({ pattern: md, base: `${root}/blog` }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(), // shown as "Updated …" when later than date
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    // Ids from authors.yaml. Leave it out for posts by the site's author (site.config.js `defaultAuthor`).
    authors: z.array(z.string()).optional(),
    draft: z.boolean().default(false), // only shown by `npm run dev`
    bibliography: z.union([z.string(), z.array(z.string())]).optional(), // .bib files in public/ for [@key] citations
  }),
});

const demo = z.discriminatedUnion('type', [
  // A WASI program (e.g. Rust built with `cargo build --target wasm32-wasip1 --release`).
  // Drop the .wasm into public/wasm/<project>/ and point `wasm` at it. Whatever it prints
  // to stdout / stderr is shown in the console under the editor.
  z.object({
    type: z.literal('wasi'),
    wasm: z.string(),
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
    module: z.string(),
    entry: z.string().default('run'),
    example: z.string().default(''),
    examples: z.array(z.object({ name: z.string(), code: z.string() })).default([]),
  }),
  // Any page (your own build in public/wasm, or an external URL) shown in a sandboxed frame.
  z.object({ type: z.literal('iframe'), src: z.string(), height: z.number().default(520) }),
]);

const projects = defineCollection({
  loader: glob({ pattern: md, base: `${root}/projects` }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    source: z.string().url().optional(), // "View source" button
    link: z.string().url().optional(),
    featured: z.boolean().default(false),
    status: z.enum(STATUS_NAMES).optional(), // active, maintained, experimental, paused, finished or archived
    order: z.number().default(0),
    demo: demo.optional(),
    authors: z.array(z.string()).optional(),
    bibliography: z.union([z.string(), z.array(z.string())]).optional(),
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

// Everyone who writes on the site: name, short bio, avatar (a path in public/ or a URL) and links.
const authors = defineCollection({
  loader: file(`${root}/authors.yaml`),
  schema: z.object({
    name: z.string(),
    bio: z.string().optional(),
    avatar: z.string().optional(),
    links: z.array(z.object({ label: z.string(), href: z.string().url(), icon: z.string().optional() })).default([]),
  }),
});

export const collections = { blog, projects, pages, authors };
