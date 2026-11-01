// Cross references between content: write [[slug]], [[blog/slug]], [[projects/slug]] or
// [[slug|custom text]] in any markdown file and it becomes a link to that post / project / page.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';

export const REF_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/g;

const COLLECTIONS = { blog: '/blog/', projects: '/projects/', pages: '/' };

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/** Reads every content file and returns Map("collection/slug" -> { title, url, collection, slug }). */
export function buildTargets(contentDir) {
  const targets = new Map();
  for (const [collection, prefix] of Object.entries(COLLECTIONS)) {
    const base = join(contentDir, collection);
    for (const file of walk(base)) {
      if (!/\.mdx?$/.test(file) || /(^|\/)_/.test(relative(base, file))) continue;
      const slug = relative(base, file).replace(/\.mdx?$/, '').replace(/\\/g, '/').toLowerCase();
      const { frontmatter } = parseFrontmatter(readFileSync(file, 'utf8'));
      targets.set(`${collection}/${slug}`, { collection, slug, title: frontmatter.title || slug, url: `${prefix}${slug}/` });
    }
  }
  return targets;
}

/**
 * Finds the target for a reference. "blog/x" and "projects/x" are exact; a bare "x" is looked up in
 * projects, then blog, then pages, and is an error if it matches more than one.
 */
export function resolveRef(ref, targets) {
  const key = ref.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (targets.has(key)) return targets.get(key);
  const hits = Object.keys(COLLECTIONS).map((c) => targets.get(`${c}/${key}`)).filter(Boolean);
  if (hits.length > 1) throw new Error(`Reference [[${ref}]] is ambiguous: write ${hits.map((h) => `[[${h.collection}/${h.slug}]]`).join(' or ')}`);
  if (!hits.length) throw new Error(`Reference [[${ref}]] does not match any post, project or page`);
  return hits[0];
}

/** "collection/slug" keys referenced in a markdown body (ignores unknown references). */
export function findReferences(body, targets) {
  const out = new Set();
  for (const m of String(body).matchAll(REF_RE)) {
    try {
      const t = resolveRef(m[1], targets);
      out.add(`${t.collection}/${t.slug}`);
    } catch { /* reported by the remark plugin at build time */ }
  }
  return [...out];
}
