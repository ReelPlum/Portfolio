// Links to other sites open in a new tab. A link is external when it is an absolute http(s) URL that
// points outside this site (a different origin, or the same origin but outside the base path).
export const EXTERNAL_ATTRS = { target: '_blank', rel: 'noopener noreferrer' };

export function isExternal(href, { site, base = '/' } = {}) {
  if (typeof href !== 'string' || !/^(?:https?:)?\/\//i.test(href.trim())) return false;
  let url;
  try {
    url = new URL(href.trim(), 'https://invalid.example');
  } catch {
    return false;
  }
  if (!site) return true;
  const own = new URL(site);
  if (url.origin !== own.origin) return true;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return !(url.pathname === prefix.slice(0, -1) || url.pathname.startsWith(prefix));
}

/** Attributes to spread on an <a>: target/rel for external links, nothing for internal ones. */
export function linkAttrs(href, opts) {
  return isExternal(href, opts) ? EXTERNAL_ATTRS : {};
}
