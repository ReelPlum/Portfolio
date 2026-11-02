import { describe, it, expect } from 'vitest';
import site from '../../site.config.js';
import {
  tagSlug, normalizeTagConfig, matches, sortPosts, homePageFor, postPath, pagePosts, homeSections,
  tagCounts, tagHref, postsWithTag, summaryOf,
} from '../../src/lib/tags.js';

const post = (id, data = {}) => ({ id, data: { tags: [], featured: false, order: 0, date: '2026-01-01', ...data } });

const config = normalizeTagConfig({
  pages: [
    { path: 'projects', title: 'Projects', tags: ['project'], layout: 'cards', sort: 'featured', icon: 'code', name: 'Project' },
    { path: 'blog', title: 'Blog', tags: ['blog'] },
  ],
  home: [
    { title: 'Featured', tags: ['project'], featured: true, limit: 1, layout: 'large' },
    { title: 'Projects', tags: ['project'], sort: 'featured', limit: 2, layout: 'cards', link: '/projects/' },
    { title: 'Latest writing', tags: ['blog'], limit: 2 },
  ],
});

const posts = [
  post('interp', { tags: ['project', 'Rust'], featured: true, date: '2026-10-20' }),
  post('calc', { tags: ['project', 'Rust'], date: '2026-10-01' }),
  post('old', { tags: ['project'], date: '2025-01-01' }),
  post('pinned', { tags: ['project'], date: '2024-01-01', order: -1 }),
  post('hello', { tags: ['blog', 'Meta'], date: '2026-11-01' }),
  post('notes', { tags: ['Blog', 'rust'], date: '2026-10-24' }),
  post('desk', { tags: ['Tools'], date: '2026-08-15' }),
];
const ids = (list) => list.map((p) => p.id);

describe('tagSlug', () => {
  it('makes tags safe for URLs', () => {
    expect(tagSlug('WebAssembly')).toBe('webassembly');
    expect(tagSlug('Game Dev')).toBe('game-dev');
    expect(tagSlug('C++')).toBe('cplusplus');
    expect(tagSlug('C#')).toBe('csharp');
    expect(tagSlug('Rock & Roll')).toBe('rock-and-roll');
    expect(tagSlug('Café')).toBe('cafe');
    expect(tagSlug(' --- ')).toBe('tag');
  });
});

describe('normalizeTagConfig', () => {
  it('fills in defaults', () => {
    const c = normalizeTagConfig({ pages: [{ path: '/notes/', tags: 'note' }], home: [{ title: 'All' }] });
    expect(c.pages[0]).toMatchObject({ path: 'notes', title: 'notes', tags: ['note'], layout: 'list', sort: 'date', icon: 'article', name: 'Post' });
    expect(c.home[0]).toMatchObject({ layout: 'list', sort: 'date', limit: 4, tags: undefined });
    expect(c.tagPages).toBe(true);
    expect(normalizeTagConfig({ tagPages: false }).tagPages).toBe(false);
    expect(normalizeTagConfig()).toEqual({ pages: [], home: [], tagPages: true });
  });
  it('explains mistakes', () => {
    expect(() => normalizeTagConfig({ pages: [{ path: 'My Projects' }] })).toThrow(/one lowercase word/);
    expect(() => normalizeTagConfig({ pages: [{ path: 'tags' }] })).toThrow(/already used by the site/);
    expect(() => normalizeTagConfig({ pages: [{ path: 'posts' }] })).toThrow(/already used by the site/);
    expect(() => normalizeTagConfig({ pages: [{ path: 'a' }, { path: 'a' }] })).toThrow(/used twice/);
    expect(() => normalizeTagConfig({ pages: [{ path: 'a', layout: 'grid' }] })).toThrow(/layout "grid" should be one of cards, list, large/);
    expect(() => normalizeTagConfig({ home: [{ sort: 'title' }] })).toThrow(/tags.home\[0\]: sort "title"/);
  });
  it('accepts the config in site.config.js', () => {
    const c = normalizeTagConfig(site.tags);
    expect(c.pages.map((p) => p.path)).toEqual(['projects', 'blog']);
    expect(c.home.length).toBeGreaterThan(0);
  });
});

