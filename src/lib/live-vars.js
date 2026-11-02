// Interactive sliders in posts.
//
//   ```vars
//   a = 1     range 0..5 step 0.1   Amplitude
//   k = 2     range 1..10 step 1    Frequency
//   ```
//   Inline value:   `=a`  or  `=a*k`          (inline code starting with "=")
//   In formulas:    $y = \var{a}\sin(\var{k}x)$
//   Function plot:  ```fnplot
//                   y: a*sin(k*x), a*cos(x)
//                   x: -6..6
//                   y-range: -5..5
//                   title: ...
//                   ```
// The page is built with the default values (so it reads fine without JavaScript); the browser updates
// every value, formula and plot as the sliders move (src/lib/live-vars-client.js).
import { visit } from 'unist-util-visit';
import katex from 'katex';
import { compile, variablesOf, formatNumber } from './expr.js';
import { macrosFrom } from './latex.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VAR_LINE = /^([A-Za-z_]\w*)\s*=\s*(-?[\d.]+)\s+range\s+(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)(?:\s+step\s+([\d.]+))?(?:\s+(.+))?$/;
export const VAR_TEX = /\\var\{([^{}]+)\}/g;

/** Parses a ```vars block into [{ name, value, min, max, step, label }]. */
export function parseVars(value) {
  return value.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = VAR_LINE.exec(line);
    if (!m) throw new Error(`Can't read "${line}". Write: name = 1 range 0..5 step 0.1 Label`);
    const [, name, v, min, max, step, label] = m;
    const out = { name, value: Number(v), min: Number(min), max: Number(max), step: step ? Number(step) : (Number(max) - Number(min)) / 100, label: label?.trim() || name };
    if (!(out.min < out.max)) throw new Error(`${name}: the range must go from low to high`);
    if (out.value < out.min || out.value > out.max) throw new Error(`${name}: ${out.value} is outside ${out.min}..${out.max}`);
    return out;
  });
}

export const decimalsOf = (step) => Math.min(4, (String(step).split('.')[1] || '').length);

export function varsHtml(vars) {
  return `<div class="live-vars" data-live-vars role="group" aria-label="Sliders">${vars.map((v) => {
    const id = `var-${v.name}`;
    return `<div class="live-var"><label for="${id}"><span class="live-var-label">${esc(v.label)}</span>${v.label !== v.name ? ` <var>${esc(v.name)}</var>` : ''}</label>`
      + `<input id="${id}" type="range" data-var="${esc(v.name)}" min="${v.min}" max="${v.max}" step="${v.step}" value="${v.value}" data-decimals="${decimalsOf(v.step)}" />`
      + `<output for="${id}" data-live-expr="${esc(v.name)}" data-decimals="${decimalsOf(v.step)}">${formatNumber(v.value, decimalsOf(v.step))}</output></div>`;
  }).join('')}</div>`;
}

/** Replaces \var{expr} in TeX with the current values. */
export function substituteTex(tex, values) {
  return tex.replace(VAR_TEX, (_, e) => {
    const v = compile(e)(values);
    return `{${formatNumber(v, 3).replace('−', '-')}}`;
  });
}

/* ---------- function plots ---------- */

export function parseFnPlot(value) {
  const spec = { height: 320 };
  for (const line of value.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = /^([a-z-]+)\s*:\s*(.+)$/i.exec(line);
    if (!m) throw new Error(`Can't read "${line}"`);
    spec[m[1].toLowerCase()] = m[2].trim();
  }
  if (!spec.y) throw new Error('A function plot needs "y: <expression in x>"');
  const range = (s, name) => {
    const parts = String(s).split('..');
    let lo, hi;
    try { [lo, hi] = parts.length === 2 ? parts.map((p) => compile(p.trim())({})) : []; } catch { lo = undefined; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) throw new Error(`${name} must look like -5..5 (low..high, numbers or pi)`);
    return [lo, hi];
  };
  const ys = spec.y.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  if (ys.length > 3) throw new Error('At most 3 functions per plot, so the colours stay distinguishable');
  return { ys, x: range(spec.x || '-5..5', 'x'), yRange: spec['y-range'] ? range(spec['y-range'], 'y-range') : null, title: spec.title || '', height: Number(spec.height) || 320 };
}

const W = 640;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

export function niceTicks(lo, hi, count = 6) {
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v);
  return out;
}

