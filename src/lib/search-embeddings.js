// Astro integration: after the build, embed every post / project into dist/search-vectors.json so
// the site can do semantic (vector) search on static hosting.
//
// SEARCH_EMBEDDINGS=model     (default) use the real model; if it can't be downloaded, skip with a warning
// SEARCH_EMBEDDINGS=required  use the real model and fail the build if it can't (used by the deploy)
// SEARCH_EMBEDDINGS=hash      tiny deterministic stand-in, used by the tests
// SEARCH_EMBEDDINGS=off       keyword search only
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildChunks, embedWithModel, MODEL } from './search-build.js';
import { hashEmbed, quantize, HASH_MODEL } from './search.js';
import { relatedDocs, hashVectorFor, injectRelated } from './related.js';

const htmlFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? htmlFiles(p) : e.name.endsWith('.html') ? [p] : [];
});

/** Fills the related-posts placeholder on every page (see src/lib/related.js). */
export function writeRelated(out, docs, vectorFor) {
  const related = relatedDocs(docs, vectorFor);
  for (const f of htmlFiles(out)) {
    const html = readFileSync(f, 'utf8');
    if (html.includes('data-related=')) writeFileSync(f, injectRelated(html, related));
  }
}

export function searchEmbeddings() {
  return {
    name: 'search-embeddings',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const mode = process.env.SEARCH_EMBEDDINGS || 'model';
        const out = fileURLToPath(dir);
        const indexFile = join(out, 'search-index.json');
        if (!existsSync(indexFile)) return;
        const docs = JSON.parse(readFileSync(indexFile, 'utf8'));
        if (mode === 'off') return writeRelated(out, docs, hashVectorFor);
        const chunks = buildChunks(docs);
        let model = HASH_MODEL;
        let vectors;
        if (mode === 'hash') {
          vectors = chunks.map((c) => hashEmbed(c.embedText));
        } else {
          try {
            vectors = await embedWithModel(chunks.map((c) => c.embedText));
            model = MODEL;
          } catch (e) {
            if (mode === 'required') throw new Error(`Could not compute search embeddings: ${e.message}`);
            logger.warn(`Semantic search disabled, the embedding model could not be loaded (${e.message}). Keyword search still works.`);
            return writeRelated(out, docs, hashVectorFor);
          }
        }
        const data = {
          model,
          dim: vectors[0]?.length ?? 0,
          chunks: chunks.map((c, i) => ({ doc: c.doc, k: c.kind, text: c.text, v: quantize(vectors[i]) })),
        };
        writeFileSync(join(out, 'search-vectors.json'), JSON.stringify(data));
        const docVectors = new Map(chunks.map((c, i) => [c, vectors[i]]).filter(([c]) => c.kind === 'd').map(([c, v]) => [c.doc, v]));
        writeRelated(out, docs, (d) => docVectors.get(d.id));
        logger.info(`Embedded ${docs.length} documents and ${chunks.length - docs.length} paragraphs with ${model}`);
      },
    },
  };
}
