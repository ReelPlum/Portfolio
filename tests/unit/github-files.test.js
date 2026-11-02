import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import {
  parseGithubUrl, localPath, githubToLocal, frontmatterRefs, createGithubFiles, bindgenWasm, serveGithubFiles, contentType,
} from '../../src/lib/github-files.js';
import { remarkGithubFiles } from '../../src/lib/remark-github-files.js';
import { prefetchFrontmatter } from '../../src/lib/github-files-integration.js';
import { remarkCode } from '../../src/lib/remark-code.js';
import { remarkEmbeds } from '../../src/lib/remark-embeds.js';
import { rehypeDownloadLinks } from '../../src/lib/rehype-download-links.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'gh-files-'));
const MOCK = new URL('../fixtures/github/', import.meta.url).pathname;
const res = (status, body = '') => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => new TextEncoder().encode(body).buffer });

describe('parseGithubUrl', () => {
  it('reads blob, raw and raw.githubusercontent.com links', () => {
    const want = { owner: 'me', repo: 'interp', ref: 'main', path: 'src/lexer.rs', suffix: '' };
    expect(parseGithubUrl('https://github.com/me/interp/blob/main/src/lexer.rs')).toEqual(want);
    expect(parseGithubUrl('https://github.com/me/interp/raw/main/src/lexer.rs')).toEqual(want);
    expect(parseGithubUrl('https://raw.githubusercontent.com/me/interp/main/src/lexer.rs')).toEqual(want);
  });
  it('keeps the line range and query, so #L10-L20 and ?height= still work', () => {
    expect(parseGithubUrl('https://github.com/me/r/blob/v1.2/a.rs#L10-L20').suffix).toBe('#L10-L20');
    expect(parseGithubUrl('https://github.com/me/r/blob/main/pkg/app.js?height=600').suffix).toBe('?height=600');
  });
  // Regression: GitHub's line links in Markdown files carry ?plain=1, which broke the line range.
  it('drops the ?plain=1 GitHub adds to line links in Markdown files', () => {
    expect(parseGithubUrl('https://github.com/me/r/blob/main/README.md?plain=1#L3-L5').suffix).toBe('#L3-L5');
  });
  it('decodes escaped characters in the path', () => {
    expect(parseGithubUrl('https://github.com/me/r/blob/main/my%20notes.txt').path).toBe('my notes.txt');
  });
  it('ignores links that are not to a file', () => {
    expect(parseGithubUrl('https://github.com/me/r')).toBeNull();
    expect(parseGithubUrl('https://github.com/me/r/tree/main/src')).toBeNull();
    expect(parseGithubUrl('https://github.com/me/r/issues/4')).toBeNull();
    expect(parseGithubUrl('https://gitlab.com/me/r/blob/main/a.rs')).toBeNull();
    expect(parseGithubUrl('/code/a.rs')).toBeNull();
    expect(parseGithubUrl('not a url')).toBeNull();
  });
  it('rejects paths that try to leave the folder', () => {
    expect(parseGithubUrl('https://github.com/me/r/blob/main/%2E%2E/%2E%2E/etc/passwd')).toBeNull();
    expect(parseGithubUrl('https://raw.githubusercontent.com/me/r/main/a%5C..%5Cb')).toBeNull();
  });
});

describe('local paths', () => {
  it('maps a file to /_github/owner/repo/ref/path, and apps to /wasm/_github/', () => {
    const f = parseGithubUrl('https://github.com/me/r/blob/main/pkg/my app.js');
    expect(localPath(f)).toBe('/_github/me/r/main/pkg/my%20app.js');
    expect(localPath(f, { app: true })).toBe('/wasm/_github/me/r/main/pkg/my%20app.js');
  });
  it('swaps GitHub links in frontmatter values and leaves others alone', () => {
    expect(githubToLocal('https://github.com/me/r/blob/main/cover.png')).toBe('/_github/me/r/main/cover.png');
    expect(githubToLocal('/images/cover.png')).toBe('/images/cover.png');
    expect(githubToLocal('https://example.com/a.png')).toBe('https://example.com/a.png');
  });
  it('finds the wasm next to a wasm-bindgen module', () => {
    expect(bindgenWasm({ owner: 'a', repo: 'b', ref: 'c', path: 'pkg/app.js', suffix: '?x' }).path).toBe('pkg/app_bg.wasm');
    expect(bindgenWasm({ owner: 'a', repo: 'b', ref: 'c', path: 'a.rs' })).toBeNull();
  });
});

