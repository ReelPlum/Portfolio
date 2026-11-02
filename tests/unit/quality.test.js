import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'yaml';
import { bundledThemes } from 'shiki';
import { contrast, readable, luminance } from '../../src/lib/contrast.js';
import { CODE_BACKGROUNDS, readableTheme, codeBlockHtml, highlightLines } from '../../src/lib/code-blocks.js';
import { weigh, budgetFor, checkBudgets } from '../../src/lib/lighthouse-budget.js';
import { renderPlotBlock } from '../../src/lib/plot.js';
import { parseFnPlot, fnPlotHtml } from '../../src/lib/live-vars.js';

const css = readFileSync('src/styles/base.css', 'utf8') + readFileSync('src/styles/site.css', 'utf8');

describe('contrast', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
    expect(contrast('#d73a49', '#f0f4f9')).toBeCloseTo(4.14, 2); // the colour Lighthouse flagged
    expect(luminance('#ffffff')).toBe(1);
  });

  it('darkens a colour on light backgrounds (lightens on dark ones) just enough to read', () => {
    const fixed = readable('#d73a49', ['#f0f4f9', '#fce8e6']);
    expect(Math.min(contrast(fixed, '#f0f4f9'), contrast(fixed, '#fce8e6'))).toBeGreaterThanOrEqual(4.5);
    expect(Math.min(contrast(fixed, '#f0f4f9'), contrast(fixed, '#fce8e6'))).toBeLessThan(5.2); // not more than needed
    expect(luminance(fixed)).toBeLessThan(luminance('#d73a49'));
    const light = readable('#6a737d', ['#1e1f20']);
    expect(contrast(light, '#1e1f20')).toBeGreaterThanOrEqual(4.5);
    expect(luminance(light)).toBeGreaterThan(luminance('#6a737d'));
    expect(readable('#000000', ['#ffffff'])).toBe('#000000'); // already fine: unchanged
  });
});

