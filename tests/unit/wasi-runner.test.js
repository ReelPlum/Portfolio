import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runWasi, runBindgen, loadModule, lineCollector } from '../../src/lib/wasi-runner.js';

// The real example program in examples/tiny-calc, compiled for wasm32-wasip1.
const bytes = readFileSync(new URL('../../tests/fixtures/public/wasm/tiny-calc/tiny-calc.wasm', import.meta.url));
const mod = await WebAssembly.compile(bytes);

describe('runWasi with a real Rust program', () => {
  it('captures stdout', async () => {
    const r = await runWasi(mod, { code: 'let x = 6\nprint x * 7\nprint "hi"', filename: 'main.calc' });
    expect(r).toMatchObject({ stdout: '42\nhi', stderr: '', exitCode: 0 });
  });
  it('captures stderr and the exit code', async () => {
    const r = await runWasi(mod, { code: 'print 1 / 0', filename: 'main.calc' });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe('line 1: division by zero');
  });
  it('streams lines as they arrive', async () => {
    const lines = [];
    await runWasi(mod, { code: 'print 1\nprint 2', onLine: (l) => lines.push(l) });
    expect(lines).toEqual([{ stream: 'out', text: '1' }, { stream: 'out', text: '2' }]);
  });
  it('does not leak state between runs', async () => {
    await runWasi(mod, { code: 'let secret = 1' });
    const r = await runWasi(mod, { code: 'print secret' });
    expect(r.stderr).toContain("unknown variable 'secret'");
  });
  it('reports a usage error when the program gets no file', async () => {
    const r = await runWasi(mod, { code: 'print 1', input: 'stdin' });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('usage');
  });
});

describe('lineCollector', () => {
  const enc = (s) => new TextEncoder().encode(s);
  it('splits lines across writes and flushes the remainder', () => {
    const out = [];
    const c = lineCollector((l) => out.push(l));
    c.write(enc('he'));
    c.write(enc('llo\nwor'));
    c.write(enc('ld\r\n'));
    c.write(enc('tail'));
    c.flush();
    expect(out).toEqual(['hello', 'world', 'tail']);
  });
  // Regression: a trailing newline must not produce an extra empty line.
  it('does not add an empty line after a final newline', () => {
    const out = [];
    const c = lineCollector((l) => out.push(l));
    c.write(enc('a\n'));
    c.flush();
    expect(out).toEqual(['a']);
  });
  it('handles multi-byte characters split across writes', () => {
    const out = [];
    const c = lineCollector((l) => out.push(l));
    const b = enc('æøå\n');
    c.write(b.slice(0, 1));
    c.write(b.slice(1));
    expect(out).toEqual(['æøå']);
  });
});

describe('loadModule', () => {
  it('caches successful loads and retries failed ones', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    await expect(loadModule('/x.wasm', fetchImpl)).rejects.toThrow('HTTP 404');
    await new Promise((r) => setTimeout(r));
    const m1 = await loadModule('/x.wasm', fetchImpl);
    const m2 = await loadModule('/x.wasm', fetchImpl);
    expect(m1).toBe(m2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('runBindgen', () => {
  it('captures console output and print(), and restores console afterwards', async () => {
    const originalLog = console.log;
    const fake = {
      default: async () => {},
      run: (code) => { console.log('got', code); globalThis.print('via print'); console.error('oops'); return 'returned'; },
    };
    const r = await runBindgen('/m.js', { code: 'x', importer: async () => fake });
    expect(r.stdout).toBe('got x\nvia print\nreturned');
    expect(r.stderr).toBe('oops');
    expect(r.exitCode).toBe(0);
    expect(console.log).toBe(originalLog);
  });
  it('reports a missing entry function', async () => {
    const r = await runBindgen('/m.js', { entry: 'go', importer: async () => ({}) });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('no exported function "go"');
  });
  it('restores console even if the module throws', async () => {
    const originalError = console.error;
    const r = await runBindgen('/m.js', { importer: async () => ({ run: () => { throw new Error('boom'); } }) });
    expect(r.stderr).toBe('boom');
    expect(console.error).toBe(originalError);
  });
});
