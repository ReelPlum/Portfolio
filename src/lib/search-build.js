import { paragraphs, DEFAULT_MODEL, prefixed } from './search.js';

// Set SEARCH_MODEL to another entry of EMBED_MODELS (src/lib/search.js) to switch models.
export const MODEL = process.env.SEARCH_MODEL || DEFAULT_MODEL;

// The whole-document text is cut to this many characters (nomic-embed-text reads up to 8192 tokens).
const DOC_CHARS = 8000;

/**
 * One vector for the whole document (kind "d": title, description, tags and body) plus one vector per
 * paragraph (kind "p", prefixed with the title so it keeps its context).
 */
export function buildChunks(docs) {
  const chunks = [];
  for (const d of docs) {
    const head = [d.title, d.description, (d.tags || []).join(', ')].filter(Boolean).join('. ');
    const whole = `${head}.\n\n${d.body || ''}`.slice(0, DOC_CHARS);
    chunks.push({ doc: d.id, kind: 'd', text: d.description || d.title, embedText: whole });
    for (const text of paragraphs(d.body || '')) chunks.push({ doc: d.id, kind: 'p', text, embedText: `${d.title}. ${text}` });
  }
  return chunks;
}

let extractor;
export async function embedWithModel(texts) {
  const { pipeline } = await import('@huggingface/transformers');
  extractor ??= await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const out = [];
  const docs = texts.map((t) => prefixed(MODEL, 'document', t));
  for (let i = 0; i < docs.length; i += 16) {
    const t = await extractor(docs.slice(i, i + 16), { pooling: 'mean', normalize: true });
    out.push(...t.tolist());
  }
  return out;
}
