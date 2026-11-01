// Astro integration: after the build, embed every post / project into dist/search-vectors.json so
// the site can do semantic (vector) search on static hosting.
//
// SEARCH_EMBEDDINGS=model     (default) use the real model; if it can't be downloaded, skip with a warning
// SEARCH_EMBEDDINGS=required  use the real model and fail the build if it can't (used by the deploy)
// SEARCH_EMBEDDINGS=hash      tiny deterministic stand-in, used by the tests
// SEARCH_EMBEDDINGS=off       keyword search only
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildChunks, embedWithModel, MODEL } from './search-build.js';
import { hashEmbed, quantize, HASH_MODEL } from './search.js';

export function searchEmbeddings() {
  return {
    name: 'search-embeddings',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const mode = process.env.SEARCH_EMBEDDINGS || 'model';
        const out = fileURLToPath(dir);
        const indexFile = join(out, 'search-index.json');
        if (mode === 'off' || !existsSync(indexFile)) return;
        const docs = JSON.parse(readFileSync(indexFile, 'utf8'));
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
            return;
          }
        }
        const data = {
          model,
          dim: vectors[0]?.length ?? 0,
          chunks: chunks.map((c, i) => ({ doc: c.doc, k: c.kind, text: c.text, v: quantize(vectors[i]) })),
        };
        writeFileSync(join(out, 'search-vectors.json'), JSON.stringify(data));
        logger.info(`Embedded ${docs.length} documents and ${chunks.length - docs.length} paragraphs with ${model}`);
      },
    },
  };
}
