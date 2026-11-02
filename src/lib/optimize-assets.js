// Astro integration: makes the built site smaller without touching any file a reader downloads.
//   - copies the responsive image variants pages use into dist/_img/ (src/lib/images.js)
//   - compresses 3D models for viewing into dist/_opt/ (the download link keeps the original)
//   - optimises SVG images with SVGO
//   - minifies JSON
// Files under /files/ are downloads and are never changed.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE } from './images.js';

export function listFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out); else out.push(p);
  }
  return out;
}

/** True for files readers download as they are (left alone). */
export const isDownload = (rel) => /^files\//.test(rel.split(sep).join('/'));

/** Every "/_img/…" and "/_opt/…" path the pages refer to. */
export function referencedAssets(htmlFiles, base = '/') {
  const prefix = base.replace(/\/$/, '');
  const img = new Set();
  const opt = new Set();
  const re = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(_img|_opt)(/[^"'\\s,)]+)`, 'g');
  for (const f of htmlFiles) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) (m[1] === '_img' ? img : opt).add(m[2]);
  }
  return { img: [...img].map((p) => p.slice(1)), opt: [...opt] };
}

/** A smaller copy of a .glb / .gltf for viewing: deduplicated, pruned, welded, quantized, WebP textures. */
export async function optimizeModel(input, output) {
  const { NodeIO, Logger } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { dedup, prune, weld, quantize, textureCompress } = await import('@gltf-transform/functions');
  const { default: sharp } = await import('sharp');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(input);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(dedup(), prune(), weld(), quantize(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }));
  const bytes = await io.writeBinary(doc);
  mkdirSync(dirname(output), { recursive: true });
  // Keep whichever is smaller (tiny models can grow from the extra extension data).
  const original = readFileSync(input);
  writeFileSync(output, bytes.length < original.length ? bytes : original);
  return { before: original.length, after: Math.min(bytes.length, original.length) };
}

export async function optimizeSvg(text) {
  const { optimize } = await import('svgo');
  return optimize(text, { multipass: true, plugins: ['preset-default'] }).data;
}

export function minifyJson(text) {
  return JSON.stringify(JSON.parse(text));
}

export function optimizeAssets({ base = '/' } = {}) {
  return {
    name: 'optimize-assets',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const files = listFiles(out);
        const html = files.filter((f) => f.endsWith('.html'));
        const refs = referencedAssets(html, base);
        const report = [];

        // Image variants
        let copied = 0;
        mkdirSync(join(out, '_img'), { recursive: true });
        for (const name of refs.img) {
          const from = join(CACHE, name);
          if (!existsSync(from)) throw new Error(`Image variant ${name} is missing from ${CACHE}`);
          copyFileSync(from, join(out, '_img', name));
          copied++;
        }
        report.push(`${copied} image variants`);

        // 3D models for viewing
        for (const p of refs.opt) {
          const src = join(out, decodeURI(p));
          const dest = join(out, '_opt', decodeURI(p));
          if (!existsSync(src)) throw new Error(`Model ${p} is shown on a page but missing from the build`);
          try {
            const { before, after } = await optimizeModel(src, dest);
            report.push(`${p} ${before} → ${after} bytes`);
          } catch (e) {
            logger.warn(`Couldn't compress ${p} (${e.message}); the original is used`);
            mkdirSync(dirname(dest), { recursive: true });
            copyFileSync(src, dest);
          }
        }

        // SVG and JSON (never downloads)
        let saved = 0;
        for (const f of files) {
          const rel = relative(out, f);
          if (isDownload(rel) || rel.startsWith('_astro')) continue;
          const isSvg = f.endsWith('.svg');
          const isJson = f.endsWith('.json');
          if (!isSvg && !isJson) continue;
          const before = readFileSync(f, 'utf8');
          let after = before;
          try { after = isSvg ? await optimizeSvg(before) : minifyJson(before); } catch (e) { logger.warn(`Left ${rel} as it is: ${e.message}`); }
          if (after.length < before.length) { writeFileSync(f, after); saved += before.length - after.length; }
        }
        report.push(`SVG and JSON ${Math.round(saved / 1024)} KB smaller`);
        logger.info(report.join(', '));
      },
    },
  };
}
