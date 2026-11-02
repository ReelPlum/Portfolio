import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import rehypeKatex from 'rehype-katex';
import { remarkCallouts } from '../../src/lib/remark-callouts.js';
import { remarkMathRefs } from '../../src/lib/remark-math-refs.js';
import { remarkCitations, parseCitation } from '../../src/lib/citations.js';
import { rehypeSidenotes } from '../../src/lib/rehype-sidenotes.js';
import { rehypeHeadingAnchors } from '../../src/lib/rehype-heading-anchors.js';
import { remarkSnippets, expandSnippetText } from '../../src/lib/snippets.js';
import { remarkLiveVars, parseVars, substituteTex, parseFnPlot, fnPlotGeometry, niceTicks } from '../../src/lib/live-vars.js';
import { compile, variablesOf, formatNumber } from '../../src/lib/expr.js';
import { parseUnifiedDiff, parseFileDiff, diffTexts, splitRows, diffBlockHtml } from '../../src/lib/diff-blocks.js';
import { parseCompare, compareHtml } from '../../src/lib/compare.js';
import { mermaidHtml } from '../../src/lib/remark-code.js';
import { relatedDocs, injectRelated, relatedHtml } from '../../src/lib/related.js';
import { updatedDate, readingTime } from '../../src/lib/content.js';
import { createFromTemplate, slugify, fillTemplate } from '../../scripts/new.js';

const fixtures = new URL('../fixtures/', import.meta.url).pathname;
const contentDir = join(fixtures, 'content');
const publicDirs = [join(fixtures, 'public')];

const render = async (md, { frontmatter = {}, rehype = [] } = {}) => String(await unified()
  .use(remarkParse).use(remarkGfm).use(remarkMath)
  .use(remarkSnippets, { dir: join(contentDir, 'snippets') })
  .use(remarkLiveVars)
  .use(remarkCallouts).use(remarkMathRefs).use(remarkCitations, { contentDir, publicDirs })
  .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeKatex)
  .use(rehype)
  .use(rehypeStringify)
  .process({ value: md, data: { astro: { frontmatter } } }));

describe('dates and reading time', () => {
  it('shows "updated" only when it is a later day than the publish date', () => {
    expect(updatedDate({ date: new Date('2026-10-01') })).toBeNull();
    expect(updatedDate({ date: new Date('2026-10-01'), updated: new Date('2026-10-01') })).toBeNull();
    expect(updatedDate({ date: new Date('2026-10-01'), updated: new Date('2026-09-01') })).toBeNull();
    expect(updatedDate({ date: new Date('2026-10-01'), updated: new Date('2026-10-05') })).toEqual(new Date('2026-10-05'));
  });
  it('reading time ignores code', () => {
    expect(readingTime('word '.repeat(440))).toBe(2);
    expect(readingTime(`hi\n\`\`\`\n${'x '.repeat(5000)}\n\`\`\``)).toBe(1);
  });
});

describe('callouts', () => {
  it('turns [!NOTE] blockquotes into labelled boxes with an icon', async () => {
    const html = await render('> [!NOTE]\n> Hello there');
    expect(html).toContain('<aside class="callout callout-note" role="note" aria-label="Note">');
    expect(html).toContain('data-icon="info"');
    expect(html).toContain('<p>Hello there</p>');
    expect(html).not.toContain('[!NOTE]');
  });
  it('takes a custom title and keeps normal blockquotes', async () => {
    expect(await render('> [!WARNING] Mind the gap\n> Text')).toMatch(/callout-warning[^>]*aria-label="Mind the gap"/);
    expect(await render('> just a quote')).toContain('<blockquote>');
  });
  it('fails the build on an unknown kind', async () => {
    await expect(render('> [!NOPE]\n> x')).rejects.toThrow(/Unknown callout \[!NOPE\]/);
  });
});

