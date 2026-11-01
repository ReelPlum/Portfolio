import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { remarkEmbeds } from './src/lib/remark-embeds.js';
import { rehypeBaseUrls } from './src/lib/rehype-base-urls.js';
import site from './site.config.js';

// BASE_PATH lets the GitHub Pages workflow override the base (it reads it from the Pages settings).
const base = process.env.BASE_PATH || site.base;

export default defineConfig({
  site: process.env.SITE_URL || site.url,
  base,
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkEmbeds],
      rehypePlugins: [[rehypeBaseUrls, { base }]],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
