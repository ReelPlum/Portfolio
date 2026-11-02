// Shared snippets: markdown you reuse across posts, kept in <content>/snippets/<name>.md.
//
//   {{snippet bio}}                                  on its own line
//   {{snippet install package="tiny-calc"}}          with values for {{package}} inside the snippet
//
// The snippet is parsed as part of the post, so maths, code blocks, embeds and references in it work.
// A missing snippet or a missing value fails the build.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

// Quotes may arrive as curly quotes: Astro's smartypants runs before this plugin.
export const SNIPPET_LINE = /^\{\{\s*snippet\s+([\w-]+)((?:\s+[\w-]+=["“”][^"“”]*["“”])*)\s*\}\}$/;
const ARG = /([\w-]+)=["“”]([^"“”]*)["“”]/g;
const PLACEHOLDER = /\{\{\s*([\w-]+)\s*\}\}/g;

/** The snippet's markdown with its {{placeholders}} filled in. Snippets can include other snippets. */
export function snippetText(name, args, dir, seen = []) {
  if (seen.includes(name)) throw new Error(`Snippet "${name}" includes itself (${[...seen, name].join(' → ')})`);
  const path = join(dir, `${name}.md`);
  if (!existsSync(path)) throw new Error(`Snippet not found: ${name}. Create ${join('snippets', `${name}.md`)} in your content folder`);
  const raw = readFileSync(path, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  const filled = raw.replace(PLACEHOLDER, (m, key) => {
    if (key === 'snippet') return m;
    if (!Object.hasOwn(args, key)) throw new Error(`Snippet "${name}" needs ${key}="…"`);
    return args[key];
  });
  return expandSnippetText(filled, dir, [...seen, name]);
}

const parseArgs = (s = '') => Object.fromEntries([...s.matchAll(ARG)].map((m) => [m[1], m[2]]));

/** Replaces every snippet line in a markdown string (used for search text; posts use the remark plugin). */
export function expandSnippetText(md, dir, seen = []) {
  if (!dir) return md;
  let fence = false;
  return md.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && SNIPPET_LINE.exec(line.trim());
    return m ? snippetText(m[1], parseArgs(m[2]), dir, seen) : line;
  }).join('\n');
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export function remarkSnippets({ dir } = {}) {
  return (tree, file) => {
    const where = file?.path ? ` (in ${file.path})` : '';
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const text = child.type === 'paragraph' && child.children.length === 1 && child.children[0].type === 'text' ? child.children[0].value.trim() : null;
        const m = text && SNIPPET_LINE.exec(text);
        if (m) {
          let md;
          try { md = snippetText(m[1], parseArgs(m[2]), dir); } catch (e) { throw new Error(`${e.message}${where}`); }
          const kids = parser.parse(md).children;
          node.children.splice(i, 1, ...kids);
          i += kids.length - 1;
        } else walk(child);
      }
    };
    walk(tree);
  };
}
