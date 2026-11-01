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
