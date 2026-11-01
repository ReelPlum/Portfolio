import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';
import { codeBlockHtml, tableBlockHtml, parseInclude, sliceLines, metaTitle } from './code-blocks.js';
import { iconSvg } from './icons.js';
import { withBase } from './content.js';

const SKIP_LANGS = new Set(['math', 'preamble', 'latex-preamble']);

function soleText(node) {
  const kids = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  if (kids.length !== 1) return null;
  const [c] = kids;
  if (c.type === 'text') return c.value.trim();
  if (c.type === 'link' && c.children.length === 1 && c.children[0].value === c.url) return c.url;
  return null;
}

/**
 * Highlights every fenced code block, and turns a path to a source file on its own line into a code
 * block. A missing file or bad line range fails the build, so a post never shows a broken include.
 */
export function remarkCode({ publicDirs = ['public'], base = '/' } = {}) {
  return async (tree, file) => {
    const jobs = [];
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index == null) return;
      const inc = parseInclude(soleText(node) ?? '');
      if (!inc) return;
      const dir = publicDirs.find((d) => existsSync(join(d, inc.path)));
      const where = file?.path ? ` (in ${file.path})` : '';
      if (!dir) throw new Error(`Code file not found: ${inc.path}. Put it in public${inc.path}${where}`);
      let value;
      try {
        value = sliceLines(readFileSync(join(dir, inc.path), 'utf8'), inc.from, inc.to);
      } catch (e) {
        throw new Error(`${inc.path}: ${e.message}${where}`);
      }
      const title = inc.path.split('/').pop() + (inc.from ? ` (lines ${inc.from}–${inc.to})` : '');
      const replacement = { type: 'html', value: '' };
      parent.children[index] = replacement;
      const href = withBase(inc.path, base);
      // CSV / TSV files are shown as a table; everything else as highlighted text.
      if (inc.lang === 'csv' || inc.lang === 'tsv') {
        replacement.value = tableBlockHtml(value, { lang: inc.lang, title, href, icons: { download: iconSvg('download', { size: 18 }) } });
        return;
      }
      jobs.push(codeBlockHtml(value, { lang: inc.lang, title, href }).then((h) => { replacement.value = h; }));
    });
    visit(tree, 'code', (node, index, parent) => {
      if (!parent || SKIP_LANGS.has((node.lang || '').toLowerCase())) return;
      const replacement = { type: 'html', value: '' };
      parent.children[index] = replacement;
      jobs.push(codeBlockHtml(node.value, { lang: node.lang, title: metaTitle(node.meta) }).then((h) => { replacement.value = h; }));
    });
    await Promise.all(jobs);
  };
}
