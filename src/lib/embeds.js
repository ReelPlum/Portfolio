// Turns a URL into an embed description, or null if it is not embeddable.
// Pure function so it can be unit tested without a markdown pipeline.

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIDEO_EXT = /\.(mp4|webm|mov|ogv)$/i;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export const MODEL_EXT = /\.(glb|gltf)$/i;
export const CANVAS_RE = /^\/wasm\/[^/]+\/.+\.js$/i;

const LOCAL = 'http://local.invalid';
function parse(url) {
  const raw = String(url).trim();
  try {
    // site-relative paths like /files/notes.pdf are allowed too
    return raw.startsWith('/') && !raw.startsWith('//') ? new URL(raw, LOCAL) : new URL(raw);
  } catch {
    return null;
  }
}
const hrefOf = (u) => (u.origin === LOCAL ? u.pathname + u.search + u.hash : u.href);

/** Parses "1m30s", "90", "90s" into seconds. */
export function parseStart(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export function youtubeId(u) {
  let id = null;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else {
    const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
    if (m) id = m[1];
  }
  return id && YT_ID.test(id) ? id : null;
}

export function embedFor(url) {
  const u = parse(url);
  if (!u || !/^https?:$/.test(u.protocol)) return null;

  if (YT_HOSTS.has(u.hostname)) {
    const id = youtubeId(u);
    if (!id) return null;
    const start = parseStart(u.searchParams.get('t') || u.searchParams.get('start'));
    const src = `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
    return { provider: 'youtube', id, src };
  }

  if (VIMEO_HOSTS.has(u.hostname)) {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted hash), player.vimeo.com/video/123, vimeo.com/channels/x/123
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => /^\d+$/.test(p));
    if (idx === -1) return null;
    const id = parts[idx];
    const hash = u.searchParams.get('h') || (parts[idx + 1] && /^[a-f0-9]+$/i.test(parts[idx + 1]) ? parts[idx + 1] : null);
    const src = `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`;
    return { provider: 'vimeo', id, src };
  }

  if (VIDEO_EXT.test(u.pathname)) return { provider: 'video', src: hrefOf(u) };
  if (/\.pdf$/i.test(u.pathname)) return { provider: 'pdf', src: hrefOf(u) };
  if (MODEL_EXT.test(u.pathname)) return { provider: 'model', src: hrefOf(u).split('#')[0] };
  // A WebAssembly app built with wasm-bindgen (e.g. a Rust wgpu renderer): /wasm/<name>/<name>.js
  if (u.origin === LOCAL && CANVAS_RE.test(u.pathname)) {
    const height = Number(u.searchParams.get('height')) || 480;
    return { provider: 'canvas', src: u.pathname, entry: u.searchParams.get('entry') || 'start', height: Math.min(Math.max(height, 160), 1600) };
  }
  return null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fileName = (src) => decodeURIComponent(src.split('/').pop());

export function embedHtml(embed, title = '', { icons = {}, missing = false } = {}) {
  if (!embed) return '';
  if (embed.provider === 'model') {
    // <model-viewer> (loaded only on pages that have a model) lets you drag to rotate and scroll to zoom.
    const name = title || fileName(embed.src);
    // `viewSrc` is a size-optimised copy for viewing (src/lib/optimize-assets.js); downloads get the original.
    return `<figure class="embed embed-model" data-model><model-viewer src="${esc(embed.viewSrc || embed.src)}" loading="lazy" reveal="auto" alt="${esc(`3D model: ${name}`)}" camera-controls touch-action="pan-y" interaction-prompt="none" shadow-intensity="0.6" environment-image="neutral" exposure="1"><div slot="progress-bar"></div></model-viewer>`
      + `<figcaption><span>${esc(name)}</span><span class="embed-hint">Drag to rotate, scroll or pinch to zoom</span><a href="${esc(embed.src)}" download>${icons.download || ''}Download</a></figcaption></figure>`;
  }
  if (embed.provider === 'canvas') {
    const name = title || fileName(embed.src).replace(/\.js$/i, '');
    if (missing) {
      return `<figure class="embed embed-canvas embed-canvas-soon" style="--canvas-height:${embed.height}px"><div class="playground-soon">${icons.soon || ''}<h3>${esc(name)} is coming soon</h3><p>It will run here once its build is added to <code>public${esc((embed.publicPath || embed.src).replace(/[^/]+$/, ''))}</code>.</p></div></figure>`;
    }
    return `<figure class="embed embed-canvas" data-canvas data-module="${esc(embed.src)}" data-entry="${esc(embed.entry)}" style="--canvas-height:${embed.height}px">`
      + `<canvas aria-label="${esc(name)}"></canvas><div class="canvas-overlay"><button type="button" class="btn canvas-run">${icons.run || ''}Run ${esc(name)}</button><p class="canvas-status" role="status"></p></div>`
      + `<figcaption><span>${esc(name)}</span><span class="embed-hint">Runs in your browser with WebGPU (or WebGL 2)</span></figcaption></figure>`;
  }
  if (embed.provider === 'pdf') {
    // Rendered page by page with pdf.js (src/lib/pdf-viewer.js); the link is the no-JS fallback.
    const name = title || decodeURIComponent(embed.src.split('/').pop());
    return `<figure class="embed embed-pdf" data-pdf><div class="pdf-pages"></div><figcaption><a href="${esc(embed.src)}" target="_blank" rel="noopener">${esc(name)}</a></figcaption></figure>`;
  }
  if (embed.provider === 'video') {
    return `<figure class="embed embed-video"><video src="${esc(embed.src)}" controls playsinline preload="none"></video></figure>`;
  }
  const label = title || (embed.provider === 'youtube' ? 'YouTube video' : 'Vimeo video');
  // Nothing loads from YouTube / Vimeo until the reader presses play (src/lib/post-client.js swaps in the
  // player). Without JavaScript the player is shown straight away.
  const site = embed.provider === 'youtube' ? 'YouTube' : 'Vimeo';
  return `<figure class="embed embed-${embed.provider}" data-video-embed data-src="${esc(embed.src)}" data-title="${esc(label)}">`
    + `<button type="button" class="embed-facade" aria-label="${esc(`Play ${label} (loads ${site})`)}">${icons.play || ''}<span class="embed-facade-title">${esc(label)}</span><span class="embed-facade-note">Plays from ${site}</span></button>`
    + `<noscript>${playerIframe(embed.src, label)}</noscript></figure>`;
}

/** The YouTube / Vimeo player itself. */
export function playerIframe(src, label, { autoplay = false } = {}) {
  const url = autoplay ? `${src}${src.includes('?') ? '&' : '?'}autoplay=1` : src;
  return `<iframe src="${esc(url)}" title="${esc(label)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}
