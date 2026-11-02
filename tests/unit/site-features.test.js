import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { authorIds, isGuest, checkAuthors, joinNames } from '../../src/lib/authors.js';
import { parseLog, commitUrl, fileAtCommitUrl, fileHistory } from '../../src/lib/history.js';
import { parseCv, formatMonth, formatPeriod, cvPdfName, loadCv } from '../../src/lib/cv.js';
import { ogCardHtml, ogImagePath, clip } from '../../src/lib/og.js';
import { goatcounterUrl } from '../../src/lib/analytics.js';
import { shareLinks } from '../../src/lib/share.js';
import { STATUSES } from '../../src/lib/status.js';
import { hasIcon } from '../../src/lib/icons.js';
import { wordsFromPath } from '../../src/lib/search.js';

const entry = (authors) => ({ collection: 'blog', id: 'x', data: { authors } });
const known = new Map([['frederik', {}], ['ada', {}]]);

describe('authors', () => {
  it('defaults to the site author and marks posts by others as guest posts', () => {
    expect(authorIds(entry(undefined), 'frederik')).toEqual(['frederik']);
    expect(authorIds(entry([]), 'frederik')).toEqual(['frederik']);
    expect(isGuest(entry(undefined), 'frederik')).toBe(false);
    expect(isGuest(entry(['ada']), 'frederik')).toBe(true);
    expect(isGuest(entry(['ada', 'frederik']), 'frederik')).toBe(false);
  });
  it('fails the build on an unknown author', () => {
    expect(() => checkAuthors([entry(['ada'])], known, 'frederik')).not.toThrow();
    expect(() => checkAuthors([entry(['bob'])], known, 'frederik')).toThrow(/Unknown author "bob" in blog\/x\. Add them to authors\.yaml/);
    expect(() => checkAuthors([], known, 'nobody')).toThrow(/defaultAuthor "nobody"/);
  });
  it('joins names', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('version history', () => {
  it('parses git log output, keeping separators in messages', () => {
    const out = 'abc123\u001f2026-11-01T10:00:00+01:00\u001fFrederik\u001fFix: a typo\ndef456\u001f2026-10-01T09:00:00Z\u001fAda\u001fFirst draft\n';
    expect(parseLog(out)).toEqual([
      { hash: 'abc123', date: '2026-11-01T10:00:00+01:00', author: 'Frederik', subject: 'Fix: a typo' },
      { hash: 'def456', date: '2026-10-01T09:00:00Z', author: 'Ada', subject: 'First draft' },
    ]);
  });
  it('links to the commit at the file, and to the file at that commit', () => {
    // GitHub's anchor for a file in a commit is "diff-" + sha256 of its path.
    const sha = createHash('sha256').update('src/x.md').digest('hex');
    expect(commitUrl('https://github.com/a/b/', 'abc', 'src/x.md')).toBe(`https://github.com/a/b/commit/abc#diff-${sha}`);
    expect(commitUrl('https://github.com/a/b', 'abc', 'src/x.md')).toMatch(/^https:\/\/github\.com\/a\/b\/commit\/abc#diff-[0-9a-f]{64}$/);
    expect(fileAtCommitUrl('https://github.com/a/b', 'abc', 'src/x.md')).toBe('https://github.com/a/b/blob/abc/src/x.md');
    expect(commitUrl(null, 'abc')).toBeNull();
  });
  it('reads real history from git, and returns nothing for unknown files', () => {
    const commits = fileHistory('README.md');
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0].hash).toMatch(/^[0-9a-f]{40}$/);
    expect(fileHistory('does/not/exist.md')).toEqual([]);
  });
});

describe('CV', () => {
  it('reads cv.yaml and fills in defaults', () => {
    const cv = parseCv('name: Ada\nexperience:\n  - { role: Dev, org: X, start: 2024-09, end: present }');
    expect(cv.name).toBe('Ada');
    expect(cv.experience[0]).toMatchObject({ role: 'Dev', start: '2024-09', end: 'present', points: [] });
    expect(cv.skills).toEqual([]);
  });
  it('names the field that is wrong', () => {
    expect(() => parseCv('headline: x')).toThrow(/name: /);
    expect(() => parseCv('name: A\nemail: not-an-email')).toThrow(/email: /);
    expect(() => parseCv('name: A\nexperiance: []')).toThrow(/experiance/);
  });
  it('formats dates and the PDF name', () => {
    expect(formatMonth('2023-09')).toMatch(/^Sept? 2023$/);
    expect(formatMonth('2024')).toBe('2024');
    expect(formatPeriod({ start: '2021', end: 'present' })).toBe('2021 – Present');
    expect(cvPdfName('Frederik Ærø Example')).toBe('frederik-aeroe-example-cv.pdf');
    expect(cvPdfName('!!!')).toBe('cv.pdf');
    expect(cvPdfName('Frederik Example')).toBe('frederik-example-cv.pdf');
  });
  it('loads the fixture CV', () => {
    expect(loadCv(new URL('../fixtures/content/', import.meta.url).pathname).name).toBe('Frederik Example');
  });
});

describe('social preview images', () => {
  it('has a path per document and one for the site', () => {
    expect(ogImagePath('blog/hello')).toBe('/og/blog/hello.png');
    expect(ogImagePath(null)).toBe('/og/site.png');
  });
  it('clips long text at a word and escapes HTML', () => {
    expect(clip('one two three four', 9)).toBe('one two…');
    const html = ogCardHtml({ title: '<script>x</script>', type: 'Post', date: '2026-01-02', tags: ['A&B'], description: 'Hi' }, { site: { title: 'Site', url: 'https://x.io', base: '/' } });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('>Blog<');
    expect(html).not.toMatch(/gradient/i);
  });
});

describe('analytics', () => {
  it('is off without a site code, and builds the GoatCounter URL', () => {
    expect(goatcounterUrl('')).toBeNull();
    expect(goatcounterUrl(undefined)).toBeNull();
    expect(goatcounterUrl('Frederik')).toBe('https://frederik.goatcounter.com/count');
    expect(goatcounterUrl('https://stats.example.com')).toBe('https://stats.example.com/count');
    expect(goatcounterUrl('https://stats.example.com/count')).toBe('https://stats.example.com/count');
    expect(() => goatcounterUrl('my site')).toThrow(/site code/);
  });
});

describe('share links', () => {
  it('encodes the address and title into plain share URLs', () => {
    const links = shareLinks({ url: 'https://x.io/a b/?q=1&r=2', title: 'Rust & me' });
    expect(links.map((l) => l.id)).toEqual(['linkedin', 'x', 'bluesky']);
    expect(links[0].href).toBe('https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fx.io%2Fa%20b%2F%3Fq%3D1%26r%3D2');
    expect(links[1].href).toContain('text=Rust%20%26%20me');
    expect(links[2].href).toBe('https://bsky.app/intent/compose?text=Rust%20%26%20me%20https%3A%2F%2Fx.io%2Fa%20b%2F%3Fq%3D1%26r%3D2');
    for (const l of links) expect(hasIcon(l.icon)).toBe(true);
  });
});

describe('project status', () => {
  it('every status has a label and a real icon', () => {
    for (const s of Object.values(STATUSES)) {
      expect(s.label).toBeTruthy();
      expect(hasIcon(s.icon)).toBe(true);
    }
  });
});

describe('404 search', () => {
  it('turns the missing address into search words', () => {
    expect(wordsFromPath('/Portfolio/blog/tree-walkng-interpreter/', '/Portfolio/')).toBe('tree walkng interpreter');
    expect(wordsFromPath('/projects/tiny_calc.html')).toBe('tiny calc');
    expect(wordsFromPath('/Portfolio/404.html', '/Portfolio/')).toBe('');
    expect(wordsFromPath('/Portfolio/caf%C3%A9/', '/Portfolio/')).toBe('café');
  });
});
