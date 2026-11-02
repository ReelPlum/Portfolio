#!/usr/bin/env node
// Checks the links, images and embeds in the built site:  npm run check:links [-- --external] [dist]
//   --external   also request links to other sites, and look up YouTube / Vimeo videos
// Uses the same base path as the build (BASE_PATH, or `base` in site.config.js).
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import site from '../site.config.js';
import { checkSite } from '../src/lib/link-check.js';

const args = process.argv.slice(2);
const external = args.includes('--external');
const dist = resolve(args.find((a) => !a.startsWith('--')) || 'dist');
const base = process.env.BASE_PATH || site.base;
const siteUrl = process.env.SITE_URL || site.url;

if (!existsSync(dist)) {
  console.error(`${dist} doesn't exist. Run npm run build first.`);
  process.exit(2);
}

const { errors, warnings, stats } = await checkSite({ dist, base, site: siteUrl, external, skip: site.linkCheck?.skip ?? [] });
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`broken: ${e}`);
console.log(`Checked ${stats.internal} links, images and embeds on ${stats.pages} pages${external ? ` and ${stats.external} external URLs` : ''}: ${errors.length} broken, ${warnings.length} warnings.`);
process.exit(errors.length ? 1 : 0);