describe('numbered equations, theorems and references', () => {
  it('numbers labelled equations and links \\eqref to them', async () => {
    const html = await render('$$\nE = mc^2 \\label{energy}\n$$\n\n$$\na = b \\label{two}\n$$\n\nSee \\eqref{two} and $\\eqref{energy}$.');
    expect(html).toContain('<span id="ref-energy" class="eq-anchor"></span>');
    expect(html).toContain('\\tag{1}');
    expect(html).toContain('<a href="#ref-two" class="math-ref">(2)</a>');
    expect(html).toContain('<a href="#ref-energy" class="math-ref">(1)</a>');
    // Regression: the label stayed in the rendered formula because remark-math keeps its own copy of the TeX.
    expect(html).not.toMatch(/\\label|labelenergy/);
    expect(html).not.toContain('#cc0000');
  });
  it('numbers theorems, lemmas and definitions together and lets \\ref point at them', async () => {
    const html = await render('> [!DEFINITION] Group \\label{grp}\n> A set.\n\n> [!THEOREM] Lagrange \\label{lag}\n> Orders divide.\n\n> [!PROOF]\n> Cosets.\n\nTheorem \\ref{lag} uses Definition \\ref{grp}.');
    expect(html).toContain('<strong>Definition 1</strong> <span class="callout-name">(Group)</span>');
    expect(html).toContain('<strong>Theorem 2</strong>');
    expect(html).toContain('id="ref-lag"');
    expect(html).toContain('Theorem <a href="#ref-lag" class="math-ref">2</a> uses Definition <a href="#ref-grp" class="math-ref">1</a>');
    expect(html).toContain('callout-proof');
    expect(html).not.toMatch(/Proof \d/);
  });
  it('fails on a missing or duplicate label', async () => {
    await expect(render('See \\eqref{nope}.')).rejects.toThrow(/\\eqref\{nope\} refers to a label that does not exist/);
    await expect(render('$$\na \\label{x}\n$$\n\n$$\nb \\label{x}\n$$')).rejects.toThrow(/used twice/);
  });
});

