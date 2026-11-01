// Runs WebAssembly apps embedded in posts (a /wasm/<name>/<name>.js path on its own line), such as a
// Rust wgpu renderer built with wasm-bindgen. The app starts when the visitor presses Run, so a heavy
// GPU demo never starts on its own. The module's default export (wasm-bindgen's init) is called first,
// then its `start` export (or ?entry=name) with the canvas.

function graphicsSupport() {
  if ('gpu' in navigator) return 'WebGPU';
  try {
    // A throwaway canvas: asking the real one for a WebGL context would stop wgpu using WebGPU on it.
    if (document.createElement('canvas').getContext('webgl2')) return 'WebGL 2';
  } catch { /* no WebGL */ }
  return null;
}

export async function runCanvas(figure) {
  if (figure.dataset.state === 'running' || figure.dataset.state === 'loading') return;
  const canvas = figure.querySelector('canvas');
  const status = figure.querySelector('.canvas-status');
  const button = figure.querySelector('.canvas-run');
  const fail = (msg) => {
    figure.dataset.state = 'error';
    figure.querySelector('.canvas-overlay').hidden = false;
    status.textContent = msg;
    button.hidden = true;
  };
  if (!graphicsSupport()) return fail('This browser has neither WebGPU nor WebGL 2, so the demo can\'t run here.');
  figure.dataset.state = 'loading';
  button.hidden = true;
  status.textContent = 'Loading…';
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  try {
    const mod = await import(/* @vite-ignore */ new URL(figure.dataset.module, window.location.href).href);
    if (typeof mod.default === 'function') await mod.default();
    const entry = figure.dataset.entry || 'start';
    if (typeof mod[entry] !== 'function') throw new Error(`the module has no "${entry}" function`);
    figure.dataset.state = 'running';
    status.textContent = '';
    figure.querySelector('.canvas-overlay').hidden = true;
    await mod[entry](canvas);
  } catch (e) {
    console.error(e);
    fail(`The demo stopped with an error: ${e?.message || e}`);
  }
}

export function setupCanvases() {
  for (const figure of document.querySelectorAll('[data-canvas]')) {
    figure.querySelector('.canvas-run')?.addEventListener('click', () => runCanvas(figure));
  }
}
