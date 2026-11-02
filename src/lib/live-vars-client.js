// Moves every live value, formula and function plot when a slider changes. Loaded only on pages with sliders.
import katex from 'katex';
import { compile, formatNumber } from './expr.js';
import { substituteTex, fnPlotSvgInner } from './live-vars.js';
import { macrosFrom } from './latex.js';

export function setupLiveVars() {
  const inputs = [...document.querySelectorAll('input[data-var]')];
  const values = Object.fromEntries(inputs.map((i) => [i.dataset.var, Number(i.value)]));
  const preamble = document.querySelector('.live-preamble');
  const macros = preamble ? macrosFrom(JSON.parse(preamble.textContent)) : {};
  const exprs = [...document.querySelectorAll('[data-live-expr]')].map((el) => ({ el, f: compile(el.dataset.liveExpr), digits: Number(el.dataset.decimals ?? 2) }));
  const maths = [...document.querySelectorAll('.live-math')];
  const plots = [...document.querySelectorAll('[data-fnplot]')].map((el) => ({ svg: el.querySelector('svg'), plot: JSON.parse(el.dataset.fnplot) }));

  const update = () => {
    for (const { el, f, digits } of exprs) {
      let v;
      try { v = f(values); } catch { v = NaN; }
      el.textContent = formatNumber(v, digits);
    }
    for (const el of maths) {
      katex.render(substituteTex(el.dataset.tex, values), el, { displayMode: el.classList.contains('live-math-display'), throwOnError: false, macros: { ...macros } });
    }
    for (const { svg, plot } of plots) svg.innerHTML = fnPlotSvgInner(plot, values);
  };
  for (const input of inputs) {
    input.addEventListener('input', () => {
      values[input.dataset.var] = Number(input.value);
      for (const other of inputs) if (other !== input && other.dataset.var === input.dataset.var) other.value = input.value;
      update();
    });
  }
  document.documentElement.dataset.liveVars = 'ready';
}
