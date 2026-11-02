// Code changes shown side by side or as one column, with a toggle, syntax highlighting and the language.
//   ```diff lang=rust title="Faster lexer"      a unified diff (+ / - / context lines, optional @@ headers)
//   ```diff                                      or two files from public/:
//   from: /code/interpreter/lexer-v1.rs
//   to: /code/interpreter/lexer.rs
//   ```
import { structuredPatch } from 'diff';
import { highlightLines, languageForFile, languageLabel } from './code-blocks.js';
import { iconSvg } from './icons.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "from: a\nto: b" (and optional title / lang / context) or null when the block is a pasted diff. */
export function parseFileDiff(value) {
  const lines = value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !lines.every((l) => /^(from|to|title|lang|context)\s*:/i.test(l))) return null;
  const spec = Object.fromEntries(lines.map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
  if (!spec.from || !spec.to) throw new Error('A file diff needs both "from:" and "to:"');
  return spec;
}

/** Parses a unified diff into hunks: [{ oldStart, newStart, header, lines: [{ type: ' '|'+'|'-', text }] }]. */
export function parseUnifiedDiff(text) {
  const hunks = [];
  let file = null;
  let hunk = null;
  for (const raw of text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')) {
    if (/^(diff --git|index |--- |\+\+\+ )/.test(raw)) {
      const m = /^\+\+\+ (?:b\/)?(\S+)/.exec(raw);
      if (m && m[1] !== '/dev/null') file = m[1];
      continue;
    }
    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(raw);
    if (h) {
      hunk = { oldStart: Number(h[1]), newStart: Number(h[2]), header: h[3] || '', lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) { hunk = { oldStart: 1, newStart: 1, header: '', lines: [] }; hunks.push(hunk); }
    const type = raw[0] === '+' || raw[0] === '-' ? raw[0] : ' ';
    hunk.lines.push({ type, text: type === ' ' && raw[0] !== ' ' ? raw : raw.slice(1) });
  }
  return { file, hunks };
}

/** Hunks for the change from one file's text to another's. */
export function diffTexts(before, after, context = 3) {
  const patch = structuredPatch('a', 'b', before, after, '', '', { context });
  return patch.hunks.map((h) => ({
    oldStart: h.oldStart, newStart: h.newStart, header: '',
    lines: h.lines.filter((l) => !l.startsWith('\\')).map((l) => ({ type: l[0], text: l.slice(1) })),
  }));
}

/** Adds line numbers and highlighted HTML to every line. */
async function annotate(hunks, lang) {
  for (const h of hunks) {
    const oldLines = h.lines.filter((l) => l.type !== '+');
    const newLines = h.lines.filter((l) => l.type !== '-');
    const oldHtml = await highlightLines(oldLines.map((l) => l.text).join('\n'), lang);
    const newHtml = await highlightLines(newLines.map((l) => l.text).join('\n'), lang);
    let o = h.oldStart, n = h.newStart, oi = 0, ni = 0;
    for (const l of h.lines) {
      if (l.type === '+') { l.newNo = n++; l.html = newHtml[ni++] ?? ''; }
      else if (l.type === '-') { l.oldNo = o++; l.html = oldHtml[oi++] ?? ''; }
      else { l.oldNo = o++; l.newNo = n++; l.html = newHtml[ni++] ?? ''; oi++; }
    }
  }
  return hunks;
}

/** Pairs removed and added lines of each change for the side-by-side view. */
export function splitRows(lines) {
  const rows = [];
  for (let i = 0; i < lines.length;) {
    if (lines[i].type === ' ') { rows.push([lines[i], lines[i]]); i++; continue; }
    const del = [], add = [];
    while (i < lines.length && lines[i].type === '-') del.push(lines[i++]);
    while (i < lines.length && lines[i].type === '+') add.push(lines[i++]);
    for (let k = 0; k < Math.max(del.length, add.length); k++) rows.push([del[k] || null, add[k] || null]);
  }
  return rows;
}

const SIGN = { '+': 'add', '-': 'del', ' ': 'ctx' };
const SR = { '+': 'Added: ', '-': 'Removed: ', ' ': '' };
const num = (v) => `<td class="diff-num">${v ?? ''}</td>`;
const code = (l) => `<td class="diff-code"><span class="visually-hidden">${SR[l.type]}</span><span class="diff-sign" aria-hidden="true">${l.type === ' ' ? ' ' : l.type}</span>${l.html || ' '}</td>`;

function unifiedTable(hunks) {
  const body = hunks.map((h) => `<tr class="diff-hunk"><td colspan="3">@@ −${h.oldStart} +${h.newStart} @@ ${esc(h.header)}</td></tr>`
    + h.lines.map((l) => `<tr class="diff-${SIGN[l.type]}">${num(l.oldNo)}${num(l.newNo)}${code(l)}</tr>`).join('')).join('');
  return `<table class="diff-table diff-unified"><caption class="visually-hidden">Changes, one column</caption><thead class="visually-hidden"><tr><th>Old line</th><th>New line</th><th>Code</th></tr></thead><tbody>${body}</tbody></table>`;
}

function splitTable(hunks) {
  const side = (l, which) => (l ? `<td class="diff-num diff-${SIGN[l.type]}">${which === 'old' ? l.oldNo : l.newNo}</td>${code(l).replace('<td class="diff-code">', `<td class="diff-code diff-${SIGN[l.type]}">`)}` : '<td class="diff-num diff-empty"></td><td class="diff-code diff-empty"></td>');
  const body = hunks.map((h) => `<tr class="diff-hunk"><td colspan="4">@@ −${h.oldStart} +${h.newStart} @@ ${esc(h.header)}</td></tr>`
    + splitRows(h.lines).map(([a, b]) => `<tr>${side(a, 'old')}${side(b, 'new')}</tr>`).join('')).join('');
  return `<table class="diff-table diff-split"><caption class="visually-hidden">Changes, side by side</caption><thead class="visually-hidden"><tr><th>Old line</th><th>Before</th><th>New line</th><th>After</th></tr></thead><tbody>${body}</tbody></table>`;
}

const stats = (hunks) => {
  const lines = hunks.flatMap((h) => h.lines);
  return { add: lines.filter((l) => l.type === '+').length, del: lines.filter((l) => l.type === '-').length };
};

/** The full HTML of a diff block. */
export async function diffBlockHtml(hunks, { lang, title } = {}) {
  await annotate(hunks, lang);
  const { add, del } = stats(hunks);
  const label = lang ? languageLabel(lang) : 'Diff';
  const toggle = (view, icon, text, pressed) => `<button type="button" class="diff-toggle" data-view="${view}" aria-pressed="${pressed}">${iconSvg(icon, { size: 18 })}<span>${text}</span></button>`;
  return `<figure class="code-block diff-block" data-diff data-view="split" data-language="${esc(lang || 'diff')}">`
    + `<figcaption class="code-head"><span class="code-lang">${esc(label)}</span>${title ? `<span class="code-title">${esc(title)}</span>` : ''}`
    + `<span class="diff-stats"><span class="diff-stat-add">+${add}</span> <span class="diff-stat-del">−${del}</span></span>`
    + `<span class="diff-toggles" role="group" aria-label="Diff view">${toggle('split', 'view_column_2', 'Split', true)}${toggle('unified', 'view_agenda', 'Unified', false)}</span></figcaption>`
    + `<div class="diff-view diff-view-split">${splitTable(hunks)}</div><div class="diff-view diff-view-unified" hidden>${unifiedTable(hunks)}</div></figure>`;
}

export { languageForFile };
