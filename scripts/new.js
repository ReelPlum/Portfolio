#!/usr/bin/env node
// Creates a new post or project from a template in templates/.
//   npm run new -- post "My first post"
//   npm run new -- project "Tiny Calc"
//   npm run new -- tutorial "Writing a lexer"      (any file in templates/ works)
// New files start as drafts (draft: true): they show in `npm run dev` but not on the live site.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from '../src/lib/content.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export { slugify };

export function fillTemplate(template, { title, date, slug }) {
  return template.replace(/\{\{(title|date|slug)\}\}/g, (_, k) => ({ title: title.replace(/"/g, '\\"'), date, slug })[k]);
}

export function createFromTemplate({ kind, title, date = new Date().toISOString().slice(0, 10), contentDir = join(root, 'src/content'), templateDir = join(root, 'templates') }) {
  const templates = readdirSync(templateDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  if (!templates.includes(kind)) throw new Error(`No template "${kind}". Pick one of: ${templates.join(', ')}`);
  if (!title?.trim()) throw new Error('Give the new post a title: npm run new -- post "My title"');
  const slug = slugify(title);
  if (!slug) throw new Error(`Can't make a file name from "${title}"`);
  const folder = join(contentDir, kind === 'project' ? 'projects' : 'blog');
  const file = join(folder, `${slug}.md`);
  if (existsSync(file)) throw new Error(`${file} already exists`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(file, fillTemplate(readFileSync(join(templateDir, `${kind}.md`), 'utf8'), { title: title.trim(), date, slug }));
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind = 'post', ...words] = process.argv.slice(2);
  try {
    const file = createFromTemplate({ kind, title: words.join(' ') });
    console.log(`Created ${file.replace(`${root}/`, '')} (a draft: set draft: false to publish it)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
