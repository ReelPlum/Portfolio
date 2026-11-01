import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { remarkEmbeds } from './src/lib/remark-embeds.js';
import { rehypeBaseUrls } from './src/lib/rehype-base-urls.js';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import site from './site.config.js';

// Test builds (CONTENT_DIR=tests/fixtures/content) also copy tests/fixtures/public into the output.
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

export default defineConfig({
  site: process.env.SITE_URL || site.url,
  base,
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap(), copyFixturePublic],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkEmbeds],
      rehypePlugins: [[rehypeBaseUrls, { base }]],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
