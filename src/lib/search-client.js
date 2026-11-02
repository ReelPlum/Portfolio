// Browser side of search: loads the index, runs keyword search instantly and semantic search once
// the embedding model is ready, and renders results with highlighted matches and LaTeX.
import katex from 'katex';
import {
  createKeywordIndex, keywordSearch, mergeResults, matchedFields, renderParts,
  semanticScores, dequantize, hashEmbed, HASH_MODEL, prefixed,
} from './search.js';
import { formatDate } from './content.js';
import { macrosFrom } from './latex.js';

// Each post's own LaTeX macros (from its ```preamble block), built once per post.
const macroCache = new Map();
const macrosFor = (doc) => {
  if (!doc?.preamble) return undefined;
  if (!macroCache.has(doc.id)) macroCache.set(doc.id, macrosFrom(doc.preamble));
  return macroCache.get(doc.id);
};

const base = import.meta.env.BASE_URL;
let indexPromise;
let vectorsPromise;
let embedderPromise;

export function loadIndex() {
  indexPromise ??= fetch(`${base}search-index.json`).then((r) => r.json()).then((docs) => ({ docs, fuse: createKeywordIndex(docs) }));
  return indexPromise;
}

function loadVectors() {
  vectorsPromise ??= fetch(`${base}search-vectors.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => data && { ...data, chunks: data.chunks.map((c) => ({ doc: c.doc, kind: c.k, text: c.text, vec: dequantize(c.v) })) })
    .catch(() => null);
  return vectorsPromise;
}

/** Resolves to a function text -> vector, or null when semantic search is unavailable. */
export function loadEmbedder() {
  embedderPromise ??= loadVectors().then(async (vectors) => {
    if (!vectors) return null;
    if (vectors.model === HASH_MODEL) return { vectors, embed: async (t) => hashEmbed(t, vectors.dim) };
    // The model and runtime are ~140 MB on the first search (cached afterwards); respect data saver.
    if (navigator.connection?.saveData) return null;
    const { pipeline } = await import('@huggingface/transformers');
    const extractor = await pipeline('feature-extraction', vectors.model, { dtype: 'q8' });
    return { vectors, embed: async (t) => (await extractor(prefixed(vectors.model, 'query', t), { pooling: 'mean', normalize: true })).data };
  }).catch((e) => {
    console.warn('Semantic search unavailable:', e);
    return null;
  });
  return embedderPromise;
}

/** Keyword results right away; calls onUpdate again with hybrid results once vectors are ready. */
export async function search(query, onUpdate) {
  const { docs, fuse } = await loadIndex();
  const kw = keywordSearch(fuse, query);
  onUpdate(mergeResults(kw, null, docs), { semantic: 'loading' });
  if (!query.trim()) return;
  const sem = await loadEmbedder();
  if (!sem) return onUpdate(mergeResults(kw, null, docs), { semantic: 'off' });
  const qv = await sem.embed(query);
  onUpdate(mergeResults(kw, semanticScores(qv, sem.vectors.chunks), docs), { semantic: 'on' });
}

/* ---------- rendering ---------- */

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Text with <mark>ed matches and LaTeX rendered by KaTeX. */
export function renderRich(text, ranges, macros) {
  const frag = document.createDocumentFragment();
  for (const part of renderParts(text, ranges)) {
    let node;
    if (part.type === 'math') {
      node = el('span', `search-math${part.display ? ' search-math-display' : ''}`);
      node.innerHTML = katex.renderToString(part.tex, { throwOnError: false, displayMode: false, macros });
    } else node = document.createTextNode(part.text);
    if (part.match) {
      const mark = el('mark');
      mark.append(node);
      node = mark;
    }
    frag.append(node);
  }
  return frag;
}

export function renderResults(list, results, query, { limit = Infinity, icons = {} } = {}) {
  list.replaceChildren();
  for (const r of results.slice(0, limit)) {
    const li = el('li', 'search-result');
    const a = el('a', 'search-result-link');
    a.href = r.doc.url;
    a.dataset.iconTrigger = '';
    const head = el('div', 'search-result-head');
    const type = el('span', 'search-type');
    type.innerHTML = icons[`type:${r.doc.icon}`] || (r.doc.type === 'Project' ? icons.project : icons.post) || '';
    type.append(r.doc.type);
    head.append(type);
    if (r.doc.date) head.append(el('span', 'search-date', formatDate(r.doc.date)));
    if (r.semanticOnly) {
      const chip = el('span', 'search-chip');
      chip.innerHTML = icons.semantic || '';
      chip.append('Similar meaning');
      head.append(chip);
    }
    a.append(head);
    const fields = matchedFields(r, query);
    const [title, ...rest] = fields;
    const h = el('h3', 'search-title');
    const macros = macrosFor(r.doc);
    h.append(renderRich(title.text, title.ranges, macros));
    a.append(h);
    const dl = el('dl', 'search-fields');
    for (const f of rest) {
      if (!f.matched) continue;
      const dt = el('dt', null, f.label);
      const dd = el('dd', `search-match search-match-${f.key}`);
      if (f.key === 'tags') {
        for (const t of f.items) {
          const tag = el('span', 'tag');
          tag.append(renderRich(t.text, t.ranges, macros));
          dd.append(tag);
        }
      } else dd.append(renderRich(f.text, f.ranges, macros));
      dl.append(dt, dd);
    }
    if (dl.children.length) a.append(dl);
    else if (r.doc.description) a.append(el('p', 'search-desc', r.doc.description));
    li.append(a);
    list.append(li);
  }
}
