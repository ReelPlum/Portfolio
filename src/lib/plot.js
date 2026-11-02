// Charts from CSV files, drawn when the site is built (no JavaScript needed to see them):
//
//   ```plot
//   file: /files/benchmarks.csv
//   type: bar                      line, bar or scatter
//   x: Program
//   y: Tree-walking (ms), Bytecode (ms)
//   title: Run time per program
//   y-label: Milliseconds
//   ```
//
// Each y column is a series. Series colours come from CSS (--series-1..3), so they switch with light and
// dark mode. Every chart has a legend (2+ series), hover titles on each point and a "Show the data" table.
import * as Plot from '@observablehq/plot';
import { parseHTML } from 'linkedom';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './code-blocks.js';

export const PLOT_TYPES = ['line', 'bar', 'scatter'];
export const MAX_SERIES = 3; // the palette's first three colours stay distinguishable for everyone

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Reads the `key: value` lines of a plot block. */
export function parsePlotSpec(text) {
  const spec = {};
  for (const line of String(text).split('\n')) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (m) spec[m[1].toLowerCase()] = m[2];
    else if (line.trim() && !line.trim().startsWith('#')) throw new Error(`can't read "${line.trim()}" (write key: value)`);
  }
  const type = (spec.type || 'line').toLowerCase();
  if (!PLOT_TYPES.includes(type)) throw new Error(`type must be ${PLOT_TYPES.join(', ')} (got "${spec.type}")`);
  if (!spec.file) throw new Error('missing "file:" (the CSV file, e.g. /files/data.csv)');
  if (!spec.x) throw new Error('missing "x:" (the column for the horizontal axis)');
  if (!spec.y) throw new Error('missing "y:" (one or more columns, separated by commas)');
  const y = splitColumns(spec.y);
  if (y.length > MAX_SERIES) throw new Error(`at most ${MAX_SERIES} y columns per chart, so the colours stay easy to tell apart (got ${y.length}); split it into more charts`);
  const height = spec.height ? Number(spec.height) : 360;
  return { file: spec.file, type, x: spec.x, y, title: spec.title || '', xLabel: spec['x-label'] ?? spec.x, yLabel: spec['y-label'] ?? (y.length === 1 ? y[0] : ''), height: Math.min(Math.max(height || 360, 160), 900) };
}

/** Splits "a, b, \"c, with comma\"" into column names. */
export function splitColumns(s) {
  return parseCsv(String(s).trim())[0]?.map((c) => c.trim()).filter(Boolean) ?? [];
}

const num = (v) => {
  const t = String(v ?? '').trim().replace(/,/g, '');
  return t !== '' && Number.isFinite(Number(t)) ? Number(t) : null;
};
const isDate = (v) => /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+Z?)?$/.test(String(v).trim());

/** Rows of the CSV as objects, with numbers and dates converted. */
export function loadRows(csvText, spec) {
  const [head = [], ...body] = parseCsv(csvText);
  const cols = head.map((h) => h.trim());
  for (const c of [spec.x, ...spec.y]) {
    if (!cols.includes(c)) throw new Error(`no column "${c}" in ${spec.file} (columns: ${cols.join(', ')})`);
  }
  const xi = cols.indexOf(spec.x);
  const xs = body.map((r) => r[xi]);
  const xKind = xs.every((v) => num(v) !== null) ? 'number' : xs.every(isDate) ? 'date' : 'text';
  if (spec.type === 'scatter' && xKind === 'text') throw new Error(`a scatter plot needs numbers or dates in "${spec.x}"`);
  return {
    xKind,
    rows: body.map((r) => {
      const o = { x: xKind === 'number' ? num(r[xi]) : xKind === 'date' ? new Date(r[xi]) : r[xi] };
      for (const c of spec.y) {
        const v = num(r[cols.indexOf(c)]);
        o[c] = v;
      }
      return o;
    }),
  };
}

// A few dates (e.g. monthly rows) get one tick per row, labelled by month, instead of day-of-month ticks.
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function dateTicks(rows, xKind) {
  if (xKind !== 'date' || rows.length > 12) return {};
  const monthly = rows.every((r) => r.x.getUTCDate() === 1);
  return { ticks: rows.map((r) => r.x), tickFormat: (d) => (monthly ? MONTH : DAY).format(d) };
}

const fmtX = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

