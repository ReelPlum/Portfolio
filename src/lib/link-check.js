// Checks every link, image and embed in the built site (dist/).
//
// Internal links must point at a file in the build, and a #fragment at an id on that page. Images must be
// real images (they are opened and decoded, not just found), 3D models must be glTF, PDFs must be PDFs, and
// WebAssembly apps must have their module. With `external`, links to other sites are requested too, and
// YouTube / Vimeo videos are looked up to check they still exist and can be embedded.
//
// External results are split in two: a link that is certainly dead (404, 410, unknown host, a video that's
// gone) is an error; anything that might be temporary or a bot block (timeouts, 5xx, 403, 429, LinkedIn's
// 999) is a warning, so the check doesn't fail because another site had a bad minute.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { parseHTML } from 'linkedom';

const IGNORED_SCHEMES = /^(mailto|tel|javascript|data|blob|sms):/i;

function listHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listHtml(p, out); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** URL path of a built page: dist/blog/x/index.html -> /base/blog/x/ */
export function pagePath(dist, file, base = '/') {
  const rel = relative(dist, file).split(sep).join('/');
  return base + rel.replace(/(^|\/)index\.html$/, '$1');
}

const srcsetUrls = (value) => String(value).split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);

/** Every link, image and embed on a page, with what kind it is and where it was found. */
export function collectLinks(html) {
  const { document } = parseHTML(html);
  const found = [];
  const add = (url, kind, el, attr) => { if (url && url.trim()) found.push({ url: url.trim(), kind, tag: el.tagName.toLowerCase(), attr, text: (el.textContent || el.getAttribute('alt') || '').trim().slice(0, 60) }); };
  const each = (selector, fn) => document.querySelectorAll(selector).forEach(fn);

  each('a[href], area[href]', (el) => {
    // Share buttons are links that make a post on another site; they aren't pages to check.
    if (el.closest('[data-share]') || el.hasAttribute('data-no-check')) return;
    add(el.getAttribute('href'), 'link', el, 'href');
  });
  each('img[src]', (el) => add(el.getAttribute('src'), 'image', el, 'src'));
  each('img[srcset], source[srcset]', (el) => srcsetUrls(el.getAttribute('srcset')).forEach((u) => add(u, 'image', el, 'srcset')));
  each('video[src], audio[src], source[src], embed[src]', (el) => add(el.getAttribute('src'), 'embed', el, 'src'));
  each('video[poster]', (el) => add(el.getAttribute('poster'), 'image', el, 'poster'));
  each('model-viewer[src]', (el) => add(el.getAttribute('src'), 'model', el, 'src'));
  each('object[data]', (el) => add(el.getAttribute('data'), 'embed', el, 'data'));
  each('[data-video-embed][data-src]', (el) => add(el.getAttribute('data-src'), 'video', el, 'data-src'));
  // Players inside <noscript> are the same videos as data-src above.
  each('iframe[src]', (el) => { if (!el.closest('noscript') && !el.closest('[data-video-embed]')) add(el.getAttribute('src'), 'embed', el, 'src'); });
  each('[data-pdf] figcaption a[href]', (el) => add(el.getAttribute('href'), 'pdf', el, 'href'));
  each('[data-canvas][data-module]', (el) => add(el.getAttribute('data-module'), 'wasm', el, 'data-module'));
  each('script[src]', (el) => add(el.getAttribute('src'), 'asset', el, 'src'));
  each('link[href]', (el) => {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    if (/preconnect|dns-prefetch/.test(rel)) return;
    add(el.getAttribute('href'), /icon/.test(rel) ? 'image' : 'asset', el, 'href');
  });
  each('meta[property="og:image"], meta[name="twitter:image"]', (el) => add(el.getAttribute('content'), 'image', el, 'content'));
  return found;
}

/** Ids a #fragment can point at on a page. */
export function anchorsOf(html) {
  const { document } = parseHTML(html);
  const ids = new Set();
  document.querySelectorAll('[id]').forEach((el) => ids.add(el.getAttribute('id')));
  document.querySelectorAll('a[name]').forEach((el) => ids.add(el.getAttribute('name')));
  return ids;
}

/**
 * Sorts a URL found on `page` into internal (a path in the build), external (another site) or skipped.
 * `site` is the site's own origin, so absolute links to it (canonical, og:image) count as internal.
 */
