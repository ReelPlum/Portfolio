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
import { remarkGithubFiles } from './src/lib/remark-github-files.js';
import { createGithubFiles } from './src/lib/github-files.js';
import { githubFilesIntegration } from './src/lib/github-files-integration.js';
import { remarkProducts } from './src/lib/remark-products.js';
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
// Files linked from other GitHub repositories are downloaded here during the build (src/lib/github-files.js).
// GITHUB_FILES_TOKEN lets it read private repositories. The tests read them from tests/fixtures/github instead.
const githubFiles = createGithubFiles({
  dir: fileURLToPath(new URL('./.cache/github-files/', import.meta.url)),
  token: process.env.GITHUB_FILES_TOKEN || '',
  mockDir: process.env.GITHUB_FILES_MOCK_DIR || (process.env.CONTENT_DIR ? fileURLToPath(new URL('./tests/fixtures/github/', import.meta.url)) : null),
});
process.env.GITHUB_FILES_DIR = githubFiles.dir;
// Where code files included with a path on its own line (e.g. /code/main.rs) are read from.
const publicDirs = [fileURLToPath(new URL('./public/', import.meta.url)), ...(fixturePublic ? [fixturePublic] : []), githubFiles.dir];
const siteUrl = process.env.SITE_URL || site.url;
// Products used by more than one post (`use: name` in a ```product block).
const productsDir = fileURLToPath(new URL(`./${contentDir}/products/`, import.meta.url));
const targets = buildTargets(fileURLToPath(new URL(`./${contentDir}/`, import.meta.url)));

export default defineConfig({
  site: siteUrl,
  base,
  trailingSlash: 'ignore',
  // transformers.js and pdf.js are big but only load when someone searches / a page has a PDF.
  vite: { build: { chunkSizeWarningLimit: 1500 } },
  integrations: [githubFilesIntegration({ files: githubFiles, contentDir: fileURLToPath(new URL(`./${contentDir}/`, import.meta.url)), base }), mdx(), sitemap({ filter: (page) => !/\/search\/$/.test(page) }), copyFixturePublic, searchEmbeddings()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkLatexPreamble, [remarkGithubFiles, { files: githubFiles }], [remarkProducts, { base, productsDir, affiliates: site.affiliates, author: site.author }], [remarkCode, { publicDirs, base }], remarkMath, [remarkEmbeds, { base, publicDirs }], [remarkReferences, { targets, base }]],
      rehypePlugins: [[rehypeKatexPerPost, { strict: false, throwOnError: false }], [rehypeBaseUrls, { base }], [rehypeExternalLinks, { site: siteUrl, base }], [rehypeDownloadLinks, { publicDirs, base }]],
    }),
    // Code blocks are highlighted by src/lib/remark-code.js (adds the language label and copy button).
    syntaxHighlight: false,
  },
});
