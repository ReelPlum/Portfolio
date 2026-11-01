import { describe, it, expect } from 'vitest';
import { embedFor, embedHtml, parseStart, youtubeId } from '../../src/lib/embeds.js';

describe('embedFor: YouTube', () => {
  const id = 'aqz-KE-bpKQ';
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=abc`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ])('recognises %s', (url) => {
    expect(embedFor(url)).toEqual({ provider: 'youtube', id, src: `https://www.youtube-nocookie.com/embed/${id}` });
  });

  it('keeps the start time', () => {
    expect(embedFor(`https://youtu.be/${id}?t=90`).src).toBe(`https://www.youtube-nocookie.com/embed/${id}?start=90`);
    expect(embedFor(`https://www.youtube.com/watch?v=${id}&t=1m30s`).src).toContain('start=90');
  });

  it('rejects links that are not videos', () => {
    expect(embedFor('https://www.youtube.com/@channel')).toBeNull();
    expect(embedFor('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(embedFor('https://www.youtube.com/watch')).toBeNull();
  });
});

describe('embedFor: Vimeo', () => {
  it.each([
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://player.vimeo.com/video/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://vimeo.com/channels/staffpicks/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://vimeo.com/76979871/abc123def', 'https://player.vimeo.com/video/76979871?h=abc123def'],
  ])('%s', (url, src) => {
    expect(embedFor(url)).toMatchObject({ provider: 'vimeo', src });
  });
  it('rejects profile links', () => {
    expect(embedFor('https://vimeo.com/someone')).toBeNull();
  });
});

describe('embedFor: other', () => {
  it('turns video files into <video>', () => {
    expect(embedFor('https://example.com/clip.mp4')).toEqual({ provider: 'video', src: 'https://example.com/clip.mp4' });
  });
  it('ignores ordinary links, junk and non-http schemes', () => {
    expect(embedFor('https://example.com/')).toBeNull();
    expect(embedFor('not a url')).toBeNull();
    expect(embedFor('javascript:alert(1)//youtube.com/watch?v=aqz-KE-bpKQ')).toBeNull();
    expect(embedFor('')).toBeNull();
  });
  // Regression: lookalike hosts must not be treated as YouTube.
  it('does not trust lookalike hostnames', () => {
    expect(embedFor('https://notyoutube.com/watch?v=aqz-KE-bpKQ')).toBeNull();
    expect(embedFor('https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ')).toBeNull();
  });
});

describe('embedFor: PDFs', () => {
  it('embeds site-relative and absolute PDFs', () => {
    expect(embedFor('/files/notes.pdf')).toEqual({ provider: 'pdf', src: '/files/notes.pdf' });
    expect(embedFor('https://x.test/a.PDF')).toEqual({ provider: 'pdf', src: 'https://x.test/a.PDF' });
  });
  it('keeps site-relative video paths relative', () => {
    expect(embedFor('/media/clip.mp4')).toEqual({ provider: 'video', src: '/media/clip.mp4' });
  });
  it('ignores other site-relative paths and protocol-relative URLs', () => {
    expect(embedFor('/about/')).toBeNull();
    expect(embedFor('//evil.test/a.pdf')).toBeNull();
  });
  it('renders a figure with a fallback link', () => {
    const html = embedHtml(embedFor('/files/Lecture%204.pdf'));
    expect(html).toContain('data-pdf');
    expect(html).toContain('<a href="/files/Lecture%204.pdf" target="_blank" rel="noopener">Lecture 4.pdf</a>');
  });
});

