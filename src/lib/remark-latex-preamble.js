import { visit, SKIP } from 'unist-util-visit';
import rehypeKatex from 'rehype-katex';
import { PREAMBLE_LANGS, cleanPreamble, macrosFrom } from './latex.js';

/** Collects ```preamble blocks into file.data.latexPreamble and removes them from the page. */
export function remarkLatexPreamble() {
  return (tree, file) => {
    const parts = [];
    visit(tree, 'code', (node, index, parent) => {
      if (!parent || !PREAMBLE_LANGS.has((node.lang || '').toLowerCase())) return;
      parts.push(node.value);
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
    const { tex, dropped } = cleanPreamble(parts.join('\n'));
    if (dropped.length) {
      console.warn(`[latex] ${file.path || 'a post'}: KaTeX can't load packages, ignored: ${dropped.join(', ')}`);
    }
    file.data.latexPreamble = tex;
  };
}

/**
 * rehype-katex with one macros object per post: the post's preamble is defined first, and definitions
 * inside formulas (globalGroup) carry on to later formulas in the same post but never into other posts.
 */
export function rehypeKatexPerPost(options = {}) {
  return (tree, file) => {
    const macros = macrosFrom(file.data.latexPreamble || '', {
      onError: (line, e) => console.warn(`[latex] ${file.path || 'a post'}: preamble line "${line}" failed: ${e.message}`),
    });
    return rehypeKatex({ ...options, macros, globalGroup: true })(tree, file);
  };
}
