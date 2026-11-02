import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { remarkEmbeds } from './src/lib/remark-embeds.js';
import { remarkReferences } from './src/lib/remark-references.js';
import { rehypeBaseUrls } from './src/lib/rehype-base-urls.js';
import { remarkLatexPreamble, rehypeKatexPerPost } from './src/lib/remark-latex-preamble.js';
import { remarkCode } from './src/lib/remark-code.js';
import { remarkCallouts } from './src/lib/remark-callouts.js';
import { remarkCitations } from './src/lib/citations.js';
import { remarkSnippets } from './src/lib/snippets.js';
import { remarkLiveVars } from './src/lib/live-vars.js';
import { remarkMathRefs } from './src/lib/remark-math-refs.js';
import { rehypeHeadingAnchors } from './src/lib/rehype-heading-anchors.js';
import { rehypeSidenotes } from './src/lib/rehype-sidenotes.js';
import { rehypeDownloadLinks } from './src/lib/rehype-download-links.js';
import { rehypeExternalLinks } from './src/lib/rehype-external-links.js';
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
// Where code files included with a path on its own line (e.g. /code/main.rs) are read from.
const publicDirs = [fileURLToPath(new URL('./public/', import.meta.url)), ...(fixturePublic ? [fixturePublic] : [])];
const siteUrl = process.env.SITE_URL || site.url;
const targets = buildTargets(fileURLToPath(new URL(`./${contentDir}/`, import.meta.url)));

export default defineConfig({
  site: siteUrl,
  base,
  trailingSlash: 'ignore',
  // transformers.js and pdf.js are big but only load when someone searches / a page has a PDF.
  vite: { build: { chunkSizeWarningLimit: 1500 } },
  integrations: [mdx(), sitemap({ filter: (page) => !/\/search\/$/.test(page) }), copyFixturePublic, searchEmbeddings()],
  markdown: {
    processor: unified({
      remarkPlugins: [[remarkSnippets, { dir: fileURLToPath(new URL(`./${contentDir}/snippets/`, import.meta.url)) }], remarkLatexPreamble, remarkLiveVars, [remarkCode, { publicDirs, base }], remarkMath, [remarkEmbeds, { base, publicDirs }], [remarkReferences, { targets, base }], remarkCallouts, remarkMathRefs, [remarkCitations, { contentDir: fileURLToPath(new URL(`./${contentDir}/`, import.meta.url)), publicDirs }]],
      rehypePlugins: [[rehypeKatexPerPost, { strict: false, throwOnError: false }], [rehypeBaseUrls, { base }], [rehypeExternalLinks, { site: siteUrl, base }], [rehypeDownloadLinks, { publicDirs, base }], rehypeSidenotes, rehypeHeadingAnchors],
    }),
    // Code blocks are highlighted by src/lib/remark-code.js (adds the language label and copy button).
    syntaxHighlight: false,
  },
});
