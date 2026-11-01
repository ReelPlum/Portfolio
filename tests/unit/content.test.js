import { describe, it, expect } from 'vitest';
import { sortByDateDesc, sortProjects, isPublished, allTags, formatDate, readingTime, withBase, isActive } from '../../src/lib/content.js';

const e = (id, data) => ({ id, data: { tags: [], draft: false, featured: false, order: 0, ...data } });

describe('content helpers', () => {
  it('sorts posts newest first without mutating the input', () => {
    const input = [e('a', { date: '2024-01-01' }), e('b', { date: '2025-06-01' }), e('c', { date: '2023-01-01' })];
    expect(sortByDateDesc(input).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(input.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('sorts projects: featured, then order, then newest', () => {
    const list = [
      e('old', { date: '2020-01-01' }),
      e('new', { date: '2025-01-01' }),
      e('feat', { date: '2019-01-01', featured: true }),
      e('pinned', { date: '2018-01-01', order: -1 }),
    ];
    expect(sortProjects(list).map((x) => x.id)).toEqual(['feat', 'pinned', 'new', 'old']);
  });
  it('hides drafts unless asked', () => {
    expect(isPublished(e('a', { draft: true }))).toBe(false);
    expect(isPublished(e('a', { draft: true }), { includeDrafts: true })).toBe(true);
    expect(isPublished(e('a', {}))).toBe(true);
  });
  it('counts tags', () => {
    expect(allTags([e('a', { tags: ['x', 'y'] }), e('b', { tags: ['y'] })])).toEqual([{ tag: 'y', count: 2 }, { tag: 'x', count: 1 }]);
  });
  // Regression guard: dates from frontmatter are UTC midnight and must not shift a day in other time zones.
  it('formats dates in UTC', () => {
    expect(formatDate(new Date('2026-11-01T00:00:00Z'))).toBe('1 November 2026');
  });
  it('estimates reading time, ignoring code', () => {
    expect(readingTime('')).toBe(1);
    expect(readingTime('word '.repeat(660))).toBe(3);
    expect(readingTime('```\n' + 'code '.repeat(5000) + '\n```')).toBe(1);
  });
  it('withBase', () => {
    expect(withBase('/blog/', '/Portfolio/')).toBe('/Portfolio/blog/');
    expect(withBase('blog/', '/Portfolio')).toBe('/Portfolio/blog/');
    expect(withBase('/', '/')).toBe('/');
    expect(withBase('https://x.test', '/P/')).toBe('https://x.test');
    expect(withBase('mailto:a@b.c', '/P/')).toBe('mailto:a@b.c');
    expect(withBase('#x', '/P/')).toBe('#x');
    expect(withBase(undefined, '/P/')).toBeUndefined();
  });
  it('isActive', () => {
    expect(isActive('/blog/', '/blog/hello/')).toBe(true);
    expect(isActive('/blog/', '/blog')).toBe(true);
    expect(isActive('/blog/', '/blogroll/')).toBe(false);
    expect(isActive('/', '/blog/')).toBe(false);
    expect(isActive('/', '/')).toBe(true);
  });
});
