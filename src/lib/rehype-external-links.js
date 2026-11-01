import { visit } from 'unist-util-visit';
import { isExternal, EXTERNAL_ATTRS } from './links.js';
import { iconSvg } from './icons.js';

// Markdown links to other sites open in a new tab, get a small arrow icon and a hint for screen readers.
export function rehypeExternalLinks({ site, base = '/' } = {}) {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a' || !isExternal(node.properties?.href, { site, base })) return;
      Object.assign(node.properties, { target: EXTERNAL_ATTRS.target, rel: EXTERNAL_ATTRS.rel.split(' ') });
      const cls = node.properties.className || [];
      node.properties.className = [...(Array.isArray(cls) ? cls : [cls]), 'external-link'];
      // Links around images (or other media) stay as they are, without the arrow.
      if (node.children.some((c) => c.type === 'element' && ['img', 'picture', 'video'].includes(c.tagName))) return;
      node.children.push(
        { type: 'raw', value: iconSvg('north_east', { size: 14 }) },
        { type: 'element', tagName: 'span', properties: { className: ['visually-hidden'] }, children: [{ type: 'text', value: ' (opens in a new tab)' }] },
      );
    });
  };
}
