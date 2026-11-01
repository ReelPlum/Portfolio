import { describe, it, expect } from 'vitest';
import { iconSvg, hasIcon, toPascal, animations } from '../../src/lib/icons.js';
import { resolveTheme, nextTheme, readStored, writeStored } from '../../src/lib/theme.js';
import { contactLinks } from '../../src/lib/contact.js';
import { personLd, blogPostingLd, projectLd, ldJson, robotsTxt } from '../../src/lib/seo.js';
import { demoAsset, demoReady, demoExamples } from '../../src/lib/demo.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('icons', () => {
  it('renders sized, decorative icons with an animation', () => {
    const svg = iconSvg('sun', { size: 18 });
    expect(svg).toMatch(/^<svg class="icon" data-icon="sun" data-anim="spin" aria-hidden="true"/);
    expect(svg).toContain('width="18"');
    expect(svg).not.toContain('lucide-sun');
  });
  it('labels icons that stand alone', () => {
    expect(iconSvg('github', { label: 'GitHub "x"' })).toContain('role="img" aria-label="GitHub &quot;x&quot;"');
  });
  it('throws on unknown icons so typos fail the build', () => {
    expect(() => iconSvg('definitely-not-an-icon')).toThrow(/Unknown icon/);
  });
  it('every icon with an animation exists', () => {
    for (const name of Object.keys(animations)) expect(hasIcon(name), name).toBe(true);
  });
  it('toPascal', () => expect(toPascal('arrow-up-right')).toBe('ArrowUpRight'));
});

describe('theme', () => {
  it('resolves stored choice, falling back to the system', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('garbage', false)).toBe('light');
  });
  it('toggles', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
  });
  it('survives storage that throws (private mode)', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(readStored(() => bad)).toBeNull();
    expect(() => writeStored('dark', () => bad)).not.toThrow();
    const map = new Map();
    const ok = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
    writeStored('dark', () => ok);
    expect(readStored(() => ok)).toBe('dark');
  });
  // Regression: the toggle crashed when merely accessing window.localStorage threw (blocked cookies).
  it('survives the storage getter itself throwing', () => {
    const throwing = () => { throw new Error('SecurityError'); };
    expect(() => writeStored('dark', throwing)).not.toThrow();
    expect(readStored(throwing)).toBeNull();
  });
});

describe('contact', () => {
  it('builds a mailto row and social rows', () => {
    const rows = contactLinks({ email: ' me@x.dk ', social: [{ label: 'GitHub', href: 'https://github.com/ReelPlum/', icon: 'github' }] });
    expect(rows[0]).toEqual({ label: 'Email', detail: 'me@x.dk', href: 'mailto:me@x.dk', icon: 'mail' });
    expect(rows[1]).toEqual({ label: 'GitHub', detail: 'github.com/ReelPlum', href: 'https://github.com/ReelPlum/', icon: 'github' });
  });
  it('skips email when empty', () => {
    expect(contactLinks({ email: '', social: [] })).toEqual([]);
  });
});

describe('seo', () => {
  it('person', () => {
    expect(personLd({ author: 'F', tagline: 't', social: [{ href: 'https://g' }] }, 'https://s/')).toMatchObject({ '@type': 'Person', name: 'F', sameAs: ['https://g'] });
  });
  it('blog posting and project', () => {
    expect(blogPostingLd({ title: 'T', date: '2026-01-02', url: 'u', author: 'F' })).toMatchObject({ '@type': 'BlogPosting', headline: 'T', datePublished: '2026-01-02T00:00:00.000Z' });
    expect(projectLd({ title: 'P', date: '2026-01-02', url: 'u', author: 'F', source: 'https://g' })).toMatchObject({ '@type': 'SoftwareSourceCode', codeRepository: 'https://g' });
    expect(projectLd({ title: 'P', date: '2026-01-02', url: 'u', author: 'F' })['@type']).toBe('CreativeWork');
  });
  it('JSON-LD cannot break out of its script tag', () => {
    expect(ldJson({ a: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
  it('robots.txt allows everything and lists the sitemap', () => {
    expect(robotsTxt('https://x/sitemap-index.xml')).toBe('User-agent: *\nAllow: /\n\nSitemap: https://x/sitemap-index.xml\n');
  });
});

describe('demo', () => {
  it('finds the asset path', () => {
    expect(demoAsset({ type: 'wasi', wasm: '/wasm/a/a.wasm' })).toBe('wasm/a/a.wasm');
    expect(demoAsset({ type: 'bindgen', module: '/wasm/b/b.js?v=2' })).toBe('wasm/b/b.js');
    expect(demoAsset({ type: 'iframe', src: 'https://x.test' })).toBeNull();
  });
  it('is not ready until the file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pub-'));
    const demo = { type: 'wasi', wasm: '/wasm/x/x.wasm' };
    expect(demoReady(demo, dir)).toBe(false);
    mkdirSync(join(dir, 'wasm/x'), { recursive: true });
    writeFileSync(join(dir, 'wasm/x/x.wasm'), '');
    expect(demoReady(demo, dir)).toBe(true);
    expect(demoReady({ type: 'iframe', src: 'https://x.test' }, dir)).toBe(true);
    expect(demoReady(undefined, dir)).toBe(false);
  });
  it('merges example and examples', () => {
    expect(demoExamples({ example: 'a', examples: [{ name: 'B', code: 'b' }] })).toEqual([{ name: 'Example', code: 'a' }, { name: 'B', code: 'b' }]);
    expect(demoExamples({ example: 'b', examples: [{ name: 'B', code: 'b' }] })).toHaveLength(1);
    expect(demoExamples({})).toEqual([]);
  });
});
