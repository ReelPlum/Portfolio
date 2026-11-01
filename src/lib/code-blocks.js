// Code blocks: syntax highlighting (Shiki, every bundled language, light + dark), a header with the
// language name, an optional file name and a copy button. Also turns a path to a source file on its own
// line into a code block:
//
//   /code/tiny-calc/main.rs            the whole file (from public/code/...)
//   /code/tiny-calc/main.rs#L10-L24    only lines 10 to 24
//
// Fenced blocks can be given a file name too:  ```rust title="src/main.rs"
import { createHighlighter, bundledLanguages, bundledLanguagesInfo } from 'shiki';
import { iconSvg } from './icons.js';

export const THEMES = { light: 'github-light', dark: 'github-dark' };
const PLAIN = new Set(['', 'text', 'txt', 'plain', 'plaintext']);

// File extensions Shiki doesn't list as aliases.
const EXTRA_EXT = {
  h: 'c', hh: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp', mjs: 'javascript', cjs: 'javascript', mts: 'typescript',
  cts: 'typescript', yml: 'yaml', htm: 'html', markdown: 'markdown', ksh: 'shellscript', zsh: 'shellscript',
  txt: 'text', wat: 'wasm', s: 'asm', ml: 'ocaml', ex: 'elixir', exs: 'elixir', erl: 'erlang', hs: 'haskell',
  kt: 'kotlin', kts: 'kotlin', rb: 'ruby', py: 'python', pyw: 'python', cs: 'csharp', fs: 'fsharp',
  gd: 'gdscript', glsl: 'glsl', frag: 'glsl', vert: 'glsl', zig: 'zig', lua: 'lua', jl: 'julia', r: 'r',
};

const byAlias = new Map();
for (const l of bundledLanguagesInfo) {
  byAlias.set(l.id, l);
  for (const a of l.aliases || []) byAlias.set(a, l);
}

/** Shiki language info for a fence language or alias, or null. */
export function languageInfo(lang) {
  return byAlias.get(String(lang || '').toLowerCase()) || null;
}

/** The label shown on a block: Shiki's display name, or the fence text as written. */
export function languageLabel(lang) {
  if (PLAIN.has(String(lang || '').toLowerCase())) return 'Text';
  return languageInfo(lang)?.name || String(lang);
}

/** The language for a file name, from its extension, or null if it isn't a source file. */
export function languageForFile(path) {
  const name = String(path).split('/').pop().toLowerCase();
  if (name === 'dockerfile') return 'docker';
  if (name === 'makefile') return 'make';
  const ext = /\.([a-z0-9+_-]+)$/.exec(name)?.[1];
  if (!ext) return null;
  if (EXTRA_EXT[ext]) return EXTRA_EXT[ext];
  return languageInfo(ext)?.id || null;
}

const INCLUDE_RE = /^(\/(?!\/)[^\s#?]+\.[A-Za-z0-9+_-]+)(?:#L(\d+)(?:-L?(\d+))?)?$/;
// Paths that are not source code even if a grammar exists for them (media, documents).
const NOT_CODE = /\.(pdf|png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|mov|ogv|mp3|wav|wasm)$/i;

/** Parses "/code/a.rs#L3-L9" into { path, lang, from, to }, or null if it isn't a source file path. */
export function parseInclude(text) {
  const m = INCLUDE_RE.exec(String(text).trim());
  if (!m || NOT_CODE.test(m[1])) return null;
  const lang = languageForFile(m[1]);
  if (!lang) return null;
  const from = m[2] ? Number(m[2]) : null;
  const to = m[3] ? Number(m[3]) : from;
  return { path: m[1], lang, from, to };
}

/** The selected lines of a file (1-based, inclusive). */
export function sliceLines(source, from, to) {
  const text = source.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (from == null) return text;
  const lines = text.split('\n');
  if (from < 1 || to < from || to > lines.length) throw new Error(`lines ${from}-${to} are outside the file (it has ${lines.length} lines)`);
  return dedent(lines.slice(from - 1, to));
}

/** Removes the indentation all lines share, so a method pulled out of an impl block starts at the left. */
export function dedent(lines) {
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

/** Reads title="..." from a fence's meta string. */
export function metaTitle(meta) {
  return /(?:^|\s)(?:title|file)=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta || '')?.slice(1).find((x) => x != null) ?? null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let highlighterPromise;
async function highlighter(lang) {
  highlighterPromise ??= createHighlighter({ themes: Object.values(THEMES), langs: [] });
  const hl = await highlighterPromise;
  if (lang && lang !== 'text' && !hl.getLoadedLanguages().includes(lang)) await hl.loadLanguage(lang);
  return hl;
}

/** The full HTML of one code block. */
export async function codeBlockHtml(code, { lang, title, href } = {}) {
  const info = PLAIN.has(String(lang || '').toLowerCase()) ? null : languageInfo(lang);
  const id = info && bundledLanguages[info.id] ? info.id : 'text';
  const hl = await highlighter(id);
  const pre = hl.codeToHtml(code, { lang: id, themes: THEMES });
  const label = languageLabel(lang);
  const name = title ? (href ? `<a class="code-title" href="${esc(href)}">${esc(title)}</a>` : `<span class="code-title">${esc(title)}</span>`) : '';
  return `<figure class="code-block" data-language="${esc(id)}"><figcaption class="code-head"><span class="code-lang">${esc(label)}</span>${name}`
    + `<button type="button" class="icon-btn code-copy" aria-label="Copy code" title="Copy">${iconSvg('content_copy', { size: 18 })}${iconSvg('check', { size: 18 })}</button>`
    + `<span class="visually-hidden code-status" role="status"></span></figcaption>${pre}</figure>`;
}
