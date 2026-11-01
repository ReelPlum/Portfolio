// Search: keyword matching (Fuse.js) for instant, highlighted results, plus optional semantic
// (vector) matching from embeddings computed at build time. Pure functions, no DOM, unit tested.
import Fuse from 'fuse.js';

/* ---------- text preparation ---------- */

/* ---------- LaTeX ---------- */

const MATH_RE = /\$\$([\s\S]+?)\$\$|(?<![\\$\w])\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?![\w$])/g;

/** Finds $inline$ and $$display$$ math. Returns [{ start, end (exclusive), tex, display }]. */
export function findMath(text) {
  const out = [];
  for (const m of String(text).matchAll(MATH_RE)) {
    out.push({ start: m.index, end: m.index + m[0].length, tex: (m[1] ?? m[2]).trim(), display: m[1] !== undefined });
  }
  return out;
}

/**
 * Splits text into parts for rendering, keeping LaTeX whole:
 * [{ type: 'text', text, match } | { type: 'math', tex, display, match }].
 * A math part is marked as a match when any highlight range touches it.
 */
export function renderParts(text, ranges = []) {
  const parts = [];
  const pushText = (from, to) => {
    if (to <= from) return;
    const local = ranges
      .filter(([a, b]) => b >= from && a < to)
      .map(([a, b]) => [Math.max(a, from) - from, Math.min(b, to - 1) - from]);
    for (const seg of segments(text.slice(from, to), local)) parts.push({ type: 'text', ...seg });
  };
  let pos = 0;
  for (const m of findMath(text)) {
    pushText(pos, m.start);
    const match = ranges.some(([a, b]) => b >= m.start && a < m.end);
    parts.push({ type: 'math', tex: m.tex, display: m.display, match });
    pos = m.end;
  }
  pushText(pos, text.length);
  return parts;
}

/* ---------- text preparation ---------- */

/** Markdown -> plain readable text (for indexing and snippets). LaTeX is kept as $...$. */
export function markdownToText(md = '') {
  // Protect math first so markdown clean-up (e.g. "_" emphasis) can't mangle x_1 or a*b.
  const math = [];
  const protectedMd = String(md).replace(MATH_RE, (m) => `\u0000${math.push(m) - 1}\u0000`);
  return protectedMd
    .replace(/^---[\s\S]*?\n---\n/, '') // frontmatter
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1') // keep code, drop fences
    .replace(/<[^>]+>/g, ' ') // html
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
    // headings, quotes, list markers ([ \t], not \s: \s also matches the newline before the line)
    .replace(/^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)(?=\S)([^\n]*?\S)\1/g, '$2') // emphasis, inline code
    .replace(/^[ \t]*(?:https?:\/\/|\/(?!\/))\S+[ \t]*$/gm, '') // bare embed links (videos, PDFs) on their own line
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => math[Number(i)])
    .trim();
}

/** Splits text into passages of roughly `size` characters on sentence / paragraph boundaries. */
export function chunkText(text, size = 400) {
  const sentences = text.split(/(?<=[.!?])\s+|\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > size) {
      chunks.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/* ---------- keyword search ---------- */

export const FIELDS = [
  { key: 'title', label: 'Title', weight: 3 },
  { key: 'description', label: 'Description', weight: 2 },
  { key: 'tags', label: 'Tags', weight: 2 },
  { key: 'body', label: 'Content', weight: 1 },
];

export function createKeywordIndex(docs) {
  return new Fuse(docs, {
    keys: FIELDS.map(({ key, weight }) => ({ name: key, weight })),
    includeMatches: true,
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.3,
    minMatchCharLength: 2,
  });
}

export const tokenize = (q) => [...new Set(String(q).toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter((t) => t.length >= 2))];

/** Character ranges [start, end] (inclusive) where any query word occurs in `text`, merged. */
export function termRanges(text, query) {
  const lower = String(text).toLowerCase();
  const ranges = [];
  for (const t of tokenize(query)) {
    let i = lower.indexOf(t);
    while (i !== -1) {
      ranges.push([i, i + t.length - 1]);
      i = lower.indexOf(t, i + t.length);
    }
  }
  return mergeRanges(ranges);
}

export function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * Ranges to highlight in a field: exact query words, plus Fuse's fuzzy match ranges that are long
 * enough to be meaningful (Fuse also reports scattered one or two letter hits, which look like noise).
 */
export function highlightRanges(text, query, fuseIndices = []) {
  const min = Math.max(3, Math.min(...tokenize(query).map((t) => t.length), 99) - 1);
  const fuzzy = fuseIndices.filter(([a, b]) => b - a + 1 >= min);
  return mergeRanges([...termRanges(text, query), ...fuzzy]);
}

/** Splits text into [{ text, match }] segments for rendering. */
export function segments(text, ranges) {
  const out = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) out.push({ text: text.slice(pos, a), match: false });
    out.push({ text: text.slice(a, b + 1), match: true });
    pos = b + 1;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), match: false });
  return out;
}

