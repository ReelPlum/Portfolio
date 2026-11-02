import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';
import { codeBlockHtml, tableBlockHtml, parseInclude, sliceLines, metaTitle } from './code-blocks.js';
import { iconSvg } from './icons.js';
import { renderPlotBlock } from './plot.js';
import { parseFileDiff, parseUnifiedDiff, diffTexts, diffBlockHtml } from './diff-blocks.js';
import { languageForFile } from './code-blocks.js';
import { parseCompare, compareHtml } from './compare.js';
import { imageInfo } from './images.js';
import { withBase } from './content.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A Mermaid diagram: the source is in the page (readable without JavaScript) and drawn in the browser. */
export function mermaidHtml(source, title) {
  const caption = title ? `<figcaption>${esc(title)}</figcaption>` : '';
  return `<figure class="mermaid-block" data-mermaid${title ? ` aria-label="${esc(title)}"` : ''}><pre class="mermaid-source">${esc(source.trim())}</pre><div class="mermaid-diagram" hidden></div>${caption}</figure>`;
}

const metaLang = (meta) => /(?:^|\s)lang=(\S+)/.exec(meta || '')?.[1];

/** A ```diff block: a pasted unified diff, or "from:" / "to:" naming two files in public/. */
async function diffJob(node, file, publicDirs) {
  const where = file?.path ? ` (in ${file.path})` : '';
  try {
    const spec = parseFileDiff(node.value);
    if (spec) {
      const read = (p) => {
        const dir = publicDirs.find((d) => existsSync(join(d, p)));
        if (!dir) throw new Error(`File not found: ${p}. Put it in public${p}`);
        return readFileSync(join(dir, p), 'utf8');
      };
      const hunks = diffTexts(read(spec.from), read(spec.to), spec.context ? Number(spec.context) : 3);
      const lang = spec.lang || metaLang(node.meta) || languageForFile(spec.to);
      const title = spec.title || metaTitle(node.meta) || `${spec.from.split('/').pop()} → ${spec.to.split('/').pop()}`;
      return diffBlockHtml(hunks, { lang, title });
    }
    const { file: name, hunks } = parseUnifiedDiff(node.value);
    const lang = metaLang(node.meta) || (name ? languageForFile(name) : null);
    return diffBlockHtml(hunks, { lang, title: metaTitle(node.meta) || name });
  } catch (e) {
    throw new Error(`Diff: ${e.message}${where}`);
  }
}

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
export function remarkCode({ publicDirs = ['public'], base = '/', variants = process.env.NODE_ENV === 'production' } = {}) {
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
      if ((node.lang || '').toLowerCase() === 'diff') {
        const replacement = { type: 'html', value: '' };
        parent.children[index] = replacement;
        jobs.push(diffJob(node, file, publicDirs).then((h) => { replacement.value = h; }));
        return;
      }
      if ((node.lang || '').toLowerCase() === 'compare') {
        const fail = (e) => { throw new Error(`Compare: ${e.message}${file?.path ? ` (in ${file.path})` : ''}`); };
        let spec;
        try { spec = parseCompare(node.value); } catch (e) { fail(e); }
        const replacement = { type: 'html', value: '' };
        parent.children[index] = replacement;
        const hrefFor = (p) => withBase(p, base);
        jobs.push((async () => {
          const images = {};
          for (const { src } of [spec.before, spec.after]) images[src] = await imageInfo(src, { publicDirs, hrefFor, variants });
          try { replacement.value = compareHtml(spec, { publicDirs, hrefFor, images }); } catch (e) { fail(e); }
        })());
        return;
      }
      if ((node.lang || '').toLowerCase() === 'mermaid') {
        parent.children[index] = { type: 'html', value: mermaidHtml(node.value, metaTitle(node.meta)) };
        return;
      }
      if ((node.lang || '').toLowerCase() === 'plot') {
        try {
          parent.children[index] = { type: 'html', value: renderPlotBlock(node.value, { publicDirs, hrefFor: (p) => withBase(p, base) }) };
        } catch (e) {
          throw new Error(`Plot: ${e.message}${file?.path ? ` (in ${file.path})` : ''}`);
        }
        return;
      }
      const replacement = { type: 'html', value: '' };
      parent.children[index] = replacement;
      jobs.push(codeBlockHtml(node.value, { lang: node.lang, title: metaTitle(node.meta) }).then((h) => { replacement.value = h; }));
    });
    await Promise.all(jobs);
  };
}
