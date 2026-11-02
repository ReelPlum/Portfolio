import { visit } from 'unist-util-visit';
import { iconSvg } from './icons.js';

// GitHub-style callouts:  > [!NOTE]  /  > [!TIP] Optional title  /  > [!WARNING]
export const CALLOUTS = {
  note: { title: 'Note', icon: 'info' },
  tip: { title: 'Tip', icon: 'lightbulb' },
  important: { title: 'Important', icon: 'priority_high' },
  warning: { title: 'Warning', icon: 'warning' },
  caution: { title: 'Caution', icon: 'report' },
  // Maths. Theorems, lemmas, corollaries and definitions share one counter, like LaTeX's amsthm.
  theorem: { title: 'Theorem', icon: 'functions', numbered: true, math: true },
  lemma: { title: 'Lemma', icon: 'functions', numbered: true, math: true },
  corollary: { title: 'Corollary', icon: 'functions', numbered: true, math: true },
  definition: { title: 'Definition', icon: 'menu_book', numbered: true, math: true },
  proof: { title: 'Proof', icon: 'verified', math: true },
};
const MARKER = /^\[!([a-z]+)\][ \t]*([^\n]*)\n?/i;
const LABEL = /\\label\{([^}]+)\}/;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const labelId = (name) => `ref-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/**
 * Turns marked blockquotes into callout boxes. Maths blocks are numbered; a \label{name} in the title
 * makes it a target for \ref{name} (src/lib/remark-math-refs.js).
 */
export function remarkCallouts() {
  return (tree, file) => {
    let counter = 0;
    file.data.labels ||= {};
    visit(tree, 'blockquote', (node, index, parent) => {
      const first = node.children[0];
      const text = first?.type === 'paragraph' && first.children[0]?.type === 'text' ? first.children[0] : null;
      const m = text && MARKER.exec(text.value);
      if (!m) return;
      const kind = m[1].toLowerCase();
      if (!CALLOUTS[kind]) {
        throw new Error(`Unknown callout [!${m[1]}]. Use one of: ${Object.keys(CALLOUTS).map((k) => k.toUpperCase()).join(', ')}${file?.path ? ` (in ${file.path})` : ''}`);
      }
      const { title, icon, numbered, math } = CALLOUTS[kind];
      text.value = text.value.slice(m[0].length);
      if (!text.value) first.children.shift();
      if (first.children[0]?.type === 'break') first.children.shift();
      if (!first.children.length) node.children.shift();

      let name = m[2].trim();
      let id;
      const label = LABEL.exec(name);
      if (label) {
        name = name.replace(LABEL, '').trim();
        id = labelId(label[1]);
      }
      let heading = title;
      if (numbered) heading += ` ${++counter}`;
      if (label) {
        if (file.data.labels[label[1]]) throw new Error(`\\label{${label[1]}} is used twice${file?.path ? ` (in ${file.path})` : ''}`);
        file.data.labels[label[1]] = { id, text: numbered ? String(counter) : heading };
      }
      // Notes keep their own word unless a title replaces it; maths blocks show "Theorem 2 (Name)".
      const shown = math ? `<strong>${esc(heading)}</strong>${name ? ` <span class="callout-name">(${esc(name)})</span>` : ''}` : `<span>${esc(name || title)}</span>`;
      const ariaLabel = math ? `${heading}${name ? ` (${name})` : ''}` : name || title;
      parent.children[index] = {
        type: 'callout',
        data: {
          hName: 'aside',
          hProperties: { className: ['callout', `callout-${kind}`, ...(math ? ['callout-math'] : [])], role: 'note', ariaLabel, ...(id ? { id } : {}) },
        },
        children: [
          { type: 'html', value: `<p class="callout-title">${iconSvg(icon, { size: 20 })}${shown}</p>` },
          ...node.children,
        ],
      };
    });
  };
}