// Regression: Lighthouse found highlighted code below 4.5:1 (#d73a49 keywords on the code background,
// worse on diff lines).
describe('readable code colours', () => {
  const tokenColours = (theme) => (theme.tokenColors || []).filter((t) => t.settings?.foreground && !t.settings.background)
    .map((t) => t.settings.foreground).filter((c) => /^#[0-9a-f]{6}$/i.test(c));

  it('the code backgrounds match the stylesheets', () => {
    const value = (name, dark) => {
      const block = dark ? css.slice(css.indexOf('prefers-color-scheme: dark')) : css;
      return new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1].toLowerCase();
    };
    expect(CODE_BACKGROUNDS.light).toEqual([value('surface-container'), value('diff-add-bg'), value('diff-del-bg')]);
    const darkBase = /prefers-color-scheme: dark[\s\S]*?--surface-container:\s*(#[0-9a-f]{6})/i.exec(readFileSync('src/styles/base.css', 'utf8'))[1];
    const darkSite = readFileSync('src/styles/site.css', 'utf8').slice(readFileSync('src/styles/site.css', 'utf8').indexOf('--diff-add-bg: #16291c') - 200);
    expect(CODE_BACKGROUNDS.dark).toEqual([darkBase.toLowerCase(), /--diff-add-bg:\s*(#[0-9a-f]{6})/.exec(darkSite)[1], /--diff-del-bg:\s*(#[0-9a-f]{6})/.exec(darkSite)[1]]);
  });

  for (const [mode, name] of [['light', 'github-light'], ['dark', 'github-dark']]) {
    it(`every ${mode} token colour reaches 4.5:1 on every code background`, async () => {
      const original = (await bundledThemes[name]()).default;
      expect(tokenColours(original).some((c) => CODE_BACKGROUNDS[mode].some((b) => contrast(c, b) < 4.5))).toBe(true); // the theme alone fails
      const theme = readableTheme(original, CODE_BACKGROUNDS[mode]);
      for (const c of tokenColours(theme)) {
        for (const b of CODE_BACKGROUNDS[mode]) expect(contrast(c, b), `${c} on ${b}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(theme.colors['editor.foreground'], CODE_BACKGROUNDS[mode][0])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('rendered code blocks and diff lines use the readable colours', async () => {
    const html = await codeBlockHtml('fn main() { let x = 1; }', { lang: 'rust' });
    expect(html.toLowerCase()).not.toContain('color:#d73a49');
    const colours = [...html.matchAll(/(?<!-)color:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(2);
    for (const c of colours) expect(contrast(c, CODE_BACKGROUNDS.light[0]), c).toBeGreaterThanOrEqual(4.5);
    const darks = [...html.matchAll(/--shiki-dark:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
    for (const c of darks) expect(contrast(c, CODE_BACKGROUNDS.dark[0]), c).toBeGreaterThanOrEqual(4.5);
    const line = (await highlightLines('fn main() {}', 'rust'))[0];
    expect(line.toLowerCase()).not.toContain('#d73a49');
  });
});

describe('chart accessibility', () => {
  // Regression: Plot's aria-label on inner <g> elements is not allowed without a role (axe: aria-prohibited-attr).
  it('charts carry one label on the image, none on inner groups', () => {
    const html = renderPlotBlock('file: /files/visitors.csv\ntype: line\nx: Month\ny: Posts, Projects', { publicDirs: ['tests/fixtures/public'] });
    expect(html.match(/aria-label=/g)).toHaveLength(1);
    expect(html).toMatch(/<svg[^>]*aria-label="[^"]+"/);
    expect(html).toMatch(/<svg[^>]*role="img"/);
  });

  // Regression: the function plot legend was written in the series colour (2.8:1 for the green).
  it('function plot legends keep the colour on the swatch, not the text', () => {
    const plot = parseFnPlot('y: sin(x), cos(x)\nx: 0..pi');
    const html = fnPlotHtml(plot, {});
    expect(html).toContain('<li><span class="plot-swatch plot-swatch-line series-1" aria-hidden="true"></span><span>y = sin(x)</span></li>');
    expect(html).not.toMatch(/<li class="series-/);
  });
});

describe('Lighthouse budgets', () => {
  const lhr = (url, requests) => ({ requestedUrl: url, audits: { 'network-requests': { details: { items: requests } } } });
  const budget = { exclude: ['@huggingface', 'transformers', '\\.onnx($|\\?)'], pages: { default: { script: 25, total: 250 }, 'blog/big/': { script: 110, total: 450 } } };

  it('counts JavaScript and total bytes, leaving out the search model and its runtime', () => {
    const w = weigh(lhr('http://localhost/P/', [
      { url: 'http://localhost/P/_astro/page.js', resourceType: 'Script', transferSize: 10 * 1024 },
      { url: 'http://localhost/P/', resourceType: 'Document', transferSize: 20 * 1024 },
      { url: 'http://localhost/P/_astro/transformers.web.js', resourceType: 'Script', transferSize: 900 * 1024 },
      { url: 'https://huggingface.co/x/resolve/main/onnx/model_quantized.onnx', resourceType: 'Other', transferSize: 30000 * 1024 },
    ]), budget.exclude);
    expect(w.script).toBe(10);
    expect(w.total).toBe(30);
    expect(w.excluded).toHaveLength(2);
  });

  it('uses the page\'s own budget when there is one', () => {
    expect(budgetFor(budget, 'http://localhost:4400/P/blog/big/', '/P/')).toEqual({ script: 110, total: 450, page: 'blog/big/' });
    expect(budgetFor(budget, 'http://localhost:4400/P/', '/P/')).toEqual({ script: 25, total: 250, page: '(home)' });
  });

  it('fails a page over budget, judged on the middle of its runs', () => {
    const page = (kb) => lhr('http://localhost/P/', [{ url: 'http://localhost/P/a.js', resourceType: 'Script', transferSize: kb * 1024 }]);
    const ok = checkBudgets([page(10), page(30), page(12)], budget, '/P/'); // one slow outlier
    expect(ok.failures).toEqual([]);
    expect(ok.lines).toEqual(['(home): JavaScript 12.0 / 25 KB, total 12.0 / 250 KB']);
    const over = checkBudgets([page(26), page(27), page(28)], budget, '/P/');
    expect(over.failures).toEqual(['(home) downloads 27.0 KB of JavaScript (budget 25 KB)']);
  });

  it('the config measures home, a post, the feature tour and search, and the budget file covers them', () => {
    const require = createRequire(import.meta.url);
    const config = require('../../lighthouserc.cjs');
    const urls = config.ci.collect.url.map((u) => new URL(u).pathname);
    expect(urls).toEqual(['/Portfolio/', '/Portfolio/blog/how-a-tree-walking-interpreter-works/', '/Portfolio/blog/everything-this-site-can-do/', '/Portfolio/search/']);
    for (const u of urls.slice(1, 3)) expect(readFileSync(`src/content/blog/${u.split('/')[3]}.md`, 'utf8')).toBeTruthy();
    const matrix = config.ci.assert.assertMatrix;
    const all = matrix.find((m) => m.matchingUrlPattern === '.*').assertions;
    for (const c of ['performance', 'accessibility', 'best-practices']) expect(all[`categories:${c}`][0]).toBe('error');
    const seo = matrix.find((m) => m.assertions['categories:seo']);
    expect(new RegExp(seo.matchingUrlPattern).test('http://localhost:4400/Portfolio/search/')).toBe(false);
    expect(new RegExp(seo.matchingUrlPattern).test('http://localhost:4400/Portfolio/blog/x/')).toBe(true);
    const json = JSON.parse(readFileSync('lighthouse-budget.json', 'utf8'));
    expect(json.pages.default).toEqual({ script: expect.any(Number), total: expect.any(Number) });
    expect(json.exclude.some((e) => new RegExp(e).test('https://huggingface.co/m/resolve/main/onnx/model.onnx'))).toBe(true);
  });

  it('runs in CI before every deploy, keeping the reports', () => {
    const workflow = parse(readFileSync('.github/workflows/deploy.yml', 'utf8'));
    const job = workflow.jobs.lighthouse;
    expect(workflow.jobs.deploy.needs).toContain('lighthouse');
    const runs = job.steps.map((s) => s.run).filter(Boolean);
    expect(runs.indexOf('npm run build')).toBeLessThan(runs.indexOf('npm run lighthouse'));
    expect(job.steps.find((s) => s.run === 'npm run build').env.RENDERS).toBe('required');
    expect(job.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@')).if).toBe('always()');
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.lighthouse).toBe('lhci collect && lhci assert && node scripts/lighthouse-budget.js');
  });
});
