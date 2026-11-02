import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTargets, resolveRef, findReferences } from '../../src/lib/references.js';
import { normalizeTagConfig } from '../../src/lib/tags.js';

function content(files) {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const config = normalizeTagConfig({
  pages: [{ path: 'projects', tags: ['project'] }, { path: 'blog', tags: ['blog'] }],
});

describe('references', () => {
  const dir = content({
    'posts/hello.md': '---\ntitle: Hello\ntags: [blog]\n---\nSee [[interp]] and [[nope]].',
    'posts/interp.md': '---\ntitle: Interpreter\ntags: [project, Rust]\n---\n',
    'posts/loose.md': '---\ntitle: Loose\ntags: [Tools]\n---\n',
    'posts/untagged.md': '---\ntitle: Untagged\n---\n',
    'posts/_draft.md': '---\ntitle: Draft\n---\n',
    'posts/about.md': '---\ntitle: About post\n---\n',
    'pages/about.md': '---\ntitle: About\n---\n',
  });
  const targets = buildTargets(dir, config);

  it('indexes every post and page, skipping _ files', () => {
    expect([...targets.keys()].sort()).toEqual(['pages/about', 'posts/about', 'posts/hello', 'posts/interp', 'posts/loose', 'posts/untagged']);
    expect(targets.get('pages/about').url).toBe('/about/');
  });
  it('gives each post the address of the first page its tags put it on', () => {
    expect(targets.get('posts/interp')).toEqual({ collection: 'posts', slug: 'interp', title: 'Interpreter', url: '/projects/interp/' });
    expect(targets.get('posts/hello').url).toBe('/blog/hello/');
    expect(targets.get('posts/loose').url).toBe('/posts/loose/');
    // Regression guard: a post without a tags line must not crash the index.
    expect(targets.get('posts/untagged').url).toBe('/posts/untagged/');
  });
  it('resolves bare and prefixed references, case-insensitively', () => {
    expect(resolveRef('interp', targets).title).toBe('Interpreter');
    expect(resolveRef(' Posts/Interp ', targets).title).toBe('Interpreter');
    expect(resolveRef('pages/about', targets).title).toBe('About');
  });
  it('still understands the old [[projects/x]] and [[blog/x]] forms', () => {
    expect(resolveRef('projects/interp', targets).title).toBe('Interpreter');
    expect(resolveRef('blog/hello', targets).title).toBe('Hello');
    expect(resolveRef('blog/loose', targets).url).toBe('/posts/loose/');
  });
  it('rejects ambiguous and unknown references with a helpful message', () => {
    expect(() => resolveRef('about', targets)).toThrow('[[posts/about]] or [[pages/about]]');
    expect(() => resolveRef('nope', targets)).toThrow(/does not match/);
    expect(() => resolveRef('blog/nope', targets)).toThrow(/does not match/);
  });
  it('finds the references in a body (for "Referenced by")', () => {
    expect(findReferences('[[interp]] [[projects/interp|again]] [[posts/hello]] [[nope]]', targets)).toEqual(['posts/interp', 'posts/hello']);
  });
});
