// Turns images in posts into <picture> elements with AVIF / WebP variants, and gives every image its
// size and lazy loading (src/lib/images.js). The first image of a post loads straight away, since it
// is often the first thing on screen.
import { imageInfo, PROSE_SIZES } from './images.js';

function walk(node, fn, parent = null, index = 0) {
  fn(node, parent, index);
  (node.children || []).forEach((c, i) => walk(c, fn, node, i));
}

export function rehypeImages({ publicDirs, base = '/', variants = process.env.NODE_ENV === 'production' } = {}) {
  const prefix = base.replace(/\/$/, '');
  const unprefix = (src) => (prefix && src.startsWith(`${prefix}/`) ? src.slice(prefix.length) : src);
  return async (tree) => {
    const imgs = [];
    walk(tree, (node, parent, index) => {
      if (node.type === 'element' && node.tagName === 'img' && parent?.tagName !== 'picture') imgs.push({ node, parent, index });
    });
    let first = true;
    for (const { node, parent } of imgs) {
      const props = node.properties;
      const info = await imageInfo(unprefix(String(props.src || '')), { publicDirs, variants, hrefFor: (p) => prefix + p });
      if (first) { props.loading = 'eager'; props.fetchPriority = 'high'; first = false; } else props.loading ??= 'lazy';
      props.decoding ??= 'async';
      if (!info) continue;
      props.width ??= info.width;
      props.height ??= info.height;
      if (!info.sources.length) continue;
      const picture = {
        type: 'element', tagName: 'picture', properties: {},
        children: [
          ...info.sources.map((s) => ({ type: 'element', tagName: 'source', properties: { type: s.type, srcSet: s.srcset, sizes: PROSE_SIZES }, children: [] })),
          node,
        ],
      };
      parent.children[parent.children.indexOf(node)] = picture;
    }
  };
}