/** A window of `radius` characters around the first highlight, with ranges shifted to match. */
export function snippet(text, ranges, radius = 90) {
  if (!ranges.length) {
    if (text.length <= radius * 2) return { text, ranges: [] };
    let end = radius * 2;
    for (const m of findMath(text)) if (m.start < end && m.end > end) end = m.start;
    return { text: `${text.slice(0, end).trimEnd()}…`, ranges: [] };
  }
  let start = Math.max(0, ranges[0][0] - radius);
  let end = Math.min(text.length, ranges[0][1] + 1 + radius);
  // don't cut words in half
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(' ', end) > ranges[0][1] ? text.lastIndexOf(' ', end) : end;
  // never cut a formula in half
  for (const m of findMath(text)) {
    if (m.start < start && m.end > start) start = m.start;
    if (m.start < end && m.end > end) end = m.end;
  }
  const pre = start > 0 ? '…' : '';
  const post = end < text.length ? '…' : '';
  const shift = pre.length - start;
  const inside = ranges.filter(([a, b]) => a >= start && b < end).map(([a, b]) => [a + shift, b + shift]);
  return { text: pre + text.slice(start, end) + post, ranges: inside };
}

/** Keyword results: [{ doc, score (0..1, higher is better), matches: { field: [[a,b]...] } }]. */
export function keywordSearch(fuse, query) {
  if (!query.trim()) return [];
  return fuse.search(query).map((r) => {
    const matches = {};
    for (const m of r.matches || []) {
      const key = m.key === 'tags' ? `tags:${m.refIndex}` : m.key;
      matches[key] = m.indices;
    }
    return { doc: r.item, score: 1 - (r.score ?? 1), matches };
  });
}

/* ---------- vectors ---------- */

export function quantize(vec) {
  return Array.from(vec, (x) => Math.max(-127, Math.min(127, Math.round(x * 127))));
}
export function dequantize(q) {
  return Float32Array.from(q, (x) => x / 127);
}
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * A tiny deterministic "embedding" (hashed bag of words). Used by the tests and as an offline
 * fallback when the real model can't be downloaded at build time. Not semantic, but the same plumbing.
 */
export const HASH_MODEL = 'hash-bow-256';
export function hashEmbed(text, dim = 256) {
  const v = new Float32Array(dim);
  for (const t of tokenize(text)) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
    v[(h >>> 0) % dim] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

/** Best chunk per doc: Map(docId -> { score, chunk }) */
export function semanticScores(queryVec, chunks) {
  const best = new Map();
  for (const c of chunks) {
    const s = cosine(queryVec, c.vec);
    const cur = best.get(c.doc);
    if (!cur || s > cur.score) best.set(c.doc, { score: s, chunk: c.text });
  }
  return best;
}

/**
 * Combines keyword and semantic results. Keyword hits always show; semantic-only hits show when
 * their similarity clears `minSemantic`.
 */
export function mergeResults(keyword, semantic, docs, { minSemantic = 0.35, kwWeight = 0.6 } = {}) {
  const byId = new Map(keyword.map((r) => [r.doc.id, { ...r, kw: r.score, sem: 0, passage: null }]));
  if (semantic) {
    for (const [id, { score, chunk }] of semantic) {
      const hit = byId.get(id);
      if (hit) {
        hit.sem = score;
        hit.passage = chunk;
      } else if (score >= minSemantic) {
        const doc = docs.find((d) => d.id === id);
        if (doc) byId.set(id, { doc, kw: 0, sem: score, matches: {}, passage: chunk });
      }
    }
  }
  const results = [...byId.values()].map((r) => ({
    ...r,
    score: semantic ? kwWeight * r.kw + (1 - kwWeight) * Math.max(0, r.sem) : r.kw,
    semanticOnly: r.kw === 0,
  }));
  return results.sort((a, b) => b.score - a.score);
}

/**
 * The fields to show for one result, each with highlight ranges.
 * Returns [{ key, label, text, ranges }] in display order; tags come back as `tags` with `items`.
 */
export function matchedFields(result, query) {
  const { doc, matches } = result;
  const out = [];
  const titleRanges = highlightRanges(doc.title, query, matches.title);
  out.push({ key: 'title', label: 'Title', text: doc.title, ranges: titleRanges, matched: titleRanges.length > 0 });
  if (doc.description) {
    const r = highlightRanges(doc.description, query, matches.description);
    out.push({ key: 'description', label: 'Description', text: doc.description, ranges: r, matched: r.length > 0 });
  }
  const tags = (doc.tags || []).map((t, i) => ({ text: t, ranges: highlightRanges(t, query, matches[`tags:${i}`]) }));
  if (tags.some((t) => t.ranges.length)) out.push({ key: 'tags', label: 'Tags', items: tags, matched: true });
  const bodyRanges = highlightRanges(doc.body || '', query, matches.body);
  if (bodyRanges.length) {
    out.push({ key: 'body', label: 'Content', ...snippet(doc.body, bodyRanges), matched: true });
  } else if (result.passage) {
    const r = termRanges(result.passage, query);
    out.push({ key: 'passage', label: 'Related passage', ...snippet(result.passage, r, 140), matched: true });
  }
  return out;
}
