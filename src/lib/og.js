// Social preview ("Open Graph") images: a simple card per post and project, drawn after the build.
import { formatDate } from './content.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Where the image for a document lives ("blog/x" -> "/og/blog/x.png"; null -> the site's image). */
export const ogImagePath = (id) => (id ? `/og/${id}.png` : '/og/site.png');

/** Shorten long text at a word boundary. */
export function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** The card's HTML (flat colours, the site's font, no gradients). */
export function ogCardHtml(doc, { site, fontUrl } = {}) {
  const kind = doc.type === 'Project' ? 'Project' : doc.type === 'Post' ? 'Blog' : '';
  const meta = [kind, doc.date && formatDate(doc.date), ...(doc.tags || []).slice(0, 3)].filter(Boolean);
  const titleSize = doc.title.length > 60 ? 56 : doc.title.length > 30 ? 68 : 80;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontUrl ? `@font-face { font-family: 'Roboto Flex'; src: url(${fontUrl}) format('woff2'); font-weight: 100 1000; }` : ''}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body { font-family: 'Roboto Flex', Roboto, Arial, sans-serif; background: #f0f4f9; color: #1f1f1f; padding: 40px; }
.card { width: 100%; height: 100%; background: #ffffff; border-radius: 32px; padding: 64px 72px; display: flex; flex-direction: column; }
.meta { display: flex; gap: 12px; flex-wrap: wrap; }
.chip { height: 40px; padding: 0 18px; border-radius: 12px; border: 2px solid #c4c7c5; color: #444746; font-size: 22px; font-weight: 500; display: inline-flex; align-items: center; }
.chip.kind { background: #d3e3fd; border-color: #d3e3fd; color: #041e49; }
h1 { margin-top: 36px; font-size: ${titleSize}px; line-height: 1.1; font-weight: 500; letter-spacing: -0.01em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
p { margin-top: 24px; font-size: 30px; line-height: 1.35; color: #444746; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot { margin-top: auto; display: flex; align-items: center; gap: 16px; font-size: 26px; color: #444746; }
.bar { width: 56px; height: 8px; border-radius: 4px; background: #0b57d0; }
.site { font-weight: 500; color: #1f1f1f; }
</style></head><body><div class="card">
<div class="meta">${meta.map((m, i) => `<span class="chip${i === 0 && kind ? ' kind' : ''}">${esc(m)}</span>`).join('')}</div>
<h1>${esc(doc.title)}</h1>
${doc.description ? `<p>${esc(clip(doc.description, 160))}</p>` : ''}
<div class="foot"><span class="bar"></span><span class="site">${esc(site?.title || '')}</span><span>${esc((site?.url || '').replace(/^https?:\/\//, '') + (site?.base || ''))}</span></div>
</div></body></html>`;
}
