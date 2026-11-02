// Citations from BibTeX files:  [@knuth1984]  [@knuth1984, p. 12]  [@knuth1984; @nystrom2021]
// Keys come from <content>/references.bib (shared by every post) and, per post, from the files named in
// the front matter's `bibliography:` (paths in public/, e.g. /files/compilers.bib). Cited works are
// numbered in order of first use and listed under "References" at the end of the post.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';

export const CITE_RE = /\[(@[\w:.#$%&+?<>~/-]+(?:,[^;\]]*)?(?:;\s*@[\w:.#$%&+?<>~/-]+(?:,[^;\]]*)?)*)\]/g;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const idFor = (key) => `cite-${key.replace(/[^\w-]/g, '-')}`;

/** Parses "@a, p. 3; @b" into [{ key, locator }]. */
export function parseCitation(inner) {
  return inner.split(';').map((part) => {
    const m = /^\s*@([^,\s]+)\s*(?:,\s*(.+))?$/.exec(part);
    return { key: m[1], locator: m[2]?.trim() || '' };
  });
}

const bibCache = new Map();
/** Entries of a .bib file, by key. */
export function loadBib(path) {
  if (!bibCache.has(path)) {
    const cite = new Cite(readFileSync(path, 'utf8'));
    bibCache.set(path, new Map(cite.data.map((d) => [d.id, d])));
  }
  return bibCache.get(path);
}

/** One reference as HTML (APA style), with its DOI or URL as a link. */
export function formatReference(entry) {
  const text = new Cite(entry).format('bibliography', { format: 'text', template: 'apa', lang: 'en-US' }).trim();
  const url = entry.DOI ? `https://doi.org/${entry.DOI}` : entry.URL;
  if (url && text.includes(url)) return esc(text).replace(esc(url), `<a href="${esc(url)}">${esc(url)}</a>`);
  return esc(text) + (url ? ` <a href="${esc(url)}">${esc(url)}</a>` : '');
}

export function remarkCitations({ contentDir, publicDirs = [] } = {}) {
  return (tree, file) => {
    const where = file?.path ? ` (in ${file.path})` : '';
    // Collect citations first, so posts without any don't read bib files.
    const found = [];
    visit(tree, 'text', (node, index, parent) => {
      if (parent?.type === 'link' || parent?.type === 'inlineCode') return;
      CITE_RE.lastIndex = 0;
      if (CITE_RE.test(node.value)) found.push([node, parent]);
    });
    if (!found.length) return;

    const entries = new Map();
    const shared = contentDir && join(contentDir, 'references.bib');
    if (shared && existsSync(shared)) for (const [k, v] of loadBib(shared)) entries.set(k, v);
    const own = file.data.astro?.frontmatter?.bibliography;
    for (const p of [].concat(own || [])) {
      const dir = publicDirs.find((d) => existsSync(join(d, p)));
      if (!dir) throw new Error(`Bibliography not found: ${p}. Put it in public${p}${where}`);
      for (const [k, v] of loadBib(join(dir, p))) entries.set(k, v);
    }

    const order = [];
    const number = (key) => {
      if (!entries.has(key)) throw new Error(`Citation [@${key}] is not in any .bib file${where}`);
      if (!order.includes(key)) order.push(key);
      return order.indexOf(key) + 1;
    };
    for (const [node, parent] of found) {
      const index = parent.children.indexOf(node);
      const parts = [];
      let last = 0;
      CITE_RE.lastIndex = 0;
      for (const m of node.value.matchAll(CITE_RE)) {
        if (m.index > last) parts.push({ type: 'text', value: node.value.slice(last, m.index) });
        const cites = parseCitation(m[1]);
        const links = cites.map(({ key, locator }) => {
          const n = number(key);
          const title = entries.get(key).title || key;
          return `<a href="#${idFor(key)}" class="citation-link" title="${esc(title)}">${n}${locator ? `, ${esc(locator)}` : ''}</a>`;
        });
        parts.push({ type: 'html', value: `<span class="citation">[${links.join('; ')}]</span>` });
        last = m.index + m[0].length;
      }
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
      parent.children.splice(index, 1, ...parts);
    }
    const items = order.map((key) => `<li id="${idFor(key)}">${formatReference(entries.get(key))}</li>`).join('');
    tree.children.push(
      { type: 'heading', depth: 2, children: [{ type: 'text', value: 'References' }] },
      { type: 'html', value: `<ol class="bibliography">${items}</ol>` },
    );
  };
}
