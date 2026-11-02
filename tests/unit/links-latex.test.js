import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isExternal, linkAttrs } from '../../src/lib/links.js';
import { cleanPreamble, macrosFrom, preambleFromMarkdown } from '../../src/lib/latex.js';
import { markdownToText, MATH_RE } from '../../src/lib/search.js';
import katex from 'katex';

const site = 'https://reelplum.github.io';
const base = '/Portfolio/';

describe('external links', () => {
  it('treats other sites as external', () => {
    expect(isExternal('https://astro.build', { site, base })).toBe(true);
    expect(isExternal('http://example.com/x', { site, base })).toBe(true);
    expect(isExternal('//cdn.example.com/a.js', { site, base })).toBe(true);
    expect(isExternal('https://www.linkedin.com/in/x/')).toBe(true);
  });
  it('treats this site, relative links, anchors and mailto as internal', () => {
    expect(isExternal('/Portfolio/blog/', { site, base })).toBe(false);
    expect(isExternal('https://reelplum.github.io/Portfolio/blog/', { site, base })).toBe(false);
    expect(isExternal('https://reelplum.github.io/Portfolio', { site, base })).toBe(false);
    expect(isExternal('#maths', { site, base })).toBe(false);
    expect(isExternal('mailto:me@example.com', { site, base })).toBe(false);
    expect(isExternal(undefined)).toBe(false);
  });
  it('another project on the same github.io domain is external', () => {
    expect(isExternal('https://reelplum.github.io/other-repo/', { site, base })).toBe(true);
  });
  it('linkAttrs opens external links in a new tab safely', () => {
    expect(linkAttrs('https://github.com/ReelPlum')).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
    expect(linkAttrs('/Portfolio/')).toEqual({});
  });
});

describe('LaTeX preamble', () => {
  it('drops \\usepackage and \\documentclass, which KaTeX cannot load', () => {
    expect(cleanPreamble('\\documentclass{article}\n\\usepackage{amsmath}\n\\newcommand{\\R}{\\mathbb{R}}')).toEqual({
      tex: '\\newcommand{\\R}{\\mathbb{R}}',
      dropped: ['\\documentclass{article}', '\\usepackage{amsmath}'],
    });
  });
  it('turns a preamble into a KaTeX macros object', () => {
    const macros = macrosFrom('\\newcommand{\\norm}[1]{\\left\\lVert #1 \\right\\rVert}\n\\def\\eps{\\varepsilon}');
    expect(Object.keys(macros).sort()).toEqual(['\\eps', '\\norm']);
    const html = katex.renderToString('\\norm{x} < \\eps', { macros, throwOnError: false });
    expect(html).not.toContain('#cc0000');
    expect(html).toContain('ε');
  });
  // Regression: \R is built into KaTeX, so "\newcommand{\R}" failed and every definition after it was lost.
  it('lets \\newcommand redefine built-in commands and keeps going after a bad line', () => {
    const errors = [];
    const preamble = ['\\newcommand{\\R}{\\mathbb{R}}', '\\newcommand{\\broken', '\\newcommand{\\norm}[1]{\\lVert #1 \\rVert}'].join('\n');
    const macros = macrosFrom(preamble, { onError: (l) => errors.push(l) });
    expect(Object.keys(macros).sort()).toEqual(['\\norm', '\\R'].sort());
    expect(errors).toEqual(['\\newcommand{\\broken']);
  });
  it('collects preamble blocks and definitions inside formulas from markdown', () => {
    const md = '```preamble\n\\newcommand{\\A}{a}\n```\n\nText $\\gdef\\B{b}$ and $x^2$.\n\n```js\nlet x\n```';
    expect(preambleFromMarkdown(md, MATH_RE)).toBe('\\newcommand{\\A}{a}\n\\gdef\\B{b}');
    expect(preambleFromMarkdown('no maths here', MATH_RE)).toBe('');
  });
  it('preamble blocks are not search text', () => {
    expect(markdownToText('```preamble\n\\newcommand{\\A}{a}\n```\n\nHello $\\A$')).toBe('Hello $\\A$');
  });
});

// Regression: removing the scroll animations left attributes like `class="hero-title"-delay="0.05"`.
describe('templates', () => {
  const files = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.astro') ? [p] : [];
  });
  it('have no stray attribute fragments', () => {
    for (const f of files('src')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/"-[a-z]+=/);
  });
});

// Regression: rehype-katex brought its own older KaTeX, whose HTML (class "tag") didn't match the
// stylesheet of the KaTeX we load (".katex-tag"), so equation numbers weren't placed at the right edge.
describe('KaTeX versions', () => {
  it('pages are rendered with the same KaTeX as the stylesheet', async () => {
    const { createRequire } = await import('node:module');
    const root = createRequire(import.meta.url);
    const fromRehype = createRequire(new URL('../../node_modules/rehype-katex/package.json', import.meta.url));
    expect(fromRehype('katex/package.json').version).toBe(root('katex/package.json').version);
  });
});