/** The SVG for a chart (light/dark colours are applied by CSS through the series-N classes). */
export function plotSvg(spec, { rows, xKind }) {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const series = spec.y.map((name, i) => ({ name, cls: `series-${i + 1}` }));
  const tip = (s) => (d) => `${s.name}\n${spec.x}: ${fmtX(d.x)}\n${d[s.name]}`;
  const marks = [Plot.gridY({ strokeOpacity: 0.12 })];
  if (spec.type !== 'scatter') marks.push(Plot.ruleY([0], { strokeOpacity: 0.35 }));
  const long = [];
  for (const s of series) for (const r of rows) if (r[s.name] != null) long.push({ ...r, series: s.name, value: r[s.name] });
  if (spec.type === 'bar') {
    const grouped = series.length > 1;
    for (const s of series) {
      const data = long.filter((d) => d.series === s.name);
      marks.push(Plot.barY(data, {
        x: grouped ? 'series' : 'x', fx: grouped ? 'x' : undefined, y: 'value',
        className: s.cls, fill: 'currentColor', rx: 4, insetLeft: 1, insetRight: 1, title: tip(s),
      }));
    }
  } else {
    for (const s of series) {
      const data = long.filter((d) => d.series === s.name);
      if (spec.type === 'line') marks.push(Plot.lineY(data, { x: 'x', y: 'value', className: s.cls, stroke: 'currentColor', strokeWidth: 2 }));
      marks.push(Plot.dot(data, {
        x: 'x', y: 'value', className: s.cls, fill: 'currentColor', r: spec.type === 'line' ? 4 : 5,
        stroke: 'white', strokeWidth: 2, title: tip(s),
      }));
    }
  }
  const grouped = spec.type === 'bar' && series.length > 1;
  // Categories stay in the order of the CSV rather than being sorted.
  const order = [...new Set(rows.map((r) => r.x))];
  const svg = Plot.plot({
    document,
    height: spec.height,
    width: 800,
    marginLeft: 56,
    marginBottom: 44,
    inset: spec.type === 'bar' ? 0 : 10,
    style: { fontFamily: 'inherit', fontSize: '13px', background: 'transparent' },
    x: grouped ? { axis: null, domain: spec.y } : { ...dateTicks(rows, xKind), ...(xKind === 'text' ? { domain: order } : {}), label: spec.xLabel, type: xKind === 'text' ? (spec.type === 'bar' ? 'band' : 'point') : undefined, padding: spec.type === 'bar' ? 0.25 : undefined, labelAnchor: 'center', labelArrow: 'none' },
    fx: grouped ? { label: spec.xLabel, padding: 0.2, labelAnchor: 'center', domain: order } : undefined,
    y: { label: spec.yLabel, grid: false, nice: true, zero: spec.type !== 'scatter', labelArrow: 'none' },
    marks,
  });
  // The chart is one image with one label; Plot's labels on inner groups ("line", "rule") aren't allowed on
  // a <g> without a role, and screen readers wouldn't read them inside role="img" anyway.
  svg.querySelectorAll('[aria-label]').forEach((el) => el.removeAttribute('aria-label'));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${spec.title || `${spec.type} chart`} of ${spec.y.join(', ')} by ${spec.x}`);
  return svg.outerHTML;
}

/** The full figure: title, legend, chart and a data table. */
export function plotHtml(spec, data, { href } = {}) {
  const legend = spec.y.length > 1
    ? `<ul class="plot-legend">${spec.y.map((n, i) => `<li><span class="plot-swatch plot-swatch-${spec.type} series-${i + 1}" aria-hidden="true"></span>${esc(n)}</li>`).join('')}</ul>`
    : '';
  const table = `<details class="plot-data"><summary>Show the data</summary><div class="table-scroll" tabindex="0"><table><thead><tr><th>${esc(spec.x)}</th>${spec.y.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>`
    + `<tbody>${data.rows.map((r) => `<tr><td>${esc(fmtX(r.x))}</td>${spec.y.map((c) => `<td class="num">${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    + `${href ? `<p class="plot-source">From <a href="${esc(href)}">${esc(spec.file.split('/').pop())}</a></p>` : ''}</details>`;
  return `<figure class="plot plot-${spec.type}" data-plot>${spec.title ? `<figcaption class="plot-title">${esc(spec.title)}</figcaption>` : ''}${legend}<div class="plot-chart">${plotSvg(spec, data)}</div>${table}</figure>`;
}

/** Reads the CSV from public/ and renders the chart. Errors name the post and the problem. */
export function renderPlotBlock(text, { publicDirs = ['public'], hrefFor = (p) => p } = {}) {
  const spec = parsePlotSpec(text);
  const dir = publicDirs.find((d) => existsSync(join(d, spec.file)));
  if (!dir) throw new Error(`CSV file not found: ${spec.file}. Put it in public${spec.file}`);
  const data = loadRows(readFileSync(join(dir, spec.file), 'utf8'), spec);
  return plotHtml(spec, data, { href: hrefFor(spec.file) });
}