describe('matching and sorting', () => {
  it('matches any of the tags, ignoring case', () => {
    expect(matches(posts[5], { tags: ['blog'] })).toBe(true);
    expect(matches(posts[5], { tags: ['RUST', 'x'] })).toBe(true);
    expect(matches(posts[6], { tags: ['blog'] })).toBe(false);
  });
  it('matches every post when tags are left out, and honours exclude and featured', () => {
    expect(posts.every((p) => matches(p, {}))).toBe(true);
    expect(ids(posts.filter((p) => matches(p, { exclude: ['project', 'blog'] })))).toEqual(['desk']);
    expect(ids(posts.filter((p) => matches(p, { featured: true })))).toEqual(['interp']);
  });
  it('sorts by date, or featured then order then date, without changing the input', () => {
    const before = ids(posts);
    expect(ids(sortPosts(posts))).toEqual(['hello', 'notes', 'interp', 'calc', 'desk', 'old', 'pinned']);
    expect(ids(sortPosts(posts.filter((p) => p.data.tags.includes('project')), 'featured'))).toEqual(['interp', 'pinned', 'calc', 'old']);
    expect(ids(posts)).toEqual(before);
  });
  it('sorts posts without a date last instead of failing', () => {
    expect(ids(sortPosts([post('a', { date: undefined }), post('b')]))).toEqual(['b', 'a']);
  });
});

describe('pages and addresses', () => {
  it('puts a post under the first page it is on, or /posts/', () => {
    expect(postPath(posts[0], config)).toBe('/projects/interp/');
    expect(postPath(posts[4], config)).toBe('/blog/hello/');
    expect(postPath(posts[5], config)).toBe('/blog/notes/'); // "Blog" matches "blog"
    expect(postPath(posts[6], config)).toBe('/posts/desk/');
    expect(homePageFor(posts[6], config)).toBeUndefined();
    const both = post('both', { tags: ['blog', 'project'] });
    expect(postPath(both, config)).toBe('/projects/both/'); // pages earlier in the config win
  });
  it('lists a page\'s posts in its sort order', () => {
    expect(ids(pagePosts(posts, config.pages[0]))).toEqual(['interp', 'pinned', 'calc', 'old']);
    expect(ids(pagePosts(posts, config.pages[1]))).toEqual(['hello', 'notes']);
  });
});

describe('home page sections', () => {
  it('fills each section in order and does not repeat posts shown above', () => {
    const s = homeSections(posts, config);
    expect(s.map((x) => [x.title, ids(x.posts)])).toEqual([
      ['Featured', ['interp']],
      ['Projects', ['pinned', 'calc']],
      ['Latest writing', ['hello', 'notes']],
    ]);
    expect(s[1].link).toBe('/projects/');
  });
  it('repeats posts when a section asks to', () => {
    const c = normalizeTagConfig({ home: [{ title: 'A', tags: ['project'], limit: 1 }, { title: 'B', tags: ['project'], limit: 1, repeat: true }] });
    expect(homeSections(posts, c).map((x) => ids(x.posts))).toEqual([['interp'], ['interp']]);
  });
  it('drops sections with nothing in them', () => {
    const c = normalizeTagConfig({ home: [{ title: 'Nothing', tags: ['nope'] }, { title: 'Tools', tags: ['tools'] }] });
    expect(homeSections(posts, c).map((x) => x.title)).toEqual(['Tools']);
  });
});

describe('tag pages', () => {
  it('counts tags, treating different cases as one tag', () => {
    const counts = tagCounts(posts);
    expect(counts.find((t) => t.slug === 'rust')).toEqual({ tag: 'Rust', slug: 'rust', count: 3 });
    expect(counts.find((t) => t.slug === 'blog').count).toBe(2);
    expect(counts[0].slug).toBe('project');
  });
  it('counts a tag listed twice on one post once', () => {
    expect(tagCounts([post('a', { tags: ['x', 'x'] })])).toEqual([{ tag: 'x', slug: 'x', count: 1 }]);
  });
  it('links a tag to the page that shows exactly that tag, else to /tags/<tag>/', () => {
    expect(tagHref('project', config)).toBe('/projects/');
    expect(tagHref('Blog', config)).toBe('/blog/');
    expect(tagHref('Game Dev', config)).toBe('/tags/game-dev/');
    expect(tagHref('Rust', normalizeTagConfig({ tagPages: false }))).toBeUndefined();
  });
  it('finds the posts with a tag by its URL name, newest first', () => {
    expect(ids(postsWithTag(posts, 'rust'))).toEqual(['notes', 'interp', 'calc']);
  });
  it('uses description, or summary from older project files', () => {
    expect(summaryOf(post('a', { description: 'd', summary: 's' }))).toBe('d');
    expect(summaryOf(post('a', { summary: 's' }))).toBe('s');
    expect(summaryOf(post('a'))).toBe('');
  });
});
