import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { remarkEmbeds } from './src/lib/remark-embeds.js';
import { remarkReferences } from './src/lib/remark-references.js';
import { rehypeBaseUrls } from './src/lib/rehype-base-urls.js';
import { buildTargets } from './src/lib/references.js';
import { searchEmbeddings } from './src/lib/search-embeddings.js';
import site from './site.config.js';

// The tests build the site from tests/fixtures (CONTENT_DIR) so they don't depend on your real posts.
const contentDir = process.env.CONTENT_DIR || 'src/content';
const fixturePublic = process.env.CONTENT_DIR ? fileURLToPath(new URL('./tests/fixtures/public/', import.meta.url)) : null;
if (fixturePublic) process.env.EXTRA_PUBLIC_DIR = fixturePublic;
const copyFixturePublic = {
  name: 'copy-fixture-public',
  hooks: {
    'astro:build:done': ({ dir }) => { if (fixturePublic) cpSync(fixturePublic, fileURLToPath(dir), { recursive: true }); },
  },
};

// BASE_PATH lets the GitHub Pages workflow override the base (it reads it from the Pages settings).
const base = process.env.BASE_PATH || site.base;
const targets = buildTargets(fileURLToPath(new URL(`./${contentDir}/`, import.meta.url)));

export default defineConfig({
  site: process.env.SITE_URL || site.url,
  base,
  trailingSlash: 'ignore',
  // transformers.js and pdf.js are big but only load when someone searches / a page has a PDF.
  vite: { build: { chunkSizeWarningLimit: 1500 } },
  integrations: [mdx(), sitemap({ filter: (page) => !/\/search\/$/.test(page) }), copyFixturePublic, searchEmbeddings()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath, [remarkEmbeds, { base }], [remarkReferences, { targets, base }]],
      rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }], [rehypeBaseUrls, { base }]],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