describe('citations', () => {
  it('parses keys and locators', () => {
    expect(parseCitation('@a, p. 3; @b')).toEqual([{ key: 'a', locator: 'p. 3' }, { key: 'b', locator: '' }]);
  });
  it('numbers citations by first use and lists them under References', async () => {
    const html = await render('A [@nystrom2021] B [@knuth1984, p. 12] C [@nystrom2021; @turing1936].', { frontmatter: { bibliography: '/files/extra.bib' } });
    expect(html).toContain('<a href="#cite-nystrom2021" class="citation-link" title="Crafting Interpreters">1</a>');
    expect(html).toContain('>2, p. 12</a>');
    expect(html).toContain('[<a href="#cite-nystrom2021" class="citation-link" title="Crafting Interpreters">1</a>; <a href="#cite-turing1936"');
    expect(html).toContain('<h2>References</h2>');
    const order = [...html.matchAll(/<li id="(cite-[^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['cite-nystrom2021', 'cite-knuth1984', 'cite-turing1936']);
    expect(html).toContain('<a href="https://doi.org/10.1112/plms/s2-42.1.230">');
  });
  it('fails the build on an unknown key or a missing .bib file', async () => {
    await expect(render('See [@nobody2020].')).rejects.toThrow(/\[@nobody2020\] is not in any \.bib file/);
    await expect(render('See [@knuth1984].', { frontmatter: { bibliography: '/files/missing.bib' } })).rejects.toThrow(/Bibliography not found/);
  });
  it('leaves posts without citations alone', async () => {
    expect(await render('Email me@example.com [link](https://x.y)')).not.toContain('References');
  });
});

describe('sidenotes', () => {
  it('copies each footnote next to its reference, without the back link', async () => {
    const html = await render('Simple[^a] and fast.[^b]\n\n[^a]: Directly.\n[^b]: Usually *much*.', { rehype: [rehypeSidenotes] });
    const notes = [...html.matchAll(/<span class="sidenote" role="note" aria-label="Note (\d)">(.*?)<\/span><\/span>/g)];
    expect(notes.map((n) => n[1])).toEqual(['1', '2']);
    expect(html).toMatch(/<span class="sidenote"[^>]*><span class="sidenote-num" aria-hidden="true">1<\/span> <span class="sidenote-p">Directly\./);
    expect(html).toContain('<em>much</em>');
    const sidenoteHtml = html.slice(html.indexOf('class="sidenote"'), html.indexOf('</p>'));
    expect(sidenoteHtml).not.toContain('data-footnote-backref');
    expect(html).toContain('footnotes has-sidenotes');
  });
  it('does nothing without footnotes', async () => {
    expect(await render('Plain.', { rehype: [rehypeSidenotes] })).not.toContain('sidenote');
  });
});

describe('heading anchors', () => {
  it('adds a copy-link anchor to h2–h4 with matching ids, skipping the footnote label', async () => {
    const html = await render('# Title\n\n## Hello world\n\n### Hello world\n\nNote[^1]\n\n[^1]: x', { rehype: [rehypeHeadingAnchors] });
    expect(html).toContain('<h2 id="hello-world" class="has-anchor">Hello world<a class="heading-anchor" href="#hello-world"');
    expect(html).toContain('<h3 id="hello-world-1" class="has-anchor">');
    expect(html).toContain('aria-label="Copy link to “Hello world”"');
    expect(html).not.toMatch(/<h1[^>]*has-anchor/);
    expect(html).not.toMatch(/id="footnote-label"[^>]*has-anchor/);
  });
});

describe('snippets', () => {
  const dir = join(contentDir, 'snippets');
  it('includes a snippet, fills its values, and nests', async () => {
    const html = await render('Before\n\n{{snippet signoff}}\n\nAfter');
    expect(html).toContain('callout-tip');
    expect(html).toContain('<code>cargo add signoff-crate</code>');
    expect(html).toContain('class="katex"');
    expect(expandSnippetText('{{snippet install package="x"}}', dir)).toContain('cargo add x');
  });
  it('accepts the curly quotes that smartypants makes', () => {
    expect(expandSnippetText('{{snippet install package=“y”}}', dir)).toContain('cargo add y');
  });
  it('leaves code fences alone and fails on missing snippets or values', () => {
    expect(expandSnippetText('```\n{{snippet install}}\n```', dir)).toContain('{{snippet install}}');
    expect(() => expandSnippetText('{{snippet nope}}', dir)).toThrow(/Snippet not found: nope/);
    expect(() => expandSnippetText('{{snippet install}}', dir)).toThrow(/needs package=/);
  });
  it('refuses a snippet that includes itself', () => {
    const d = mkdtempSync(join(tmpdir(), 'snip-'));
    writeFileSync(join(d, 'loop.md'), '{{snippet loop}}');
    expect(() => expandSnippetText('{{snippet loop}}', d)).toThrow(/includes itself/);
  });
});

describe('post templates', () => {
  it('makes a slug and fills the template', () => {
    expect(slugify('Ærø: Rust & WASM!')).toBe('aeroe-rust-wasm');
    expect(fillTemplate('title: "{{title}}"\ndate: {{date}}', { title: 'Say "hi"', date: '2026-11-02', slug: 's' })).toBe('title: "Say \\"hi\\""\ndate: 2026-11-02');
  });
  it('creates a draft post or project from each template and never overwrites', () => {
    const contentDir = mkdtempSync(join(tmpdir(), 'content-'));
    const post = createFromTemplate({ kind: 'post', title: 'My First Post', date: '2026-11-02', contentDir });
    expect(post).toBe(join(contentDir, 'blog', 'my-first-post.md'));
    const text = readFileSync(post, 'utf8');
    expect(text).toContain('title: "My First Post"');
    expect(text).toContain('draft: true');
    expect(existsSync(createFromTemplate({ kind: 'project', title: 'Calc', contentDir }))).toBe(true);
    expect(createFromTemplate({ kind: 'math-notes', title: 'Groups', contentDir })).toContain('/blog/');
    expect(() => createFromTemplate({ kind: 'post', title: 'My First Post', contentDir })).toThrow(/already exists/);
    expect(() => createFromTemplate({ kind: 'poem', title: 'x', contentDir })).toThrow(/No template "poem"/);
  });
});

describe('expressions', () => {
  it('evaluates maths safely', () => {
    expect(compile('2 + 3 * 4 ^ 2')({})).toBe(50);
    expect(compile('-2^2')({})).toBe(-4);
    expect(compile('2x + sin(pi/2)')({ x: 3 })).toBe(7);
    expect(compile('max(a, 2)')({ a: 5 })).toBe(5);
    expect(() => compile('constructor')({})).toThrow(/Unknown variable/);
    expect(() => compile('alert(1)')({})).toThrow(/Unknown variable "alert"/);
    expect(() => compile('2 +')).toThrow();
    expect(() => compile('a; b')).toThrow();
    expect(variablesOf('a*sin(k*x) + pi')).toEqual(['a', 'k', 'x']);
  });
  it('formats numbers', () => {
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(-0.0001)).toBe('0');
    expect(formatNumber(-2)).toBe('−2');
    expect(formatNumber(NaN)).toBe('–');
  });
});

describe('sliders', () => {
  it('parses slider declarations', () => {
    expect(parseVars('a = 2 range 0..5 step 0.5 Amplitude\nk = 1 range 1..4')).toEqual([
      { name: 'a', value: 2, min: 0, max: 5, step: 0.5, label: 'Amplitude' },
      { name: 'k', value: 1, min: 1, max: 4, step: 0.03, label: 'k' },
    ]);
    expect(() => parseVars('a = 9 range 0..5')).toThrow(/outside/);
    expect(() => parseVars('a is 3')).toThrow(/Can't read/);
  });
  it('puts values into TeX', () => {
    expect(substituteTex('y = \\var{a}\\sin(\\var{2*k} x)', { a: 1.5, k: -1 })).toBe('y = {1.5}\\sin({-2} x)');
  });
  it('renders sliders, live values, live formulas and function plots at build time', async () => {
    const md = '```vars\na = 2 range 0..5 step 0.5 Amplitude\n```\n\nPeak `=a`, double `=2a`, code `x`.\n\n$$\ny = \\var{a} x\n$$\n\n```fnplot\ny: a*x\nx: -1..1\n```';
    const html = await render(md);
    expect(html).toContain('<input id="var-a" type="range" data-var="a" min="0" max="5" step="0.5" value="2"');
    expect(html).toContain('<label for="var-a">');
    expect(html).toContain('<span class="live-value" data-live-expr="a">2</span>');
    expect(html).toContain('data-live-expr="2a">4</span>');
    expect(html).toContain('<code>x</code>');
    expect(html).toContain('class="live-math live-math-display" data-tex="');
    expect(html).toMatch(/data-fnplot=.*<path class="fn-line series-1" d="M/);
  });
  it('fails on undeclared variables', async () => {
    await expect(render('```vars\na = 1 range 0..2\n```\n\n`=b`')).rejects.toThrow(/"b" is not a slider/);
    await expect(render('```fnplot\ny: q*x\n```')).rejects.toThrow(/"q" is not a slider/);
  });
  it('function plots break lines at gaps and pick nice ticks', () => {
    const plot = parseFnPlot('y: 1/x\nx: -1..1\ny-range: -10..10');
    const { paths } = fnPlotGeometry(plot, {}, 20);
    expect(paths[0].match(/M/g).length).toBeGreaterThan(1);
    expect(parseFnPlot('y: sin(x)\nx: -pi..pi').x[1]).toBeCloseTo(Math.PI);
    expect(() => parseFnPlot('y: x\nx: 5..1')).toThrow(/low\.\.high/);
    expect(() => parseFnPlot('y: x, x, x, x')).toThrow(/At most 3/);
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe('diffs', () => {
  it('parses a pasted unified diff with headers', () => {
    const { file, hunks } = parseUnifiedDiff('--- a/src/x.rs\n+++ b/src/x.rs\n@@ -3,2 +3,3 @@ fn main\n keep\n-old\n+new\n+more\n\\ No newline at end of file');
    expect(file).toBe('src/x.rs');
    expect(hunks).toEqual([{ oldStart: 3, newStart: 3, header: 'fn main', lines: [{ type: ' ', text: 'keep' }, { type: '-', text: 'old' }, { type: '+', text: 'new' }, { type: '+', text: 'more' }] }]);
  });
  it('accepts a diff without @@ headers', () => {
    expect(parseUnifiedDiff('-a\n+b').hunks[0].lines).toHaveLength(2);
  });
  it('recognises a two-file diff and requires both files', () => {
    expect(parseFileDiff('from: /a.rs\nto: /b.rs')).toEqual({ from: '/a.rs', to: '/b.rs' });
    expect(parseFileDiff('-a\n+b')).toBeNull();
    expect(() => parseFileDiff('from: /a.rs')).toThrow(/both/);
  });
  it('diffs two texts and pairs changes for the side-by-side view', () => {
    const hunks = diffTexts('a\nb\nc\n', 'a\nB\nB2\nc\n');
    const rows = splitRows(hunks[0].lines);
    expect(rows.map(([l, r]) => [l?.text ?? null, r?.text ?? null])).toEqual([['a', 'a'], ['b', 'B'], [null, 'B2'], ['c', 'c']]);
  });
  it('renders both views, highlighted, with line numbers, stats and an accessible toggle', async () => {
    const html = await diffBlockHtml(diffTexts('let a = 1;\n', 'let a = 2;\n'), { lang: 'rust', title: 'x.rs' });
    expect(html).toContain('<span class="code-lang">Rust</span>');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('class="diff-view diff-view-unified" hidden');
    expect(html).toContain('<span class="diff-stat-add">+1</span> <span class="diff-stat-del">−1</span>');
    expect(html).toMatch(/style="color:#[0-9A-Fa-f]{6};--shiki-dark:#F97583"/); // keywords (light colour made readable)
    expect(html).toContain('<span class="visually-hidden">Removed: </span>');
  });
});

describe('before / after', () => {
  it('parses and renders a slider over two images with a keyboard-friendly range input', () => {
    const spec = parseCompare('before: /images/sphere-flat.png | Flat\nafter: /images/sphere-lit.png\nalt: A sphere\nstart: 30');
    expect(spec).toMatchObject({ before: { label: 'Flat' }, after: { label: 'After' }, start: 30 });
    const html = compareHtml(spec, { publicDirs, hrefFor: (p) => `/base${p}` });
    expect(html).toContain('style="--pos:30%"');
    expect(html).toContain('<input class="compare-range" type="range" min="0" max="100" step="1" value="30" aria-label="Slide to compare Flat and After"');
    expect(html).toContain('src="/base/images/sphere-lit.png" alt="After: A sphere"');
  });
  it('fails on missing images or unknown lines', () => {
    expect(() => compareHtml(parseCompare('before: /nope.png\nafter: /images/sphere-lit.png'), { publicDirs })).toThrow(/Image not found: \/nope\.png/);
    expect(() => parseCompare('before: /a.png')).toThrow(/Missing "after/);
    expect(() => parseCompare('before: /a.png\nafter: /b.png\nzoom: 2')).toThrow(/Unknown line/);
  });
});

describe('mermaid', () => {
  it('keeps the escaped source for readers without JavaScript', () => {
    const html = mermaidHtml('graph LR\n  A["<b>"] --> B', 'Flow');
    expect(html).toContain('data-mermaid aria-label="Flow"');
    expect(html).toContain('<pre class="mermaid-source">graph LR\n  A[&quot;&lt;b&gt;&quot;] --&gt; B</pre>');
    expect(html).toContain('<figcaption>Flow</figcaption>');
  });
});

describe('related posts', () => {
  const docs = [
    { id: 'blog/a', type: 'Post', title: 'A', url: '/a/', date: '2026-01-01', tags: ['x'] },
    { id: 'blog/b', type: 'Post', title: 'B', url: '/b/', date: '2026-01-02', tags: ['x'] },
    { id: 'blog/c', type: 'Post', title: 'C', url: '/c/', date: '2026-01-03' },
    { id: 'projects/d', type: 'Project', title: 'D <3', url: '/d/', description: 'Desc' },
  ];
  const vec = { 'blog/a': [1, 0, 0], 'blog/b': [0.9, 0.1, 0], 'blog/c': [0, 1, 0], 'projects/d': [0.7, 0.7, 0] };
  it('picks the most similar documents, never the page itself', () => {
    const rel = relatedDocs(docs, (d) => vec[d.id], { count: 2 });
    expect(rel.get('blog/a').map((r) => r.doc.id)).toEqual(['blog/b', 'projects/d']);
    expect(rel.get('blog/c').map((r) => r.doc.id)).not.toContain('blog/c');
  });
  it('fills the placeholder, escapes titles, and removes it when there is nothing related', () => {
    const rel = relatedDocs(docs, (d) => vec[d.id], { count: 1 });
    const page = '<main><section class="related" data-related="blog/c"></section></main>';
    const out = injectRelated(page, rel);
    expect(out).toContain('<h2 id="related-title" class="related-title">');
    expect(out).toContain('D &lt;3');
    expect(out).toContain('href="/d/"');
    expect(injectRelated('<section class="related" data-related="blog/zzz"></section>', rel)).toBe('');
    expect(relatedHtml([])).toBe('');
  });
});
