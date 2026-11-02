// Before / after image slider:
//   ```compare
//   before: /images/flat.png | Flat shading
//   after: /images/lit.png | Lit
//   alt: A sphere rendered with and without lighting
//   caption: Optional caption under the slider
//   ```
// A native range input drives the divider, so keyboard (arrows, Home, End, Page Up/Down), touch and
// screen readers work without extra code. Without JavaScript both images are still shown, side by side.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROSE_SIZES } from './images.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function parseCompare(value) {
  const spec = {};
  for (const line of value.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = /^(before|after|alt|caption|start)\s*:\s*(.+)$/i.exec(line);
    if (!m) throw new Error(`Unknown line "${line}". Use before:, after:, alt:, caption: or start:`);
    spec[m[1].toLowerCase()] = m[2].trim();
  }
  for (const k of ['before', 'after']) {
    if (!spec[k]) throw new Error(`Missing "${k}: /path/to/image"`);
    const [src, label] = spec[k].split('|').map((s) => s.trim());
    spec[k] = { src, label: label || (k === 'before' ? 'Before' : 'After') };
  }
  const start = spec.start ? Number(String(spec.start).replace('%', '')) : 50;
  if (!(start >= 0 && start <= 100)) throw new Error('"start" must be between 0 and 100');
  spec.start = start;
  return spec;
}

/** `images` maps an image's path to its imageInfo() (size and AVIF / WebP sources), when known. */
export function compareHtml(spec, { hrefFor = (p) => p, publicDirs, images = {} } = {}) {
  if (publicDirs) {
    for (const { src } of [spec.before, spec.after]) {
      if (src.startsWith('/') && !publicDirs.some((d) => existsSync(join(d, src)))) throw new Error(`Image not found: ${src}. Put it in public${src}`);
    }
  }
  const alt = spec.alt || `${spec.before.label} and ${spec.after.label}`;
  const img = (s, cls) => {
    const info = images[s.src];
    const size = info ? ` width="${info.width}" height="${info.height}"` : '';
    const tag = `<img class="${cls}" src="${esc(hrefFor(s.src))}" alt="${esc(`${s.label}: ${alt}`)}"${size} loading="lazy" decoding="async" data-no-lightbox />`;
    if (!info?.sources?.length) return tag;
    return `<picture class="${cls}-picture">${info.sources.map((x) => `<source type="${x.type}" srcset="${esc(x.srcset)}" sizes="${PROSE_SIZES}" />`).join('')}${tag}</picture>`;
  };
  return `<figure class="compare" data-compare style="--pos:${spec.start}%">`
    + `<div class="compare-frame">${img(spec.before, 'compare-before')}${img(spec.after, 'compare-after')}`
    + `<span class="compare-label compare-label-before" aria-hidden="true">${esc(spec.before.label)}</span><span class="compare-label compare-label-after" aria-hidden="true">${esc(spec.after.label)}</span>`
    + `<span class="compare-divider" aria-hidden="true"><span class="compare-handle"></span></span>`
    + `<input class="compare-range" type="range" min="0" max="100" step="1" value="${spec.start}" aria-label="${esc(`Slide to compare ${spec.before.label} and ${spec.after.label}`)}" aria-valuetext="${spec.start}% ${esc(spec.after.label)}" /></div>`
    + `${spec.caption ? `<figcaption>${esc(spec.caption)}</figcaption>` : ''}</figure>`;
}