describe('helpers', () => {
  it('parseStart', () => {
    expect(parseStart('90')).toBe(90);
    expect(parseStart('1h2m3s')).toBe(3723);
    expect(parseStart('2m')).toBe(120);
    expect(parseStart('nonsense')).toBe(0);
    expect(parseStart(null)).toBe(0);
  });
  it('youtubeId', () => {
    expect(youtubeId(new URL('https://youtu.be/aqz-KE-bpKQ/extra'))).toBe('aqz-KE-bpKQ');
  });
  it('embedHtml escapes the title and src', () => {
    const html = embedHtml(embedFor('https://youtu.be/aqz-KE-bpKQ'), '"><script>x</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toContain('allowfullscreen');
    expect(embedHtml(null)).toBe('');
  });
  it('embedHtml renders video files with controls', () => {
    expect(embedHtml(embedFor('https://example.com/a.webm'))).toMatch(/<video src="https:\/\/example.com\/a.webm" controls/);
  });
});

describe('embedFor: 3D models and canvas apps', () => {
  it('a .glb or .gltf path becomes a model viewer', () => {
    expect(embedFor('/models/crystal.glb')).toEqual({ provider: 'model', src: '/models/crystal.glb' });
    expect(embedFor('https://example.com/a/scene.gltf')).toEqual({ provider: 'model', src: 'https://example.com/a/scene.gltf' });
    const html = embedHtml(embedFor('/models/crystal.glb'));
    expect(html).toContain('<model-viewer src="/models/crystal.glb"');
    expect(html).toContain('camera-controls');
    expect(html).toContain('alt="3D model: crystal.glb"');
    expect(html).toContain('download');
  });
  it('a wasm-bindgen module under /wasm/ becomes a canvas app, with options', () => {
    expect(embedFor('/wasm/renderer/renderer.js')).toEqual({ provider: 'canvas', src: '/wasm/renderer/renderer.js', entry: 'start', height: 480 });
    expect(embedFor('/wasm/renderer/renderer.js?entry=run&height=300')).toMatchObject({ entry: 'run', height: 300 });
    expect(embedFor('/wasm/renderer/renderer.js?height=99999').height).toBe(1600);
    expect(embedFor('https://example.com/wasm/x/x.js')).toBeNull(); // only this site's own builds
    expect(embedFor('/code/x.js')).toBeNull();
  });
  it('shows a placeholder until the build exists', () => {
    const e = embedFor('/wasm/renderer/renderer.js');
    expect(embedHtml(e, '', { missing: true })).toContain('renderer is coming soon');
    expect(embedHtml(e, '', { missing: true })).not.toContain('data-canvas');
    expect(embedHtml(e)).toContain('data-module="/wasm/renderer/renderer.js" data-entry="start"');
  });
});

describe('download links', async () => {
  const { formatSize, rehypeDownloadLinks } = await import('../../src/lib/rehype-download-links.js');
  const link = (href, title) => ({ type: 'root', children: [{ type: 'element', tagName: 'a', properties: { href, ...(title ? { title } : {}) }, children: [{ type: 'text', value: 'x' }] }] });
  const run = (tree) => rehypeDownloadLinks({ publicDirs: ['tests/fixtures/public'], base: '/Portfolio/' })(tree, { path: 'post.md' });
  it('formats file sizes', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatSize(300 * 1024 * 1024)).toBe('300 MB');
  });
  it('archives download automatically, with an icon and the size', () => {
    const t = link('/Portfolio/files/tiny-calc.zip');
    run(t);
    const a = t.children[0];
    expect(a.properties.download).toBe('tiny-calc.zip');
    expect(a.properties.className).toContain('download-link');
    expect(a.children[0].value).toContain('data-icon="download"');
    expect(a.children.at(-1).children[0].value).toMatch(/^\d+(\.\d)? (B|KB)$/);
  });
  it('any file downloads when the link title is "download"; other links are untouched', () => {
    const t = link('/Portfolio/files/scores.csv', 'download');
    run(t);
    expect(t.children[0].properties.download).toBe('scores.csv');
    expect(t.children[0].properties.title).toBeUndefined();
    const plain = link('/Portfolio/files/scores.csv');
    run(plain);
    expect(plain.children[0].properties.download).toBeUndefined();
  });
  it('a missing download fails the build', () => {
    expect(() => run(link('/Portfolio/files/nope.zip', 'download'))).toThrow('Download not found: /files/nope.zip. Put the file in public/files/nope.zip (in post.md)');
  });
});
