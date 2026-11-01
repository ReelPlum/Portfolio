// Stand-in for a wasm-bindgen build (e.g. a Rust wgpu app): a default init export and a start(canvas) export.
let initialised = false;
export default async function init() {
  initialised = true;
}
export async function start(canvas) {
  if (!initialised) throw new Error('init() was not called first');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(66, 133, 244)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.started = String(canvas.width);
}
