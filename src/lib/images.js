// Responsive, modern-format images for the built site.
//
// Every raster image from public/ that a post shows (png, jpg, webp…) gets AVIF and WebP copies in a few
// widths, served with <picture> and srcset so each screen downloads only the size it needs. The original
// file is untouched and stays the fallback, so links to it (and downloads) keep working. Every image also
// gets its width and height (no layout jumps) and lazy loading.
//
// Variants are made once into node_modules/.cache/portfolio-images/ (keyed by the file's content) and
// copied to dist/_img/ after the build. `npm run dev` shows the originals.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

export const RASTER = /\.(png|jpe?g|webp|avif|tiff?)$/i;
export const WIDTHS = [480, 800, 1200, 1600, 2400];
export const FORMATS = [['avif', 'image/avif', { quality: 55, effort: 4 }], ['webp', 'image/webp', { quality: 78 }]];
export const CACHE = join(process.cwd(), 'node_modules', '.cache', 'portfolio-images');
// How wide images are shown: the post column (wider on big screens), or the screen on phones.
export const PROSE_SIZES = '(min-width: 1600px) 880px, (min-width: 800px) 780px, calc(100vw - 32px)';

/** Widths to make for an image `width` pixels wide: the standard ones below it, plus its own. */
export function variantWidths(width) {
  const max = Math.min(width, WIDTHS.at(-1));
  return [...WIDTHS.filter((w) => w < max), max];
}

/** Width and height of an SVG from its attributes or viewBox. */
export function svgSize(text) {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] || '';
  const num = (name) => Number(new RegExp(`\\s${name}="([\\d.]+)(?:px)?"`).exec(tag)?.[1]) || null;
  let w = num('width');
  let h = num('height');
  const vb = /viewBox="([^"]+)"/.exec(tag)?.[1]?.split(/[\s,]+/).map(Number);
  if ((!w || !h) && vb?.length === 4) {
    if (w && !h) h = Math.round((w * vb[3]) / vb[2]);
    else if (h && !w) w = Math.round((h * vb[2]) / vb[3]);
    else { w = vb[2]; h = vb[3]; }
  }
  return w && h ? { width: Math.round(w), height: Math.round(h) } : null;
}

const cache = new Map();
/**
 * Width, height and (when `variants` is on) <source> sets for an image in public/.
 * Returns null for images that aren't in public/ (other sites, data: URLs).
 */
export async function imageInfo(src, { publicDirs, hrefFor = (p) => p, variants = true } = {}) {
  if (!src || !src.startsWith('/') || src.startsWith('//')) return null;
  const path = decodeURI(src.split(/[?#]/)[0]);
  const dir = publicDirs.find((d) => existsSync(join(d, path)));
  if (!dir) return null;
  const key = `${path}|${variants}`;
  if (!cache.has(key)) cache.set(key, compute(join(dir, path), variants));
  const info = await cache.get(key);
  // Regression: the first caller's base path was cached into every later caller's srcset.
  return info && {
    ...info,
    sources: info.sources.map(({ type, files }) => ({ type, srcset: files.map(([name, w]) => `${hrefFor(`/_img/${name}`)} ${w}w`).join(', ') })),
  };
}

async function compute(file, variants) {
  if (/\.svg$/i.test(file)) {
    const size = svgSize(readFileSync(file, 'utf8'));
    return size ? { ...size, sources: [] } : null;
  }
  if (!RASTER.test(file)) return null;
  const { default: sharp } = await import('sharp');
  const buf = readFileSync(file);
  const meta = await sharp(buf).metadata();
  const info = { width: meta.width, height: meta.height, sources: [] };
  if (!variants || meta.pages > 1) return info; // leave animations alone
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  mkdirSync(CACHE, { recursive: true });
  const widths = variantWidths(meta.width);
  for (const [ext, type, options] of FORMATS) {
    const files = [];
    for (const w of widths) {
      const name = `${hash}-${w}.${ext}`;
      const out = join(CACHE, name);
      if (!existsSync(out)) await sharp(buf).resize({ width: w, withoutEnlargement: true })[ext](options).toFile(out);
      files.push([name, w]);
    }
    info.sources.push({ type, files });
  }
  return info;
}

export const isRaster = (src) => RASTER.test(extname(String(src).split(/[?#]/)[0]));
