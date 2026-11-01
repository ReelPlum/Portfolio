import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { remarkEmbeds } from '../../src/lib/remark-embeds.js';
import { rehypeBaseUrls } from '../../src/lib/rehype-base-urls.js';

const render = async (md, base = '/') => String(await unified()
  .use(remarkParse).use(remarkEmbeds).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw)
  .use(rehypeBaseUrls, { base }).use(rehypeStringify).process(md));

describe('remarkEmbeds', () => {
  it('turns a bare YouTube URL on its own line into a player', async () => {
    const html = await render('Intro\n\nhttps://www.youtube.com/watch?v=aqz-KE-bpKQ\n\nOutro');
    expect(html).toContain('<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"');
    expect(html).toContain('<p>Intro</p>');
  });
  it('handles autolinks and titled links', async () => {
    expect(await render('<https://vimeo.com/76979871>')).toContain('player.vimeo.com/video/76979871');
    const html = await render('[My talk](https://youtu.be/aqz-KE-bpKQ)');
    expect(html).toContain('title="My talk"');
  });
  it('leaves links inside sentences alone', async () => {
    const html = await render('Watch https://youtu.be/aqz-KE-bpKQ now');
    expect(html).not.toContain('<iframe');
  });
  it('leaves ordinary links alone', async () => {
    expect(await render('https://example.com')).not.toContain('<iframe');
  });
  it('keeps images as images', async () => {
    expect(await render('![Alt](/images/a.png)')).toContain('<img src="/images/a.png" alt="Alt">');
  });
});

describe('rehypeBaseUrls', () => {
  // Regression: on GitHub Pages the site lives under /Portfolio/, so "/images/a.png" in markdown broke.
  it('prefixes root-relative image and link URLs with the base', async () => {
    const html = await render('![A](/images/a.png) [About](/about/)', '/Portfolio/');
    expect(html).toContain('src="/Portfolio/images/a.png"');
    expect(html).toContain('href="/Portfolio/about/"');
  });
  it('does not double-prefix, and ignores absolute, protocol-relative and anchor links', async () => {
    const html = await render('[a](/Portfolio/x) [b](https://x.test/y) [c](//cdn.test/z) [d](#top) [e](rel/path)', '/Portfolio/');
    expect(html).toContain('href="/Portfolio/x"');
    expect(html).toContain('href="https://x.test/y"');
    expect(html).toContain('href="//cdn.test/z"');
    expect(html).toContain('href="#top"');
    expect(html).toContain('href="rel/path"');
  });
  it('does nothing when the base is /', async () => {
    expect(await render('![A](/images/a.png)', '/')).toContain('src="/images/a.png"');
  });
});
