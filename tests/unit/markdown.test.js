import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { remarkEmbeds } from '../../src/lib/remark-embeds.js';
import { rehypeBaseUrls } from '../../src/lib/rehype-base-urls.js';
import { remarkReferences } from '../../src/lib/remark-references.js';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const targets = new Map([
  ['posts/hello', { collection: 'posts', slug: 'hello', title: 'Hello post', url: '/blog/hello/' }],
  ['posts/interp', { collection: 'posts', slug: 'interp', title: 'My Interpreter', url: '/projects/interp/' }],
]);

const render = async (md, base = '/') => String(await unified()
  .use(remarkParse).use(remarkMath).use(remarkEmbeds, { base }).use(remarkReferences, { targets, base })
  .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeKatex)
  .use(rehypeBaseUrls, { base }).use(rehypeStringify).process(md));

describe('remarkEmbeds', () => {
  it('turns a bare YouTube URL on its own line into a player that loads on play', async () => {
    const html = await render('Intro\n\nhttps://www.youtube.com/watch?v=aqz-KE-bpKQ\n\nOutro');
    expect(html).toContain('data-src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"');
    expect(html).toContain('class="embed-facade" aria-label="Play YouTube video (loads YouTube)"');
    // The player itself is only there for readers without JavaScript.
    expect(html).toMatch(/<noscript><iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ"/);
    expect(html.replace(/<noscript>.*?<\/noscript>/s, '')).not.toContain('<iframe');
    expect(html).toContain('<p>Intro</p>');
  });
  it('handles autolinks and titled links', async () => {
    expect(await render('<https://vimeo.com/76979871>')).toContain('player.vimeo.com/video/76979871');
    const html = await render('[My talk](https://youtu.be/aqz-KE-bpKQ)');
    expect(html).toContain('data-title="My talk"');
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

describe('PDF embeds', () => {
  it('turns a site-relative PDF path on its own line into a viewer', async () => {
    const html = await render('/files/notes.pdf');
    expect(html).toContain('<figure class="embed embed-pdf" data-pdf');
  });
  // Regression: embeds are raw HTML, so the base path must be added when the embed is created.
  it('adds the base path to embedded PDFs', async () => {
    expect(await render('/files/notes.pdf', '/Portfolio/')).toContain('href="/Portfolio/files/notes.pdf"');
  });
});

describe('LaTeX', () => {
  it('renders inline and display maths with KaTeX', async () => {
    const html = await render('Inline $a^2 + b^2 = c^2$.\n\n$$\n\\frac{1}{2}\n$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain('$a^2');
  });
});

describe('references', () => {
  it('links [[slug]] to the post or project by its title', async () => {
    const html = await render('See [[interp]] and [[blog/hello|this post]].', '/Portfolio/');
    expect(html).toContain('<a href="/Portfolio/projects/interp/" class="ref-link" data-ref="posts/interp">My Interpreter</a>');
    expect(html).toContain('<a href="/Portfolio/blog/hello/" class="ref-link" data-ref="posts/hello">this post</a>');
  });
  it('fails the build for references that point nowhere', async () => {
    await expect(render('See [[nope]].')).rejects.toThrow(/does not match any post/);
  });
  it('leaves references inside code alone', async () => {
    expect(await render('`[[interp]]`')).toContain('<code>[[interp]]</code>');
  });
});
