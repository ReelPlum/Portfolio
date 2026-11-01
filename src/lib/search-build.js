import { chunkText } from './search.js';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';

/** One summary passage per document plus its body split into passages. */
export function buildChunks(docs) {
  const chunks = [];
  for (const d of docs) {
    const head = [d.title, d.description, (d.tags || []).join(', ')].filter(Boolean).join('. ');
    chunks.push({ doc: d.id, text: d.description || d.title, embedText: head });
    for (const text of chunkText(d.body || '')) chunks.push({ doc: d.id, text, embedText: `${d.title}. ${text}` });
  }
  return chunks;
}

let extractor;
export async function embedWithModel(texts) {
  const { pipeline } = await import('@huggingface/transformers');
  extractor ??= await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const t = await extractor(texts.slice(i, i + 32), { pooling: 'mean', normalize: true });
    out.push(...t.tolist());
  }
  return out;
}
