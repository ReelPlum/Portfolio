import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTargets, resolveRef, findReferences } from '../../src/lib/references.js';

function content(files) {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

describe('references', () => {
  const dir = content({
    'blog/hello.md': '---\ntitle: Hello\n---\nSee [[shared]] and [[projects/shared]] and [[nope]].',
    'blog/shared.md': '---\ntitle: Shared post\n---\n',
    'blog/_draft.md': '---\ntitle: Draft\n---\n',
    'projects/shared.md': '---\ntitle: Shared project\n---\n',
    'projects/interp.md': '---\ntitle: Interpreter\n---\n',
    'pages/about.md': '---\ntitle: About\n---\n',
  });
  const targets = buildTargets(dir);

  it('indexes every post, project and page, skipping _ files', () => {
    expect([...targets.keys()].sort()).toEqual(['blog/hello', 'blog/shared', 'pages/about', 'projects/interp', 'projects/shared']);
    expect(targets.get('projects/interp')).toEqual({ collection: 'projects', slug: 'interp', title: 'Interpreter', url: '/projects/interp/' });
    expect(targets.get('pages/about').url).toBe('/about/');
  });
  it('resolves bare and prefixed references, case-insensitively', () => {
    expect(resolveRef('interp', targets).title).toBe('Interpreter');
    expect(resolveRef(' Projects/Interp ', targets).title).toBe('Interpreter');
    expect(resolveRef('about', targets).url).toBe('/about/');
  });
  it('rejects ambiguous and unknown references with a helpful message', () => {
    expect(() => resolveRef('shared', targets)).toThrow('[[blog/shared]] or [[projects/shared]]');
    expect(() => resolveRef('nope', targets)).toThrow(/does not match/);
  });
  it('finds the references in a body (for "Referenced by")', () => {
    expect(findReferences('[[interp]] [[projects/interp|again]] [[blog/shared]] [[nope]]', targets)).toEqual(['projects/interp', 'blog/shared']);
  });
});