export function classify(url, { page, base = '/', site = '' }) {
  if (IGNORED_SCHEMES.test(url) || url.startsWith('#') && url.length === 1) return { type: 'skip' };
  let resolved;
  try { resolved = new URL(url, `http://internal.invalid${page}`); } catch { return { type: 'invalid' }; }
  const own = site ? new URL(site) : null;
  if (resolved.host === 'internal.invalid' || (own && resolved.host === own.host)) {
    if (!/^https?:$/.test(resolved.protocol)) return { type: 'skip' };
    return { type: 'internal', path: resolved.pathname, hash: decodeURIComponent(resolved.hash.slice(1)) };
  }
  if (!/^https?:$/.test(resolved.protocol)) return { type: 'skip' };
  resolved.hash = '';
  return { type: 'external', href: resolved.href };
}

/** The file in dist/ that serves `path`, or null. */
export function fileFor(dist, path, base = '/') {
  if (!path.startsWith(base)) return null;
  let rel;
  try { rel = decodeURIComponent(path.slice(base.length)); } catch { return null; }
  if (rel.includes('..')) return null;
  const candidates = rel === '' || rel.endsWith('/') ? [join(rel, 'index.html')] : [rel, join(rel, 'index.html'), `${rel}.html`];
  for (const c of candidates) {
    const f = join(dist, c);
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

const MAGIC = {
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' ? null : 'is not a PDF',
  model: (b, f) => {
    if (b.subarray(0, 4).toString('latin1') === 'glTF') return null;
    if (f.endsWith('.gltf')) { try { JSON.parse(b.toString('utf8')).asset; return null; } catch { /* fall through */ } }
    return 'is not a glTF model';
  },
};

/** Opens a local image, model or PDF and says what is wrong with it, or null if it's fine. */
export async function inspectFile(file, kind) {
  const buf = readFileSync(file);
  if (buf.length === 0) return 'is empty';
  if (kind === 'image') {
    const ext = extname(file).toLowerCase();
    if (ext === '.svg') return /<svg[\s>]/i.test(buf.toString('utf8')) ? null : 'is not an SVG image';
    if (ext === '.ico') return null;
    const { default: sharp } = await import('sharp');
    try {
      const meta = await sharp(buf).metadata();
      return meta.width > 0 && meta.height > 0 ? null : 'has no size';
    } catch (e) {
      return `can't be opened as an image (${e.message})`;
    }
  }
  if (MAGIC[kind]) return MAGIC[kind](buf, file);
  return null;
}

const youtubeId = (src) => /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/.exec(src)?.[1];
const vimeoId = (src) => /player\.vimeo\.com\/video\/(\d+)/.exec(src)?.[1];

/** The request that tells whether a YouTube / Vimeo video exists and can be embedded. */
export function videoLookup(src) {
  const yt = youtubeId(src);
  if (yt) return { service: 'YouTube', url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}` };
  const vm = vimeoId(src);
  if (vm) return { service: 'Vimeo', url: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${vm}`)}` };
  return null;
}

/** Whether an HTTP status means dead (error), fine, or maybe-temporary (warning). */
export function judgeStatus(status) {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 404 || status === 410) return 'dead';
  return 'unsure';
}

async function request(fetchImpl, url, { timeout, method }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchImpl(url, { method, redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; portfolio-link-check)', accept: 'text/html,application/json;q=0.9,*/*;q=0.8' } });
    res.body?.cancel?.().catch(() => {});
    return { status: res.status };
  } catch (e) {
    if (e.name === 'AbortError') return { error: 'timed out' };
    const code = String(e.cause?.code || e.code || e.message);
    return { error: code, dead: /ENOTFOUND/.test(code) };
  } finally {
    clearTimeout(timer);
  }
}

/** Requests one external URL: HEAD first, GET when the server doesn't like HEAD, one retry on errors. */
export async function checkExternal(url, { fetch: fetchImpl = globalThis.fetch, timeout = 15000, retries = 1 } = {}) {
  let result;
  for (let attempt = 0; attempt <= retries; attempt++) {
    result = await request(fetchImpl, url, { timeout, method: 'HEAD' });
    // Many servers mishandle HEAD (405, 403, even 404): ask again with GET before judging.
    if (!result.status || judgeStatus(result.status) !== 'ok') result = await request(fetchImpl, url, { timeout, method: 'GET' });
    if (result.dead || (result.status && result.status < 500 && result.status !== 429)) break;
  }
  if (result.error) return { verdict: result.dead ? 'dead' : 'unsure', reason: result.error };
  return { verdict: judgeStatus(result.status), reason: `HTTP ${result.status}`, status: result.status };
}

async function checkVideo(src, opts) {
  const lookup = videoLookup(src);
  if (!lookup) return checkExternal(src, opts);
  const r = await checkExternal(lookup.url, { ...opts });
  if (r.verdict === 'ok') return r;
  if (r.status === 404 || r.status === 400) return { verdict: 'dead', reason: `the ${lookup.service} video doesn't exist (or is private)` };
  if (r.status === 401 || r.status === 403) return { verdict: lookup.service === 'YouTube' ? 'dead' : 'unsure', reason: `the ${lookup.service} video can't be embedded (${r.reason})` };
  return r;
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

/**
 * Checks the whole built site. Returns { errors, warnings, stats }; each problem says the page it is on,
 * the URL, and what's wrong.
 */
export async function checkSite({ dist, base = '/', site = '', external = false, skip = [], fetch: fetchImpl, concurrency = 6, timeout = 15000 } = {}) {
  const errors = [];
  const warnings = [];
  const pages = listHtml(dist);
  const anchors = new Map();
  const anchorsFor = (file) => {
    if (!anchors.has(file)) anchors.set(file, anchorsOf(readFileSync(file, 'utf8')));
    return anchors.get(file);
  };
  const inspected = new Map();
  const externals = new Map(); // href -> { kind, pages: Set }
  const skipRes = skip.map((s) => (s instanceof RegExp ? s : new RegExp(s)));
  let internalCount = 0;

  for (const file of pages) {
    const page = pagePath(dist, file, base);
    for (const link of collectLinks(readFileSync(file, 'utf8'))) {
      const where = `${page}: ${link.kind} ${link.url}${link.text ? ` ("${link.text}")` : ''}`;
      const c = classify(link.url, { page, base, site });
      if (c.type === 'skip') continue;
      if (c.type === 'invalid') { errors.push(`${where} is not a valid URL`); continue; }
      if (c.type === 'external') {
        if (skipRes.some((re) => re.test(c.href))) continue;
        const key = `${link.kind === 'video' ? 'video' : 'url'} ${link.kind === 'video' ? link.url : c.href}`;
        if (!externals.has(key)) externals.set(key, { kind: link.kind, href: link.kind === 'video' ? link.url : c.href, pages: new Set() });
        externals.get(key).pages.add(page);
        continue;
      }
      internalCount++;
      const target = fileFor(dist, c.path, base);
      if (!target) {
        errors.push(c.path.startsWith(base) ? `${where} is missing from the site` : `${where} is outside the site (paths must start with ${base})`);
        continue;
      }
      if (c.hash && link.kind === 'link' && target.endsWith('.html') && !c.hash.startsWith(':~:') && !anchorsFor(target).has(c.hash)) {
        errors.push(`${where}: there is no #${c.hash} on ${pagePath(dist, target, base)}`);
      }
      const check = { image: 'image', model: 'model', pdf: 'pdf' }[link.kind];
      if (check) {
        const key = `${check} ${target}`;
        if (!inspected.has(key)) inspected.set(key, await inspectFile(target, check));
        const problem = inspected.get(key);
        if (problem) errors.push(`${where} ${problem}`);
      }
    }
  }

  let externalCount = 0;
  if (external && externals.size) {
    const list = [...externals.values()];
    externalCount = list.length;
    const results = await pool(list, concurrency, (item) => (item.kind === 'video' ? checkVideo(item.href, { fetch: fetchImpl, timeout }) : checkExternal(item.href, { fetch: fetchImpl, timeout })));
    list.forEach((item, i) => {
      const r = results[i];
      if (r.verdict === 'ok') return;
      const on = [...item.pages].slice(0, 3).join(', ') + (item.pages.size > 3 ? ` and ${item.pages.size - 3} more` : '');
      const message = `${item.href}: ${r.reason} (on ${on})`;
      (r.verdict === 'dead' ? errors : warnings).push(message);
    });
  }
  return { errors, warnings, stats: { pages: pages.length, internal: internalCount, external: externalCount } };
}