/** Samples the functions and returns the SVG parts that change with the sliders. */
export function fnPlotGeometry(plot, values, samples = 240) {
  const [x0, x1] = plot.x;
  const fns = plot.ys.map((y) => compile(y));
  const series = fns.map((f) => {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const x = x0 + ((x1 - x0) * i) / samples;
      let y;
      try { y = f({ ...values, x }); } catch { y = NaN; }
      pts.push([x, y]);
    }
    return pts;
  });
  let [y0, y1] = plot.yRange || [Infinity, -Infinity];
  if (!plot.yRange) {
    for (const s of series) for (const [, y] of s) if (Number.isFinite(y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (!Number.isFinite(y0)) [y0, y1] = [-1, 1];
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08;
    y0 -= pad; y1 += pad;
  }
  const H = plot.height;
  const sx = (x) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (y) => H - PAD.b - ((y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const paths = series.map((pts) => {
    let d = '';
    let pen = false;
    for (const [x, y] of pts) {
      if (!Number.isFinite(y) || y < y0 - (y1 - y0) * 4 || y > y1 + (y1 - y0) * 4) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
      pen = true;
    }
    return d;
  });
  const xt = niceTicks(x0, x1);
  const yt = niceTicks(y0, y1, 5);
  const grid = [
    ...yt.map((v) => `<line class="fn-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/><text class="fn-tick" x="${PAD.l - 6}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${formatNumber(v)}</text>`),
    ...xt.map((v) => `<text class="fn-tick" x="${sx(v).toFixed(1)}" y="${H - 8}" text-anchor="middle">${formatNumber(v)}</text>`),
    y0 < 0 && y1 > 0 ? `<line class="fn-axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(0).toFixed(1)}" y2="${sy(0).toFixed(1)}"/>` : '',
    x0 < 0 && x1 > 0 ? `<line class="fn-axis" x1="${sx(0).toFixed(1)}" x2="${sx(0).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}"/>` : '',
  ].join('');
  return { paths, grid, H };
}

export function fnPlotSvgInner(plot, values) {
  const { paths, grid } = fnPlotGeometry(plot, values);
  return `<g class="fn-grid-layer">${grid}</g>${paths.map((d, i) => `<path class="fn-line series-${i + 1}" d="${d}"/>`).join('')}`;
}

export function fnPlotHtml(plot, values) {
  const label = `Plot of ${plot.ys.map((y) => `y = ${y}`).join(' and ')} for x from ${formatNumber(plot.x[0])} to ${formatNumber(plot.x[1])}`;
  const legend = plot.ys.length > 1 ? `<ul class="plot-legend">${plot.ys.map((y, i) => `<li class="series-${i + 1}"><span class="plot-swatch plot-swatch-line"></span><span>y = ${esc(y)}</span></li>`).join('')}</ul>` : '';
  return `<figure class="plot fnplot" data-fnplot="${esc(JSON.stringify(plot))}">${plot.title ? `<figcaption class="plot-title">${esc(plot.title)}</figcaption>` : ''}${legend}`
    + `<svg class="fnplot-svg" viewBox="0 0 ${W} ${plot.height}" role="img" aria-label="${esc(label)}">${fnPlotSvgInner(plot, values)}</svg></figure>`;
}

/* ---------- the remark plugin ---------- */

export function remarkLiveVars() {
  return (tree, file) => {
    const where = file?.path ? ` (in ${file.path})` : '';
    const fail = (e) => { throw new Error(`Sliders: ${e.message}${where}`); };
    const vars = [];
    visit(tree, 'code', (node) => {
      if ((node.lang || '').toLowerCase() !== 'vars') return;
      try { vars.push(...parseVars(node.value)); } catch (e) { fail(e); }
    });
    const values = Object.fromEntries(vars.map((v) => [v.name, v.value]));
    const check = (src) => {
      for (const name of variablesOf(src)) if (name !== 'x' && !Object.hasOwn(values, name)) throw new Error(`"${name}" is not a slider. Declare it in a \`\`\`vars block`);
    };
    let used = vars.length > 0;
    visit(tree, 'code', (node, index, parent) => {
      const lang = (node.lang || '').toLowerCase();
      try {
        if (lang === 'vars') parent.children[index] = { type: 'html', value: varsHtml(parseVars(node.value)) };
        if (lang === 'fnplot') {
          const plot = parseFnPlot(node.value);
          plot.ys.forEach(check);
          parent.children[index] = { type: 'html', value: fnPlotHtml(plot, values) };
          used = true;
        }
      } catch (e) { fail(e); }
    });
    visit(tree, 'inlineCode', (node, index, parent) => {
      if (!node.value.startsWith('=') || !vars.length) return;
      const src = node.value.slice(1).trim();
      try {
        check(src);
        const v = compile(src)(values);
        parent.children[index] = { type: 'html', value: `<span class="live-value" data-live-expr="${esc(src)}">${formatNumber(v)}</span>` };
      } catch (e) { fail(e); }
    });
    const macros = () => macrosFrom(file.data.latexPreamble || '');
    let m;
    visit(tree, (node) => node.type === 'math' || node.type === 'inlineMath', (node, index, parent) => {
      VAR_TEX.lastIndex = 0;
      if (!VAR_TEX.test(node.value)) return;
      try {
        for (const [, e] of node.value.matchAll(VAR_TEX)) check(e);
        const display = node.type === 'math';
        m ??= macros();
        const html = katex.renderToString(substituteTex(node.value, values), { displayMode: display, throwOnError: false, macros: { ...m } });
        const tag = display ? 'div' : 'span';
        parent.children[index] = { type: 'html', value: `<${tag} class="live-math${display ? ' live-math-display' : ''}" data-tex="${esc(node.value)}">${html}</${tag}>` };
        used = true;
      } catch (e) { fail(e); }
    });
    if (used && file.data.latexPreamble) {
      tree.children.push({ type: 'html', value: `<script type="application/json" class="live-preamble">${JSON.stringify(file.data.latexPreamble).replace(/</g, '\\u003c')}</script>` });
    }
  };
}
