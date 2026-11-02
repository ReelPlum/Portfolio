import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { imageInfo, variantWidths, svgSize, PROSE_SIZES, CACHE } from '../../src/lib/images.js';
import { rehypeImages } from '../../src/lib/rehype-images.js';
import { optimizeModel, optimizeSvg, minifyJson, isDownload, referencedAssets, optimizeAssets } from '../../src/lib/optimize-assets.js';
import { compareHtml } from '../../src/lib/compare.js';
import { embedHtml, embedFor, playerIframe } from '../../src/lib/embeds.js';
import { playerHtml } from '../../src/lib/lazy-client.js';

const fixturePublic = join(process.cwd(), 'tests/fixtures/public');
const publicDirs = [fixturePublic];

describe('responsive images', () => {
  it('makes the standard widths below an image, plus its own width (at most 2400)', () => {
    expect(variantWidths(960)).toEqual([480, 800, 960]);
    expect(variantWidths(300)).toEqual([300]);
    // Regression: images wider than 2400px listed 2400 twice.
    expect(variantWidths(4000)).toEqual([480, 800, 1200, 1600, 2400]);
  });

  it('reads the size of an SVG from width/height or the viewBox', () => {
    expect(svgSize('<svg width="120" height="60">')).toEqual({ width: 120, height: 60 });
    expect(svgSize('<svg viewBox="0 0 400 300">')).toEqual({ width: 400, height: 300 });
    expect(svgSize('<svg width="200" viewBox="0 0 400 300">')).toEqual({ width: 200, height: 150 });
    expect(svgSize('<svg>')).toBeNull();
  });

  it('makes AVIF and WebP variants for raster images, and leaves the original as the fallback', async () => {
    const info = await imageInfo('/images/sphere-lit.png', { publicDirs, hrefFor: (p) => `/base${p}` });
    expect(info).toMatchObject({ width: 960, height: 540 });
    expect(info.sources.map((s) => s.type)).toEqual(['image/avif', 'image/webp']);
    const avif = info.sources[0].srcset.split(', ');
    expect(avif).toHaveLength(3);
    expect(avif[0]).toMatch(/^\/base\/_img\/[0-9a-f]{12}-480\.avif 480w$/);
    // The files exist in the cache, and are smaller than the PNG.
    const png = readFileSync(join(fixturePublic, 'images/sphere-lit.png')).length;
    for (const entry of [...avif, ...info.sources[1].srcset.split(', ')]) {
      const name = entry.split(' ')[0].split('/').pop();
      expect(readFileSync(join(CACHE, name)).length).toBeLessThan(png);
    }
  });

  it('uses each caller\'s base path, even for an image already processed', async () => {
    await imageInfo('/images/sphere-flat.png', { publicDirs });
    const info = await imageInfo('/images/sphere-flat.png', { publicDirs, hrefFor: (p) => `/other${p}` });
    expect(info.sources[0].srcset).toMatch(/^\/other\/_img\//);
  });

  it('gives SVGs a size but no variants, and ignores images from other sites', async () => {
    expect(await imageInfo('/images/sample-photo.svg', { publicDirs })).toEqual({ width: 1200, height: 600, sources: [] });
    expect(await imageInfo('https://example.com/a.png', { publicDirs })).toBeNull();
    expect(await imageInfo('/images/missing.png', { publicDirs })).toBeNull();
  });

  const img = (src) => ({ type: 'element', tagName: 'img', properties: { src, alt: '' }, children: [] });
  const run = async (tree, variants = true) => { await rehypeImages({ publicDirs, base: '/base/', variants })(tree); return tree; };

  it('wraps raster images in <picture>, makes the first image eager and the rest lazy', async () => {
    const p = { type: 'element', tagName: 'p', properties: {}, children: [img('/base/images/sample-photo.svg'), img('/base/images/sphere-lit.png')] };
    await run({ type: 'root', children: [p] });
    const [svg, picture] = p.children;
    expect(svg.properties).toMatchObject({ loading: 'eager', fetchPriority: 'high', width: 1200, height: 600 });
    expect(picture.tagName).toBe('picture');
    const [avif, webp, fallback] = picture.children;
    expect(avif.properties).toMatchObject({ type: 'image/avif', sizes: PROSE_SIZES });
    expect(webp.properties.type).toBe('image/webp');
    expect(fallback.properties).toMatchObject({ src: '/base/images/sphere-lit.png', loading: 'lazy', decoding: 'async', width: 960, height: 540 });
  });

  it('only sizes images (no variants) outside production builds', async () => {
    const p = { type: 'element', tagName: 'p', properties: {}, children: [img('/base/images/sphere-lit.png')] };
    await run({ type: 'root', children: [p] }, false);
    expect(p.children[0].tagName).toBe('img');
    expect(p.children[0].properties.width).toBe(960);
  });

  it('before/after sliders use the variants too, keeping their classes on the <img>', async () => {
    const spec = { before: { src: '/images/sphere-flat.png', label: 'Flat' }, after: { src: '/images/sphere-lit.png', label: 'Lit' }, start: 50 };
    const images = { '/images/sphere-flat.png': await imageInfo('/images/sphere-flat.png', { publicDirs }), '/images/sphere-lit.png': await imageInfo('/images/sphere-lit.png', { publicDirs }) };
    const html = compareHtml(spec, { publicDirs, images });
    expect(html).toContain('<picture class="compare-before-picture"><source type="image/avif"');
    expect(html).toMatch(/<img class="compare-after" src="\/images\/sphere-lit\.png" alt="Lit: Flat and Lit" width="960" height="540" loading="lazy"/);
    expect(compareHtml(spec, { publicDirs })).not.toContain('<picture');
  });
});

describe('optimising other files', () => {
  it('never touches downloads under files/', () => {
    expect(isDownload('files/data.json')).toBe(true);
    expect(isDownload('files/sub/notes.svg')).toBe(true);
    expect(isDownload('images/logo.svg')).toBe(false);
    expect(isDownload('search-index.json')).toBe(false);
  });

  it('minifies JSON without changing its value', () => {
    const text = JSON.stringify({ a: [1, 2, { b: 'c d' }], e: null }, null, 2);
    expect(minifyJson(text)).toBe('{"a":[1,2,{"b":"c d"}],"e":null}');
    expect(JSON.parse(minifyJson(text))).toEqual(JSON.parse(text));
  });

  it('makes SVGs smaller but keeps the viewBox so they still scale', async () => {
    const svg = '<?xml version="1.0"?>\n<!-- a comment -->\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">\n  <g>\n    <rect x="0" y="0" width="100" height="50" fill="#ff0000"/>\n  </g>\n</svg>\n';
    const out = await optimizeSvg(svg);
    expect(out.length).toBeLessThan(svg.length);
    expect(out).toContain('viewBox="0 0 100 50"');
    expect(out).not.toContain('comment');
  });

  it('finds the variants and compressed models pages refer to', () => {
    const dir = mkdtempSync(join(tmpdir(), 'refs-'));
    const page = join(dir, 'index.html');
    writeFileSync(page, '<source srcset="/P/_img/abc-480.avif 480w, /P/_img/abc-800.avif 800w"><model-viewer src="/P/_opt/models/a%20b.glb"><img src="/P/images/x.png">');
    expect(referencedAssets([page], '/P/')).toEqual({ img: ['abc-480.avif', 'abc-800.avif'], opt: ['/models/a%20b.glb'] });
  });

  it('compresses a 3D model for viewing, and keeps the smaller file', async () => {
    const { Document, NodeIO } = await import('@gltf-transform/core');
    const doc = new Document();
    const buffer = doc.createBuffer();
    // A grid of 64×64 quads written without sharing vertices: welding and quantizing shrink it a lot.
    const n = 64;
    const pos = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]];
      for (const [x, y] of q) pos.push(x / n, Math.sin(x + y) / 10, y / n);
    }
    const accessor = doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer);
    const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', accessor));
    doc.createScene().addChild(doc.createNode().setMesh(mesh));
    const dir = mkdtempSync(join(tmpdir(), 'model-'));
    const input = join(dir, 'grid.glb');
    writeFileSync(input, await new NodeIO().writeBinary(doc));
    const before = readFileSync(input);
    const result = await optimizeModel(input, join(dir, 'out', 'grid.glb'));
    expect(result.before).toBe(before.length);
    expect(result.after).toBeLessThan(before.length / 2);
    expect(readFileSync(input)).toEqual(before); // the original (the download) is untouched
    const back = await new NodeIO().registerExtensions((await import('@gltf-transform/extensions')).ALL_EXTENSIONS).read(join(dir, 'out', 'grid.glb'));
    expect(back.getRoot().listMeshes()).toHaveLength(1);
  });

  it('a tiny model that would grow is copied as it is', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'model-'));
    const out = join(dir, 'crystal.glb');
    const result = await optimizeModel(join(fixturePublic, 'models/crystal.glb'), out);
    expect(result.after).toBeLessThanOrEqual(result.before);
    expect(readFileSync(out).length).toBe(result.after);
  });

  describe('the build step', () => {
    let out;
    beforeAll(async () => {
      out = mkdtempSync(join(tmpdir(), 'dist-'));
      const info = await imageInfo('/images/sphere-flat.png', { publicDirs, hrefFor: (p) => `/P${p}` });
      const pretty = JSON.stringify({ list: [1, 2, 3] }, null, 2);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">\n  <!-- hi -->\n  <rect width="10" height="10"/>\n</svg>\n';
      mkdirSync(join(out, 'files'), { recursive: true });
      mkdirSync(join(out, 'images'));
      mkdirSync(join(out, 'models'));
      writeFileSync(join(out, 'index.html'), `<picture><source srcset="${info.sources[0].srcset}"></picture><model-viewer src="/P/_opt/models/crystal.glb">`);
      writeFileSync(join(out, 'data.json'), pretty);
      writeFileSync(join(out, 'files', 'data.json'), pretty);
      writeFileSync(join(out, 'images', 'a.svg'), svg);
      writeFileSync(join(out, 'files', 'a.svg'), svg);
      writeFileSync(join(out, 'models', 'crystal.glb'), readFileSync(join(fixturePublic, 'models/crystal.glb')));
      const logs = [];
      const logger = { info: (m) => logs.push(m), warn: (m) => logs.push(m) };
      await optimizeAssets({ base: '/P/' }).hooks['astro:build:done']({ dir: new URL(`file://${out}/`), logger });
    });

    it('copies the variants pages use into _img/', () => {
      expect(readdirSync(join(out, '_img')).sort()).toEqual(expect.arrayContaining([expect.stringMatching(/-480\.avif$/)]));
      expect(readdirSync(join(out, '_img'))).toHaveLength(3);
    });

    it('writes the viewing copy of models to _opt/ and keeps the original', () => {
      expect(existsSync(join(out, '_opt/models/crystal.glb'))).toBe(true);
      expect(readFileSync(join(out, 'models/crystal.glb'))).toEqual(readFileSync(join(fixturePublic, 'models/crystal.glb')));
    });

    it('minifies JSON and SVG, except downloads', () => {
      expect(readFileSync(join(out, 'data.json'), 'utf8')).toBe('{"list":[1,2,3]}');
      expect(readFileSync(join(out, 'files/data.json'), 'utf8')).toContain('\n  ');
      expect(readFileSync(join(out, 'images/a.svg'), 'utf8')).not.toContain('hi');
      expect(readFileSync(join(out, 'files/a.svg'), 'utf8')).toContain('<!-- hi -->');
    });
  });
});

