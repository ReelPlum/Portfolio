// "Related" posts and projects at the end of each page, picked by how similar their whole-document
// vectors are (the same vectors semantic search uses). Filled in after the build, once the vectors exist.
import { cosine, hashEmbed } from './search.js';
import { iconSvg } from './icons.js';
import { formatDate } from './content.js';

export const RELATED_RE = /<section class="related" data-related="([^"]+)"[^>]*><\/section>/g;

/** The `count` most similar documents to each document: Map id -> [{ doc, score }]. */
export function relatedDocs(docs, vectorFor, { count = 3, min = 0 } = {}) {
  const vecs = new Map(docs.map((d) => [d.id, vectorFor(d)]).filter(([, v]) => v));
  const out = new Map();
  for (const d of docs) {
    const v = vecs.get(d.id);
    if (!v) { out.set(d.id, []); continue; }
    const scored = docs
      .filter((o) => o.id !== d.id && vecs.has(o.id))
      .map((o) => ({ doc: o, score: cosine(v, vecs.get(o.id)) + 0.02 * sharedTags(d, o) }))
      .filter((r) => r.score > min)
      .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    out.set(d.id, scored.slice(0, count));
  }
  return out;
}

const sharedTags = (a, b) => (a.tags || []).filter((t) => (b.tags || []).includes(t)).length;

/** Fallback vectors when the embedding model was not available. */
export const hashVectorFor = (d) => hashEmbed([d.title, d.description, (d.tags || []).join(' '), d.body].filter(Boolean).join('\n'));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function relatedHtml(items) {
  if (!items.length) return '';
  const rows = items.map(({ doc }) => `<li><a class="post-row" href="${esc(doc.url)}" data-icon-trigger>`
    + `<span class="post-row-icon">${iconSvg(doc.type === 'Project' ? 'code' : 'article', { size: 20 })}</span>`
    + `<span class="post-row-text"><span class="post-row-title">${esc(doc.title)}</span>`
    + (doc.description ? `<span class="post-row-desc">${esc(doc.description)}</span>` : '')
    + `</span><span class="post-row-date">${doc.type === 'Project' ? 'Project' : esc(formatDate(doc.date))}</span>`
    + `${iconSvg('chevron_right', { size: 20 })}</a></li>`).join('');
  return `<section class="related" aria-labelledby="related-title"><h2 id="related-title" class="related-title">${iconSvg('account_tree', { size: 20 })}Related</h2><ul class="post-list">${rows}</ul></section>`;
}

/** Replaces the empty related placeholder in a page with the list (or removes it when there is nothing). */
export function injectRelated(html, related) {
  return html.replace(RELATED_RE, (_, id) => relatedHtml(related.get(id) || []));
}
