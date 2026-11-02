import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { collectLinks, classify, fileFor, pagePath, judgeStatus, videoLookup, checkExternal, checkSite } from '../../src/lib/link-check.js';

const fixtures = join(process.cwd(), 'tests/fixtures/public');

function makeDist(files) {
  const dist = mkdtempSync(join(tmpdir(), 'links-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, path)), { recursive: true });
    if (content && content.copy) copyFileSync(content.copy, join(dist, path));
    else writeFileSync(join(dist, path), content);
  }
  return dist;
}

describe('finding links', () => {
  it('collects links, images, srcsets, models, PDFs, apps and videos, but not share buttons or <noscript> players', () => {
    const links = collectLinks(`
      <a href="/P/blog/">Blog</a>
      <div data-share><a href="https://www.linkedin.com/sharing/share-offsite/?url=x">LinkedIn</a></div>
      <picture><source srcset="/P/_img/a-480.avif 480w, /P/_img/a-800.avif 800w"><img src="/P/images/a.png" alt="A"></picture>
      <model-viewer src="/P/_opt/models/m.glb"></model-viewer>
      <figure data-pdf><figcaption><a href="/P/files/n.pdf">n.pdf</a></figcaption></figure>
      <figure data-canvas data-module="/P/wasm/app/app.js"></figure>
      <figure data-video-embed data-src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"><noscript><iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"></iframe></noscript></figure>
      <link rel="preconnect" href="https://fonts.example"><link rel="icon" href="/P/favicon.svg">
      <meta property="og:image" content="https://site.example/P/og/site.png">`);
    const byKind = (k) => links.filter((l) => l.kind === k).map((l) => l.url);
    expect(byKind('link')).toEqual(['/P/blog/', '/P/files/n.pdf']);
    expect(byKind('image')).toEqual(['/P/images/a.png', '/P/_img/a-480.avif', '/P/_img/a-800.avif', '/P/favicon.svg', 'https://site.example/P/og/site.png']);
    expect(byKind('model')).toEqual(['/P/_opt/models/m.glb']);
    expect(byKind('pdf')).toEqual(['/P/files/n.pdf']);
    expect(byKind('wasm')).toEqual(['/P/wasm/app/app.js']);
    expect(byKind('video')).toEqual(['https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ']);
    expect(links.some((l) => /linkedin|fonts\.example/.test(l.url))).toBe(false);
    expect(links.filter((l) => l.tag === 'iframe')).toEqual([]);
  });

  it('sorts URLs into internal, external and skipped, treating the site\'s own address as internal', () => {
    const opts = { page: '/P/blog/post/', base: '/P/', site: 'https://site.example' };
    expect(classify('../other/#intro', opts)).toEqual({ type: 'internal', path: '/P/blog/other/', hash: 'intro' });
    expect(classify('#top', opts)).toEqual({ type: 'internal', path: '/P/blog/post/', hash: 'top' });
    expect(classify('https://site.example/P/og/a.png', opts)).toEqual({ type: 'internal', path: '/P/og/a.png', hash: '' });
    expect(classify('https://example.com/a#b', opts)).toEqual({ type: 'external', href: 'https://example.com/a' });
    for (const u of ['mailto:a@b.c', 'tel:123', 'javascript:void(0)', 'data:image/png;base64,AA', '#']) expect(classify(u, opts).type).toBe('skip');
  });

  it('finds the file for a path the way GitHub Pages serves it', () => {
    const dist = makeDist({ 'index.html': '', 'blog/x/index.html': '', 'about.html': '', 'f/a b.txt': '' });
    expect(fileFor(dist, '/P/', '/P/')).toBe(join(dist, 'index.html'));
    expect(fileFor(dist, '/P/blog/x/', '/P/')).toBe(join(dist, 'blog/x/index.html'));
    expect(fileFor(dist, '/P/blog/x', '/P/')).toBe(join(dist, 'blog/x/index.html'));
    expect(fileFor(dist, '/P/about', '/P/')).toBe(join(dist, 'about.html'));
    expect(fileFor(dist, '/P/f/a%20b.txt', '/P/')).toBe(join(dist, 'f/a b.txt'));
    expect(fileFor(dist, '/P/missing/', '/P/')).toBeNull();
    expect(fileFor(dist, '/blog/x/', '/P/')).toBeNull(); // forgot the base path
    expect(fileFor(dist, '/P/../etc/passwd', '/P/')).toBeNull();
    expect(pagePath(dist, join(dist, 'blog/x/index.html'), '/P/')).toBe('/P/blog/x/');
    expect(pagePath(dist, join(dist, '404.html'), '/P/')).toBe('/P/404.html');
  });
});

describe('checking the built site', () => {
  it('reports missing pages, missing #fragments, links without the base path, and broken images, models and PDFs', async () => {
    const dist = makeDist({
      'index.html': `<h2 id="intro">Intro</h2>
        <a href="/P/blog/ok/">fine</a> <a href="/P/blog/ok/#section">fine fragment</a> <a href="#intro">same page</a>
        <a href="/P/blog/gone/">Gone post</a> <a href="/P/blog/ok/#nope">bad fragment</a> <a href="/blog/ok/">no base</a>
        <img src="/P/images/ok.png" alt="ok"> <img src="/P/images/fake.png" alt="Fake"> <img src="/P/images/missing.png" alt="Missing">
        <img src="/P/images/ok.svg" alt=""> <img src="/P/images/notsvg.svg" alt="">
        <model-viewer src="/P/models/ok.glb"></model-viewer><model-viewer src="/P/models/fake.glb"></model-viewer>
        <figure data-pdf><figcaption><a href="/P/files/ok.pdf">ok.pdf</a></figcaption></figure>
        <figure data-pdf><figcaption><a href="/P/files/fake.pdf">fake.pdf</a></figcaption></figure>
        <figure data-canvas data-module="/P/wasm/none/none.js"></figure>
        <a href="mailto:me@example.com">mail</a> <a href="https://example.com/">other site</a>`,
      'blog/ok/index.html': '<h2 id="section">S</h2>',
      'images/ok.png': { copy: join(fixtures, 'images/sphere-lit.png') },
      'images/fake.png': 'this is not a png',
      'images/ok.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
      'images/notsvg.svg': '<html>oops</html>',
      'models/ok.glb': { copy: join(fixtures, 'models/crystal.glb') },
      'models/fake.glb': '<!doctype html>',
      'files/ok.pdf': { copy: join(fixtures, 'files/lecture-notes.pdf') },
      'files/fake.pdf': 'not a pdf',
    });
    const { errors, warnings, stats } = await checkSite({ dist, base: '/P/' });
    expect(warnings).toEqual([]);
    expect(stats.pages).toBe(2);
    const has = (re) => expect(errors.some((e) => re.test(e)), `${re}\n${errors.join('\n')}`).toBe(true);
    has(/^\/P\/: link \/P\/blog\/gone\/ \("Gone post"\) is missing from the site$/);
    has(/\/P\/blog\/ok\/#nope.*there is no #nope on \/P\/blog\/ok\//);
    has(/link \/blog\/ok\/ .*outside the site \(paths must start with \/P\/\)/);
    has(/image \/P\/images\/fake\.png \("Fake"\) can't be opened as an image/);
    has(/image \/P\/images\/missing\.png \("Missing"\) is missing from the site/);
    has(/image \/P\/images\/notsvg\.svg is not an SVG image/);
    has(/model \/P\/models\/fake\.glb is not a glTF model/);
    has(/pdf \/P\/files\/fake\.pdf .*is not a PDF/);
    has(/wasm \/P\/wasm\/none\/none\.js is missing from the site/);
    expect(errors).toHaveLength(9);
  });

  it('passes a site with nothing broken', async () => {
    const dist = makeDist({ 'index.html': '<a href="/P/a/">a</a><a href="https://example.com">x</a>', 'a/index.html': '<a href="/P/">home</a>' });
    expect(await checkSite({ dist, base: '/P/' })).toEqual({ errors: [], warnings: [], stats: { pages: 2, internal: 2, external: 0 } });
  });
});

describe('external links', () => {
  let server;
  let origin;
  const hits = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      const status = {
        '/ok': 200, '/gone': 404, '/removed': 410, '/forbidden': 403, '/busy': 429, '/broken': 500, '/linkedin': 999,
        '/head-404': req.method === 'HEAD' ? 404 : 200, '/no-head': req.method === 'HEAD' ? 405 : 200,
      }[req.url.split('?')[0]];
      if (req.url === '/redirect') { res.writeHead(301, { location: '/ok' }); res.end(); return; }
      if (req.url === '/slow') { setTimeout(() => { res.writeHead(200); res.end(); }, 500); return; }
      res.writeHead(status ?? 404);
      res.end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => server.close());

  it('only calls a link dead when it certainly is', () => {
    expect(judgeStatus(200)).toBe('ok');
    expect(judgeStatus(301)).toBe('ok');
    expect(judgeStatus(404)).toBe('dead');
    expect(judgeStatus(410)).toBe('dead');
    for (const s of [403, 429, 500, 503, 999]) expect(judgeStatus(s)).toBe('unsure');
  });

  it('requests links with HEAD, falls back to GET, follows redirects and retries busy servers', async () => {
    const check = (p) => checkExternal(origin + p, { timeout: 300, retries: 1 });
    expect((await check('/ok')).verdict).toBe('ok');
    expect((await check('/redirect')).verdict).toBe('ok');
    expect((await check('/no-head')).verdict).toBe('ok');
    expect((await check('/head-404')).verdict).toBe('ok'); // a server that only breaks HEAD isn't dead
    expect(await check('/gone')).toMatchObject({ verdict: 'dead', reason: 'HTTP 404' });
    expect((await check('/removed')).verdict).toBe('dead');
    expect((await check('/forbidden')).verdict).toBe('unsure');
    expect((await check('/linkedin')).verdict).toBe('unsure');
    expect(await check('/slow')).toMatchObject({ verdict: 'unsure', reason: 'timed out' });
    hits.length = 0;
    expect((await check('/busy')).verdict).toBe('unsure');
    expect(hits.filter((h) => h.endsWith('/busy'))).toHaveLength(4); // HEAD + GET, twice
  });

  it('a host that doesn\'t exist is dead', async () => {
    const r = await checkExternal('http://no-such-host.invalid/', { timeout: 3000, retries: 0 });
    expect(r.verdict).toBe('dead');
  });

  it('looks YouTube and Vimeo videos up through their oEmbed endpoints', () => {
    expect(videoLookup('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=90')).toEqual({ service: 'YouTube', url: 'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Daqz-KE-bpKQ' });
    expect(videoLookup('https://player.vimeo.com/video/76979871').url).toBe('https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F76979871');
    expect(videoLookup('https://example.com/video')).toBeNull();
  });

  it('reports dead external links as errors and doubtful ones as warnings, once per URL with the pages it is on', async () => {
    const page = (links) => links.map((l) => `<a href="${origin}${l}">x</a>`).join('');
    const dist = makeDist({
      'index.html': page(['/ok', '/gone', '/forbidden', '/skipped']),
      'a/index.html': page(['/gone', '/ok#with-hash']),
    });
    const { errors, warnings, stats } = await checkSite({ dist, base: '/P/', external: true, skip: ['/skipped$'], timeout: 1000 });
    expect(stats.external).toBe(3);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\/gone: HTTP 404 \(on \/P\/(a\/)?, \/P\/(a\/)?\)$/);
    expect(warnings).toEqual([expect.stringMatching(/\/forbidden: HTTP 403/)]);
  });

  it('a video that no longer exists is an error', async () => {
    const dist = makeDist({ 'index.html': '<figure data-video-embed data-src="https://www.youtube-nocookie.com/embed/xxxxxxxxxxx"></figure>' });
    const fakeFetch = async (url) => ({ status: url.startsWith('https://www.youtube.com/oembed') ? 404 : 200, body: null });
    const { errors } = await checkSite({ dist, base: '/P/', external: true, fetch: fakeFetch });
    expect(errors).toEqual([expect.stringMatching(/embed\/xxxxxxxxxxx: the YouTube video doesn't exist \(or is private\)/)]);
  });

  it('is off unless asked for', async () => {
    const dist = makeDist({ 'index.html': `<a href="${origin}/gone">x</a>` });
    hits.length = 0;
    expect((await checkSite({ dist, base: '/P/' })).errors).toEqual([]);
    expect(hits).toEqual([]);
  });
});
