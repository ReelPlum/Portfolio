import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The file in public/ a demo needs, or null for external URLs. */
export function demoAsset(demo) {
  if (!demo) return null;
  const p = demo.type === 'wasi' ? demo.wasm : demo.type === 'bindgen' ? demo.module : demo.src;
  if (!p || /^(?:[a-z]+:)?\/\//i.test(p)) return null;
  return p.replace(/^\/+/, '').split(/[?#]/)[0];
}

/** False when the demo points at a file that has not been dropped into public/ yet. */
export function demoReady(demo, publicDir = join(process.cwd(), 'public')) {
  if (!demo) return false;
  const asset = demoAsset(demo);
  return asset === null || existsSync(join(publicDir, asset));
}

export { demoExamplesClient as demoExamples } from './playground-client.js';
