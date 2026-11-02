// Tags decide where posts show up. Projects and blog posts are the same kind of file in src/content/posts/;
// the `tags` section of site.config.js says which tags get their own page and which feeds the home page shows.
// Kept free of astro imports so it can be unit tested and used from astro.config.mjs.

const LAYOUTS = ['cards', 'list', 'large'];
const SORTS = ['date', 'featured'];
// Addresses the site already uses for something else.
export const RESERVED_PATHS = new Set(['posts', 'tags', 'search', 'contact', 'rss.xml', 'robots.txt', '404', '_astro', 'pagefind']);

/** URL-safe name for a tag: "WebAssembly" -> "webassembly", "C++" -> "cplusplus", "Game Dev" -> "game-dev". */
export function tagSlug(tag) {
  return String(tag).trim().toLowerCase()
    .replace(/\+/g, 'plus').replace(/#/g, 'sharp').replace(/&/g, 'and')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';
}

const lower = (list) => (list || []).map((t) => String(t).trim().toLowerCase());
const asList = (v) => (v == null ? undefined : Array.isArray(v) ? v : [v]);

/** Fills in defaults and checks the `tags` section of site.config.js, with errors that say what to fix. */
export function normalizeTagConfig(config = {}) {
  const paths = new Set();
  const pages = (config.pages || []).map((p, i) => {
    const where = `site.config.js tags.pages[${i}]`;
    const path = String(p.path || '').replace(/^\/+|\/+$/g, '');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(path)) throw new Error(`${where}: path "${p.path}" should be one lowercase word like "projects"`);
    if (RESERVED_PATHS.has(path)) throw new Error(`${where}: path "${path}" is already used by the site, pick another`);
    if (paths.has(path)) throw new Error(`${where}: path "${path}" is used twice`);
    paths.add(path);
    const page = { title: path, layout: 'list', sort: 'date', icon: 'article', name: 'Post', ...p, path, tags: asList(p.tags), exclude: asList(p.exclude) };
    check(page, where);
    return page;
  });
  const home = (config.home || []).map((s, i) => {
    const section = { layout: 'list', sort: 'date', limit: 4, ...s, tags: asList(s.tags), exclude: asList(s.exclude) };
    check(section, `site.config.js tags.home[${i}]`);
    return section;
  });
  return { pages, home, tagPages: config.tagPages !== false };
}

function check(item, where) {
  if (!LAYOUTS.includes(item.layout)) throw new Error(`${where}: layout "${item.layout}" should be one of ${LAYOUTS.join(', ')}`);
  if (!SORTS.includes(item.sort)) throw new Error(`${where}: sort "${item.sort}" should be one of ${SORTS.join(', ')}`);
}

/**
 * True when a post belongs in a page or feed: it has at least one of `tags` (every post when `tags` is left
 * out), none of `exclude`, and is featured when `featured: true` is asked for. Tags match ignoring case.
 */
export function matches(post, { tags, exclude, featured } = {}) {
  const own = new Set(lower(post.data.tags));
  if (tags && !lower(tags).some((t) => own.has(t))) return false;
  if (exclude && lower(exclude).some((t) => own.has(t))) return false;
  if (featured && !post.data.featured) return false;
  return true;
}

const time = (d) => (d ? new Date(d).getTime() : 0);

/** "date": newest first. "featured": featured first, then by `order` (lower first), then newest. */
export function sortPosts(posts, sort = 'date') {
  return [...posts].sort((a, b) => (sort === 'featured'
    ? Number(Boolean(b.data.featured)) - Number(Boolean(a.data.featured)) || (a.data.order ?? 0) - (b.data.order ?? 0)
    : 0) || time(b.data.date) - time(a.data.date));
}

/** The first configured page a post belongs to (its address lives under it), or undefined. */
export function homePageFor(post, config) {
  return config.pages.find((p) => matches(post, p));
}

/** Site-relative address of a post: /projects/interpreter/ when it is on the Projects page, else /posts/<name>/. */
export function postPath(post, config) {
  return `/${homePageFor(post, config)?.path || 'posts'}/${post.id}/`;
}

export const pagePosts = (posts, page) => sortPosts(posts.filter((p) => matches(p, page)), page.sort);

/**
 * The home page sections with their posts, top to bottom. A post shown in one section is left out of the
 * sections below it (so the featured project isn't repeated under Projects) unless the section says `repeat: true`.
 * Sections with nothing to show are dropped.
 */
export function homeSections(posts, config) {
  const shown = new Set();
  return config.home.map((section) => {
    const list = pagePosts(posts, section).filter((p) => section.repeat || !shown.has(p.id)).slice(0, section.limit);
    for (const p of list) shown.add(p.id);
    return { ...section, posts: list };
  }).filter((s) => s.posts.length);
}

/** Every tag with how many posts use it, most used first. Tags that differ only in case count as one. */
export function tagCounts(posts) {
  const byslug = new Map();
  for (const post of posts) {
    for (const tag of new Set(post.data.tags || [])) {
      const slug = tagSlug(tag);
      const entry = byslug.get(slug) || { tag, slug, count: 0 };
      entry.count += 1;
      byslug.set(slug, entry);
    }
  }
  return [...byslug.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Where clicking a tag goes: the configured page that shows exactly that tag (e.g. "project" -> /projects/),
 * else /tags/<tag>/ when every tag gets a page, else nowhere (undefined).
 */
export function tagHref(tag, config) {
  const t = String(tag).trim().toLowerCase();
  const page = config.pages.find((p) => p.tags?.length === 1 && lower(p.tags)[0] === t && !p.exclude && !p.featured);
  if (page) return `/${page.path}/`;
  return config.tagPages ? `/tags/${tagSlug(tag)}/` : undefined;
}

/** Posts with a tag, matched by its URL name, newest first. */
export function postsWithTag(posts, slug) {
  return sortPosts(posts.filter((p) => (p.data.tags || []).some((t) => tagSlug(t) === slug)));
}

/** The short text shown on cards and in lists: `description`, or `summary` (older project files). */
export const summaryOf = (post) => post.data.description || post.data.summary || '';
