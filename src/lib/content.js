// Helpers for sorting / filtering content. Kept free of astro imports so they can be unit tested.

export const isPublished = (entry, { includeDrafts = false } = {}) => includeDrafts || !entry.data.draft;

export function sortByDateDesc(entries) {
  return [...entries].sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
}

export function formatDate(date, locale = 'en-GB') {
  return new Date(date).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Rough reading time, ignoring code fences and markup. */
export function readingTime(body = '') {
  const text = body.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ').replace(/[#>*_`[\]()!-]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Prefixes a site-relative path with the configured base, leaving absolute URLs alone. */
export function withBase(path, base = '/') {
  if (!path || /^(?:[a-z]+:)?\/\//i.test(path) || /^(mailto|tel|data):/i.test(path) || path.startsWith('#')) return path;
  const b = base.endsWith('/') ? base : `${base}/`;
  return b + path.replace(/^\/+/, '');
}

/** True when `current` is `href` or a page under it (used for active nav items). */
export function isActive(href, current) {
  const norm = (p) => (p.endsWith('/') ? p : `${p}/`);
  const h = norm(href);
  const c = norm(current);
  return h === '/' ? c === '/' : c.startsWith(h);
}

/** The "updated" date to show, only when it is a later day than the publish date. */
export function updatedDate(data) {
  if (!data.updated) return null;
  const day = (d) => new Date(d).toISOString().slice(0, 10);
  return day(data.updated) > day(data.date) ? data.updated : null;
}

/** A URL / file-name slug: "Ærø: Rust & WASM!" -> "aeroe-rust-wasm". */
export function slugify(text) {
  return String(text).toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
