// Per-post LaTeX macros. Write definitions once, at the top of a post, in a fenced block:
//
//   ```preamble
//   \newcommand{\R}{\mathbb{R}}
//   \def\norm#1{\left\lVert #1 \right\rVert}
//   ```
//
// and every formula in that post (and its search results) can use them. The block itself isn't shown.
// Definitions written inside a formula ($\gdef\x{...}$) also carry on to the formulas after it.
// KaTeX has no package loader, so \usepackage / \documentclass lines are ignored with a warning.
import katex from 'katex';

export const PREAMBLE_LANGS = new Set(['preamble', 'latex-preamble']);
const PREAMBLE_FENCE_RE = /^(`{3,}|~{3,})[ \t]*(?:preamble|latex-preamble)[ \t]*\n([\s\S]*?)\n\1[ \t]*$/gm;
const UNSUPPORTED_RE = /^[ \t]*\\(?:usepackage|RequirePackage|documentclass)\b.*$/gm;
const DEF_RE = /\\(?:newcommand|renewcommand|providecommand|def|gdef|edef|xdef|let)\b/;

/** Removes lines KaTeX can't handle; returns the cleaned preamble and what was dropped. */
export function cleanPreamble(tex = '') {
  const dropped = [];
  const cleaned = String(tex).replace(UNSUPPORTED_RE, (line) => {
    dropped.push(line.trim());
    return '';
  });
  return { tex: cleaned.trim(), dropped };
}

/**
 * The macros object a preamble defines. Definitions are read one line at a time so one mistake doesn't
 * lose the rest, and \newcommand may redefine KaTeX's own commands (e.g. \R), as people expect in a preamble.
 */
export function macrosFrom(preamble = '', { onError } = {}) {
  const macros = {};
  const opts = { macros, globalGroup: true, throwOnError: true, strict: false };
  for (const line of cleanPreamble(preamble).tex.split('\n')) {
    if (!line.trim()) continue;
    try {
      katex.renderToString(line, opts);
    } catch (e) {
      try {
        if (!/attempting to redefine|already defined/i.test(e.message)) throw e;
        katex.renderToString(line.replace(/\\newcommand\b/g, '\\renewcommand'), opts);
      } catch (err) {
        onError?.(line, err);
      }
    }
  }
  return macros;
}

/**
 * Everything in a markdown source that defines macros: the preamble blocks plus formulas that contain
 * \newcommand / \def etc. Used for search results, which render formulas outside the post.
 */
export function preambleFromMarkdown(md = '', mathRe) {
  const parts = [...String(md).matchAll(PREAMBLE_FENCE_RE)].map((m) => m[2]);
  if (mathRe) {
    for (const m of String(md).matchAll(mathRe)) {
      if (DEF_RE.test(m[0])) parts.push(m[0].replace(/^\$\$?|\$\$?$/g, ''));
    }
  }
  return cleanPreamble(parts.join('\n')).tex;
}

/** markdownToText helper: drops preamble blocks so they don't show up as text. */
export const stripPreambleBlocks = (md) => String(md).replace(PREAMBLE_FENCE_RE, '');
