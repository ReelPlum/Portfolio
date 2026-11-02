import { visit } from 'unist-util-visit';
import { labelId } from './remark-callouts.js';

/** remark-math keeps a copy of the TeX in data.hChildren, which is what gets rendered: change both. */
function setMath(node, tex) {
  const old = node.value;
  node.value = tex;
  const walk = (n) => {
    if (n.type === 'text' && n.value === old) n.value = tex;
    for (const c of n.children || []) walk(c);
  };
  for (const c of node.data?.hChildren || []) walk(c);
}

const LABEL = /\\label\{([^}]+)\}/;
const REF = /\\(eqref|ref)\{([^}]+)\}/g;

/**
 * Numbered equations and cross-references inside a post:
 *   $$ E = mc^2 \label{energy} $$   -> numbered (1) on the right, with an anchor
 *   see \eqref{energy} or $\eqref{energy}$  -> a link "(1)"; \ref{name} gives "1" (or "Theorem 2")
 * Only display equations with a \label are numbered. An unknown label fails the build.
 */
export function remarkMathRefs() {
  return (tree, file) => {
    const labels = (file.data.labels ||= {});
    const where = file?.path ? ` (in ${file.path})` : '';
    let n = 0;
    visit(tree, 'math', (node, index, parent) => {
      const m = LABEL.exec(node.value);
      if (!m || !parent) return;
      const name = m[1];
      if (labels[name]) throw new Error(`\\label{${name}} is used twice${where}`);
      n += 1;
      const id = labelId(name);
      labels[name] = { id, text: String(n), equation: true };
      const tex = `${node.value.replace(LABEL, '').trimEnd()} \\tag{${n}}`;
      setMath(node, tex);
      parent.children.splice(index, 0, { type: 'html', value: `<span id="${id}" class="eq-anchor"></span>` });
      return index + 2;
    });

    const link = (kind, name) => {
      const target = labels[name];
      if (!target) throw new Error(`\\${kind}{${name}} refers to a label that does not exist${where}`);
      const text = kind === 'eqref' && target.equation ? `(${target.text})` : target.text;
      return { type: 'link', url: `#${target.id}`, data: { hProperties: { className: ['math-ref'] } }, children: [{ type: 'text', value: text }] };
    };

    // $\eqref{x}$ on its own becomes a link.
    visit(tree, 'inlineMath', (node, index, parent) => {
      const m = /^\s*\\(eqref|ref)\{([^}]+)\}\s*$/.exec(node.value);
      if (m && parent) parent.children[index] = link(m[1], m[2]);
    });
    // \eqref{x} written in plain text.
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || !REF.test(node.value) || parent.type === 'link') return;
      REF.lastIndex = 0;
      const parts = [];
      let last = 0;
      for (const m of node.value.matchAll(REF)) {
        if (m.index > last) parts.push({ type: 'text', value: node.value.slice(last, m.index) });
        parts.push(link(m[1], m[2]));
        last = m.index + m[0].length;
      }
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
