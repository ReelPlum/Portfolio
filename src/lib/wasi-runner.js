import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from '@bjorn3/browser_wasi_shim';

const moduleCache = new Map();

/** Fetches and compiles a .wasm file once per URL. A failed load is not cached, so it can be retried. */
export function loadModule(url, fetchImpl = (u) => fetch(u)) {
  if (!moduleCache.has(url)) {
    const p = (async () => {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
      return WebAssembly.compile(await res.arrayBuffer());
    })();
    moduleCache.set(url, p);
    p.catch(() => moduleCache.delete(url));
  }
  return moduleCache.get(url);
}

/** Collects bytes written to a stream into lines; `flush()` emits a trailing line without a newline. */
export function lineCollector(emit) {
  const dec = new TextDecoder('utf-8', { fatal: false });
  let buf = '';
  return {
    write(bytes) {
      buf += dec.decode(bytes, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) emit(l.replace(/\r$/, ''));
    },
    flush() {
      buf += dec.decode();
      if (buf) emit(buf);
      buf = '';
    },
  };
}

/**
 * Runs a WASI program (e.g. Rust built for wasm32-wasip1) once and collects what it prints.
 * Every run gets a fresh instance so no state leaks between runs.
 */
export async function runWasi(module, { code = '', input = 'file', filename = 'main.txt', args = [], onLine } = {}) {
  const output = [];
  const emitter = (stream) => (text) => {
    output.push({ stream, text });
    onLine?.({ stream, text });
  };
  const out = lineCollector(emitter('out'));
  const err = lineCollector(emitter('err'));
  const bytes = new TextEncoder().encode(code);
  const argv = ['program', ...args, ...(input === 'file' ? [filename] : [])];
  const fds = [
    new OpenFile(new File(input === 'stdin' ? bytes : new Uint8Array())),
    new ConsoleStdout((b) => out.write(b)),
    new ConsoleStdout((b) => err.write(b)),
    new PreopenDirectory('.', new Map([[filename, new File(bytes)]])),
  ];
  const wasi = new WASI(argv, [], fds);
  let exitCode = 0;
  try {
    const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
    exitCode = wasi.start(instance) ?? 0;
  } catch (e) {
    out.flush();
    emitter('err')(e instanceof WebAssembly.RuntimeError ? `Crashed: ${e.message}` : String(e?.message || e));
    exitCode = 1;
  }
  out.flush();
  err.flush();
  return finish(output, exitCode);
}

/**
 * Runs a wasm-bindgen / wasm-pack (--target web) build. Anything the module prints through
 * console.log / console.error, or through `globalThis.print(text)`, is captured.
 */
export async function runBindgen(jsUrl, { code = '', entry = 'run', onLine, importer = (u) => import(/* @vite-ignore */ u) } = {}) {
  const output = [];
  const emit = (stream) => (...parts) => {
    const text = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    for (const line of text.split('\n')) {
      output.push({ stream, text: line });
      onLine?.({ stream, text: line });
    }
  };
  const saved = { log: console.log, error: console.error, warn: console.warn, print: globalThis.print };
  console.log = emit('out');
  console.error = emit('err');
  console.warn = emit('err');
  globalThis.print = emit('out');
  let exitCode = 0;
  try {
    const mod = await importer(jsUrl);
    if (typeof mod.default === 'function') await mod.default();
    if (typeof mod[entry] !== 'function') throw new Error(`The module has no exported function "${entry}"`);
    const ret = await mod[entry](code);
    if (typeof ret === 'string' && ret) emit('out')(ret);
  } catch (e) {
    emit('err')(String(e?.message || e));
    exitCode = 1;
  } finally {
    console.log = saved.log;
    console.error = saved.error;
    console.warn = saved.warn;
    globalThis.print = saved.print;
  }
  return finish(output, exitCode);
}

function finish(output, exitCode) {
  const join = (s) => output.filter((o) => o.stream === s).map((o) => o.text).join('\n');
  return { stdout: join('out'), stderr: join('err'), exitCode, output };
}
