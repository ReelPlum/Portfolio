import { visit, SKIP } from 'unist-util-visit';
import { REF_RE, resolveRef } from './references.js';
import { withBase } from './content.js';

// Turns [[slug]] / [[slug|text]] into links. Unknown references fail the build so links never break.
export function remarkReferences({ targets, base = '/' }) {
  return (tree, file) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || parent.type === 'link' || !node.value.includes('[[')) return;
      const parts = [];
      let pos = 0;
      for (const m of node.value.matchAll(REF_RE)) {
        let target;
        try {
          target = resolveRef(m[1], targets);
        } catch (e) {
          throw new Error(`${e.message}${file?.path ? ` (in ${file.path})` : ''}`);
        }
        if (m.index > pos) parts.push({ type: 'text', value: node.value.slice(pos, m.index) });
        parts.push({
          type: 'link',
          url: withBase(target.url, base),
          data: { hProperties: { className: ['ref-link'], 'data-ref': `${target.collection}/${target.slug}` } },
          children: [{ type: 'text', value: (m[2] || target.title).trim() }],
        });
        pos = m.index + m[0].length;
      }
      if (!parts.length) return;
      if (pos < node.value.length) parts.push({ type: 'text', value: node.value.slice(pos) });
      parent.children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}
