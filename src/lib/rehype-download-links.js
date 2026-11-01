import { visit } from 'unist-util-visit';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { iconSvg } from './icons.js';

// Links to files in public/ that should download instead of open:
//   [The slides](/files/talk.pdf "download")     any file, by giving the link the title "download"
//   [Source code](/files/project.zip)            archives, installers and disk images always download
// They get the download attribute, a download icon and the file size. A missing file fails the build.
export const ALWAYS_DOWNLOAD = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|exe|msi|dmg|pkg|deb|rpm|apk|appimage|iso|jar|whl|crate|blend|fbx|obj|stl|psd|sketch|fig|goodnotes)$/i;

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function rehypeDownloadLinks({ publicDirs = [], base = '/' } = {}) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return (tree, file) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return;
      const marked = String(node.properties.title || '').trim().toLowerCase() === 'download';
      const path = decodeURIComponent((href.startsWith(prefix) ? `/${href.slice(prefix.length)}` : href).split(/[?#]/)[0]);
      if (!marked && !ALWAYS_DOWNLOAD.test(path)) return;
      const dir = publicDirs.find((d) => existsSync(join(d, path)) && statSync(join(d, path)).isFile());
      if (!dir) {
        if (!marked) return; // e.g. a page that happens to end in .zip; only explicit downloads must exist
        throw new Error(`Download not found: ${path}. Put the file in public${path}${file?.path ? ` (in ${file.path})` : ''}`);
      }
      const size = formatSize(statSync(join(dir, path)).size);
      if (marked) delete node.properties.title;
      node.properties.download = path.split('/').pop();
      const cls = node.properties.className || [];
      node.properties.className = [...(Array.isArray(cls) ? cls : [cls]), 'download-link'];
      node.children.unshift({ type: 'raw', value: iconSvg('download', { size: 18 }) });
      node.children.push({ type: 'element', tagName: 'span', properties: { className: ['download-size'] }, children: [{ type: 'text', value: size }] });
    });
  };
}
