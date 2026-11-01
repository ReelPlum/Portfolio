import { describe, it, expect } from 'vitest';
import { parseInclude, languageForFile, languageLabel, sliceLines, metaTitle, codeBlockHtml } from '../../src/lib/code-blocks.js';

describe('code file includes', () => {
  it('recognises a path to a source file, with an optional line range', () => {
    expect(parseInclude('/code/calc/main.rs')).toEqual({ path: '/code/calc/main.rs', lang: 'rust', from: null, to: null });
    expect(parseInclude('/code/calc/main.rs#L10-L20')).toMatchObject({ from: 10, to: 20 });
    expect(parseInclude('/code/calc/main.rs#L10-20')).toMatchObject({ from: 10, to: 20 });
    expect(parseInclude('/code/calc/main.rs#L7')).toMatchObject({ from: 7, to: 7 });
  });
  it('leaves other lines alone', () => {
    expect(parseInclude('/files/notes.pdf')).toBeNull(); // PDFs are embeds
    expect(parseInclude('/images/a.svg')).toBeNull();
    expect(parseInclude('/wasm/x/x.wasm')).toBeNull();
    expect(parseInclude('https://example.com/a.rs')).toBeNull();
    expect(parseInclude('/blog/hello/')).toBeNull();
    expect(parseInclude('see /code/a.rs')).toBeNull();
    expect(parseInclude('/code/data.unknownext')).toBeNull();
  });
  it('maps file extensions to languages', () => {
    expect(languageForFile('a.rs')).toBe('rust');
    expect(languageForFile('a.py')).toBe('python');
    expect(languageForFile('a.ts')).toBe('typescript');
    expect(languageForFile('a.h')).toBe('c');
    expect(languageForFile('a.hpp')).toBe('cpp');
    expect(languageForFile('a.go')).toBe('go');
    expect(languageForFile('x/Dockerfile')).toBe('docker');
    expect(languageForFile('a.toml')).toBe('toml');
    expect(languageForFile('README')).toBeNull();
  });
  it('slices line ranges and rejects ranges outside the file', () => {
    const src = 'one\r\ntwo\nthree\nfour\n';
    expect(sliceLines(src)).toBe('one\ntwo\nthree\nfour');
    expect(sliceLines(src, 2, 3)).toBe('two\nthree');
    expect(() => sliceLines(src, 3, 9)).toThrow(/outside the file \(it has 4 lines\)/);
    expect(() => sliceLines(src, 3, 2)).toThrow();
  });
  it('removes the shared indentation of a line range', () => {
    expect(sliceLines('impl A {\n    fn f() {\n        x();\n\n    }\n}', 2, 5)).toBe('fn f() {\n    x();\n\n}');
  });
});

describe('code block header', () => {
  it('names the language', () => {
    expect(languageLabel('rs')).toBe('Rust');
    expect(languageLabel('py')).toBe('Python');
    expect(languageLabel('cpp')).toBe('C++');
    expect(languageLabel('')).toBe('Text');
    expect(languageLabel('mystery')).toBe('mystery');
  });
  it('reads a file name from the fence', () => {
    expect(metaTitle('title="src/main.rs"')).toBe('src/main.rs');
    expect(metaTitle("file='a b.py'")).toBe('a b.py');
    expect(metaTitle('title=x.go other')).toBe('x.go');
    expect(metaTitle('')).toBeNull();
  });
  it('renders highlighted code with a label, file name and copy button', async () => {
    const html = await codeBlockHtml('fn main() { let x = 1; }', { lang: 'rust', title: 'main.rs', href: '/code/main.rs' });
    expect(html).toContain('data-language="rust"');
    expect(html).toContain('<span class="code-lang">Rust</span>');
    expect(html).toContain('<a class="code-title" href="/code/main.rs">main.rs</a>');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toMatch(/<pre class="shiki[^"]*"/);
    expect(html).toContain('--shiki-dark'); // light and dark colours
  });
  it('falls back to plain text for unknown languages and escapes the code', async () => {
    const html = await codeBlockHtml('<b>&</b>', { lang: 'mystery' });
    expect(html).toContain('data-language="text"');
    expect(html).toContain('<span class="code-lang">mystery</span>');
    expect(html).toContain('&#x3C;b>&#x26;&#x3C;/b>');
  });
});

describe('remarkCode', () => {
  const tree = (text) => ({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }] });
  it('a missing code file fails the build with a helpful message', async () => {
    const { remarkCode } = await import('../../src/lib/remark-code.js');
    await expect(remarkCode({ publicDirs: ['tests/fixtures/public'] })(tree('/code/nope.rs'), { path: 'post.md' }))
      .rejects.toThrow('Code file not found: /code/nope.rs. Put it in public/code/nope.rs (in post.md)');
  });
  it('a line range outside the file fails the build', async () => {
    const { remarkCode } = await import('../../src/lib/remark-code.js');
    await expect(remarkCode({ publicDirs: ['tests/fixtures/public'] })(tree('/code/tiny-calc/main.rs#L5-L5000'), {}))
      .rejects.toThrow(/lines 5-5000 are outside the file/);
  });
  it('includes the file as a highlighted block linking to it', async () => {
    const { remarkCode } = await import('../../src/lib/remark-code.js');
    const t = tree('/code/tiny-calc/main.rs#L1-L3');
    await remarkCode({ publicDirs: ['tests/fixtures/public'], base: '/Portfolio/' })(t, {});
    const { value } = t.children[0];
    expect(value).toContain('href="/Portfolio/code/tiny-calc/main.rs"');
    expect(value).toContain('main.rs (lines 1–3)');
    expect(value).toContain('tiny line-based calculator');
    expect(value).not.toContain('fn main');
  });
});