describe('lazy embeds', () => {
  it('YouTube and Vimeo show a play button and load nothing from those sites until it is pressed', () => {
    const html = embedHtml(embedFor('https://vimeo.com/76979871'), 'My talk');
    expect(html).toContain('data-src="https://player.vimeo.com/video/76979871"');
    expect(html).toContain('<button type="button" class="embed-facade" aria-label="Play My talk (loads Vimeo)">');
    expect(html.replace(/<noscript>.*<\/noscript>/s, '')).not.toMatch(/<iframe|vimeo\.com\/video.*src=/);
  });

  it('the player made in the browser matches the one for readers without JavaScript, plus autoplay', () => {
    const src = 'https://www.youtube-nocookie.com/embed/abc?start=90';
    const server = playerIframe(src, 'A "talk"', { autoplay: true }).replace(' loading="lazy"', '');
    expect(playerHtml(src, 'A "talk"')).toBe(server);
    expect(playerHtml(src, 'x')).toContain('?start=90&amp;autoplay=1');
  });

  it('videos and 3D models do not download until needed', () => {
    expect(embedHtml(embedFor('/files/clip.mp4'))).toContain('preload="none"');
    const model = embedHtml({ ...embedFor('/models/crystal.glb'), viewSrc: '/_opt/models/crystal.glb' });
    expect(model).toContain('<model-viewer src="/_opt/models/crystal.glb" loading="lazy" reveal="auto" alt="3D model: crystal.glb"');
    expect(model).toContain('href="/models/crystal.glb" download'); // the download is the original
  });
});
