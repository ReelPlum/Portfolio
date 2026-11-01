import { visit } from 'unist-util-visit';
import { withBase } from './content.js';

// Markdown authors write "/images/cat.png"; on GitHub Pages under /Portfolio/ that must become
// "/Portfolio/images/cat.png". This rewrites root-relative src / href / poster attributes.
export function rehypeBaseUrls({ base = '/' } = {}) {
  return (tree) => {
    if (base === '/') return;
    const prefix = base.endsWith('/') ? base : `${base}/`;
    visit(tree, 'element', (node) => {
      for (const attr of ['src', 'href', 'poster']) {
        const v = node.properties?.[attr];
        if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.startsWith(prefix)) continue;
        node.properties[attr] = withBase(v, base);
      }
    });
  };
}