describe('frontmatterRefs', () => {
  it('finds GitHub files in frontmatter, but not the source / link buttons', () => {
    const md = [
      '---', 'title: X',
      'cover: https://github.com/me/r/blob/main/cover.png',
      'source: https://github.com/me/r/blob/main/README.md',
      'demo:', '  type: wasi', '  wasm: "https://github.com/me/r/blob/v2/out/app.wasm"  # built by CI',
      '---', 'https://github.com/me/r/blob/main/body.rs',
    ].join('\n');
    expect(frontmatterRefs(md).map((r) => `${r.key}:${r.file.path}`)).toEqual(['cover:cover.png', 'wasm:out/app.wasm']);
  });
  it('returns nothing without frontmatter', () => {
    expect(frontmatterRefs('https://github.com/me/r/blob/main/body.rs')).toEqual([]);
  });
});

describe('createGithubFiles', () => {
  const file = parseGithubUrl('https://github.com/me/secret/blob/main/src/a.rs');

  it('uses the GitHub API with the token, so private repositories work', async () => {
    const fetch = vi.fn(async () => res(200, 'fn a() {}'));
    const dir = tmp();
    const files = createGithubFiles({ dir, token: 'tok', fetch });
    expect(await files.get(file)).toBe('/_github/me/secret/main/src/a.rs');
    const [url, { headers }] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/me/secret/contents/src/a.rs?ref=main');
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers.Accept).toBe('application/vnd.github.raw+json');
    expect(readFileSync(join(dir, '_github/me/secret/main/src/a.rs'), 'utf8')).toBe('fn a() {}');
  });

  it('reads public files from raw.githubusercontent.com without a token, and never sends a token there', async () => {
    const fetch = vi.fn(async () => res(200, 'x'));
    await createGithubFiles({ dir: tmp(), fetch }).get(file);
    const [url, { headers }] = fetch.mock.calls[0];
    expect(url).toBe('https://raw.githubusercontent.com/me/secret/main/src/a.rs');
    expect(headers.Authorization).toBeUndefined();
  });

  it('downloads each file once per build', async () => {
    const fetch = vi.fn(async () => res(200, 'x'));
    const files = createGithubFiles({ dir: tmp(), fetch });
    await Promise.all([files.get(file), files.get(file), files.get({ ...file })]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('explains a missing file, and suggests the token when there is none', async () => {
    const fetch = async () => res(404);
    await expect(createGithubFiles({ dir: tmp(), fetch }).get(file)).rejects.toThrow(/me\/secret is private, set GITHUB_FILES_TOKEN/);
    await expect(createGithubFiles({ dir: tmp(), token: 't', fetch }).get(file)).rejects.toThrow(/token can read me\/secret/);
  });

  it('explains a rejected token, a refusal and other failures', async () => {
    await expect(createGithubFiles({ dir: tmp(), token: 't', fetch: async () => res(401) }).get(file)).rejects.toThrow(/rejected GITHUB_FILES_TOKEN/);
    await expect(createGithubFiles({ dir: tmp(), token: 't', fetch: async () => res(403) }).get(file)).rejects.toThrow(/HTTP 403/);
    await expect(createGithubFiles({ dir: tmp(), fetch: async () => res(500) }).get(file)).rejects.toThrow(/HTTP 500/);
    await expect(createGithubFiles({ dir: tmp(), fetch: async () => { throw new Error('offline'); } }).get(file)).rejects.toThrow(/offline/);
  });

  // Regression: with no network (a blocked proxy) fetch never settled and the build hung forever.
  it('gives up on a download that never answers instead of hanging the build', async () => {
    const fetch = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    await expect(createGithubFiles({ dir: tmp(), fetch, timeout: 50 }).get(file)).rejects.toThrow(/no answer from GitHub within 0.05 s/);
  });

  it('returns null for an optional file that does not exist', async () => {
    expect(await createGithubFiles({ dir: tmp(), fetch: async () => res(404) }).get(file, { optional: true })).toBeNull();
  });

  it('treats a .js file as a canvas app only when its _bg.wasm exists', async () => {
    const files = createGithubFiles({ dir: tmp(), mockDir: MOCK });
    const app = parseGithubUrl('https://github.com/octo-dev/secret-lab/blob/v1/pkg/orbit.js');
    const plain = parseGithubUrl('https://github.com/octo-dev/secret-lab/blob/v1/src/helper.js');
    expect(await files.getApp(app)).toBe('/wasm/_github/octo-dev/secret-lab/v1/pkg/orbit.js');
    expect(existsSync(join(files.dir, 'wasm/_github/octo-dev/secret-lab/v1/pkg/orbit_bg.wasm'))).toBe(true);
    expect(await files.getApp(plain)).toBeNull();
  });
});

describe('serveGithubFiles (dev server)', () => {
  let dir;
  beforeEach(() => {
    dir = tmp();
    mkdirSync(join(dir, '_github/me/r/main'), { recursive: true });
    writeFileSync(join(dir, '_github/me/r/main/a.wasm'), 'w');
  });
  const call = (url) => new Promise((done) => {
    const out = new PassThrough();
    const chunks = [];
    out.setHeader = (k, v) => { out.type = v; };
    out.on('data', (c) => chunks.push(c));
    out.on('end', () => done({ served: true, type: out.type, body: Buffer.concat(chunks).toString() }));
    serveGithubFiles(dir, '/Portfolio/')({ url }, out, () => done({ served: false }));
  });

  it('serves downloaded files under the base path with the right type', async () => {
    expect(await call('/Portfolio/_github/me/r/main/a.wasm?x=1')).toEqual({ served: true, type: 'application/wasm', body: 'w' });
  });
  it('passes on everything else, and never leaves the folder', async () => {
    expect((await call('/Portfolio/blog/')).served).toBe(false);
    expect((await call('/Portfolio/_github/me/r/main/missing.rs')).served).toBe(false);
    expect((await call('/Portfolio/_github/%2E%2E/%2E%2E/package.json')).served).toBe(false);
  });
  it('knows common file types', () => {
    expect(contentType('a.js')).toBe('text/javascript');
    expect(contentType('a.rs')).toBe('text/plain; charset=utf-8');
  });
});

describe('remarkGithubFiles in the markdown pipeline', () => {
  const render = async (md, files = createGithubFiles({ dir: tmp(), mockDir: MOCK })) => String(await unified()
    .use(remarkParse)
    .use(remarkGithubFiles, { files })
    .use(remarkCode, { publicDirs: [files.dir] })
    .use(remarkEmbeds, { publicDirs: [files.dir] })
    .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw)
    .use(rehypeDownloadLinks, { publicDirs: [files.dir] })
    .use(rehypeStringify)
    .process(md));
  const repo = 'https://github.com/octo-dev/secret-lab/blob/v1';

  it('shows code from another repository, with a line range', async () => {
    const html = await render(`${repo}/src/main.rs#L4-L5`);
    expect(html).toContain('data-language="rust"');
    expect(html).toContain('main.rs (lines 4–5)');
    expect(html).toContain('href="/_github/octo-dev/secret-lab/v1/src/main.rs"');
    expect(html).toContain('HashMap');
    expect(html).not.toContain('tiny line-based calculator');
  });

  it('works for raw links, autolinks and titled links', async () => {
    expect(await render('https://raw.githubusercontent.com/octo-dev/secret-lab/v1/notes.txt')).toContain('Private notes');
    expect(await render(`<${repo}/notes.txt>`)).toContain('Private notes');
    expect(await render(`[The paper](${repo}/docs/paper.pdf)`)).toMatch(/embed-pdf[\s\S]*href="\/_github\/octo-dev\/secret-lab\/v1\/docs\/paper.pdf"[^>]*>The paper/);
  });

  it('turns files into tables, models and canvas apps like local ones', async () => {
    expect(await render(`${repo}/data/results.csv`)).toContain('table-block');
    expect(await render(`${repo}/assets/gem.glb`)).toContain('<model-viewer src="/_github/octo-dev/secret-lab/v1/assets/gem.glb"');
    const app = await render(`${repo}/pkg/orbit.js?height=300`);
    expect(app).toContain('data-module="/wasm/_github/octo-dev/secret-lab/v1/pkg/orbit.js"');
    expect(app).toContain('--canvas-height:300px');
  });

  it('shows a .js file without a _bg.wasm as code', async () => {
    const html = await render(`${repo}/src/helper.js`);
    expect(html).toContain('data-language="javascript"');
    expect(html).not.toContain('embed-canvas');
  });

  it('downloads images and download links', async () => {
    const html = await render(`![D](${repo}/assets/diagram.svg) and [zip](${repo}/release.zip) and [csv](${repo}/data/results.csv "download")`);
    expect(html).toContain('<img src="/_github/octo-dev/secret-lab/v1/assets/diagram.svg" alt="D">');
    expect(html).toMatch(/href="\/_github\/octo-dev\/secret-lab\/v1\/release.zip" download="release.zip"/);
    expect(html).toMatch(/href="\/_github\/octo-dev\/secret-lab\/v1\/data\/results.csv" download="results.csv"/);
  });

  it('leaves links in sentences, and files that would not show anything, as links to GitHub', async () => {
    const fetch = vi.fn();
    const files = createGithubFiles({ dir: tmp(), fetch });
    const html = await render(`See [the lexer](${repo}/src/main.rs).\n\n${repo}/LICENSE\n\n${repo}/assets/photo.png`, files);
    expect(html).toContain(`href="${repo}/src/main.rs"`);
    expect(html).toContain(`${repo}/LICENSE`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails the build with the post and the reason when a file cannot be downloaded', async () => {
    const files = createGithubFiles({ dir: tmp(), mockDir: MOCK });
    const run = unified().use(remarkParse).use(remarkGithubFiles, { files }).use(remarkRehype).use(rehypeStringify);
    await expect(run.process({ path: 'blog/post.md', value: `${repo}/src/gone.rs` })).rejects.toThrow(/File not found: .*src\/gone\.rs.*GITHUB_FILES_TOKEN.*\(in blog\/post\.md\)/);
  });
});

describe('prefetchFrontmatter', () => {
  it('downloads frontmatter files and the wasm next to a bindgen module', async () => {
    const content = tmp();
    mkdirSync(join(content, 'projects'));
    writeFileSync(join(content, 'projects/p.md'), '---\ncover: https://github.com/octo-dev/secret-lab/blob/v1/assets/cover.svg\ndemo:\n  type: bindgen\n  module: https://github.com/octo-dev/secret-lab/blob/v1/pkg/orbit.js\n---\n');
    const files = createGithubFiles({ dir: tmp(), mockDir: MOCK });
    await prefetchFrontmatter(files, content);
    for (const p of ['assets/cover.svg', 'pkg/orbit.js', 'pkg/orbit_bg.wasm']) expect(existsSync(join(files.dir, '_github/octo-dev/secret-lab/v1', p)), p).toBe(true);
  });
  it('names the post and the field when a file is missing', async () => {
    const content = tmp();
    writeFileSync(join(content, 'x.md'), '---\ncover: https://github.com/octo-dev/secret-lab/blob/v1/nope.png\n---\n');
    await expect(prefetchFrontmatter(createGithubFiles({ dir: tmp(), mockDir: MOCK }), content)).rejects.toThrow(/nope\.png.*\(cover in .*x\.md\)/);
  });
});
