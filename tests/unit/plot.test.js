import { describe, it, expect } from 'vitest';
import { parsePlotSpec, splitColumns, loadRows, plotHtml, renderPlotBlock } from '../../src/lib/plot.js';

const csv = 'Month,Posts,Projects\n2026-06,120,80\n2026-07,150,95\n2026-08,140,\n';

describe('plot blocks', () => {
  it('reads the options', () => {
    expect(parsePlotSpec('file: /files/a.csv\ntype: bar\nx: Month\ny: Posts, Projects\ntitle: Visits\ny-label: Visitors')).toEqual({
      file: '/files/a.csv', type: 'bar', x: 'Month', y: ['Posts', 'Projects'], title: 'Visits', xLabel: 'Month', yLabel: 'Visitors', height: 360,
    });
    expect(parsePlotSpec('file: /a.csv\nx: a\ny: b').type).toBe('line');
    expect(parsePlotSpec('file: /a.csv\nx: a\ny: b').yLabel).toBe('b');
  });
  it('column names with commas can be quoted', () => {
    expect(splitColumns('"Score, out of 100", Other')).toEqual(['Score, out of 100', 'Other']);
  });
  it('explains what is wrong with a block', () => {
    expect(() => parsePlotSpec('x: a\ny: b')).toThrow('missing "file:"');
    expect(() => parsePlotSpec('file: /a.csv\ny: b')).toThrow('missing "x:"');
    expect(() => parsePlotSpec('file: /a.csv\nx: a')).toThrow('missing "y:"');
    expect(() => parsePlotSpec('file: /a.csv\nx: a\ny: b\ntype: pie')).toThrow('type must be line, bar, scatter (got "pie")');
    expect(() => parsePlotSpec('file: /a.csv\nx: a\ny: b, c, d, e')).toThrow(/at most 3 y columns/);
    expect(() => parsePlotSpec('file /a.csv')).toThrow('can\'t read "file /a.csv"');
  });
  it('loads rows: numbers, dates, and gaps for missing values', () => {
    const spec = parsePlotSpec('file: /a.csv\nx: Month\ny: Posts, Projects');
    const { rows, xKind } = loadRows(csv, spec);
    expect(xKind).toBe('date');
    expect(rows[0]).toEqual({ x: new Date('2026-06'), Posts: 120, Projects: 80 });
    expect(rows[2].Projects).toBeNull();
    expect(() => loadRows(csv, parsePlotSpec('file: /a.csv\nx: Month\ny: Nope'))).toThrow('no column "Nope" in /a.csv (columns: Month, Posts, Projects)');
    expect(() => loadRows('a,b\nx,1', parsePlotSpec('file: /a.csv\nx: a\ny: b\ntype: scatter'))).toThrow(/scatter plot needs numbers or dates/);
  });
  it('renders an accessible chart with a legend and a data table', () => {
    const spec = parsePlotSpec('file: /files/a.csv\nx: Month\ny: Posts, Projects\ntitle: Visits');
    const html = plotHtml(spec, loadRows(csv, spec), { href: '/Portfolio/files/a.csv' });
    expect(html).toContain('<figcaption class="plot-title">Visits</figcaption>');
    expect(html).toMatch(/<svg aria-label="Visits of Posts, Projects by Month" role="img"/);
    expect(html).toContain('<li><span class="plot-swatch plot-swatch-line series-1" aria-hidden="true"></span>Posts</li>');
    expect(html).toContain('class="series-2"');
    expect(html).toContain('<summary>Show the data</summary>');
    expect(html).toContain('<td>2026-06-01</td><td class="num">120</td><td class="num">80</td>');
    expect(html).toContain('<title>Posts\nMonth: 2026-06-01\n120</title>'); // hover text on each point
    expect(html).toContain('href="/Portfolio/files/a.csv"');
  });
  it('keeps categories in the order of the CSV', () => {
    const spec = parsePlotSpec('file: /a.csv\nx: Name\ny: A, B\ntype: bar');
    const html = plotHtml(spec, loadRows('Name,A,B\nzeta,1,2\nalpha,3,4\n', spec));
    expect(html.indexOf('>zeta<')).toBeLessThan(html.indexOf('>alpha<'));
    const single = parsePlotSpec('file: /a.csv\nx: Name\ny: A\ntype: bar');
    const html2 = plotHtml(single, loadRows('Name,A\nzeta,1\nalpha,3\n', single));
    expect(html2.indexOf('>zeta<')).toBeLessThan(html2.indexOf('>alpha<'));
  });
  it('a single series has no legend', () => {
    const spec = parsePlotSpec('file: /a.csv\nx: Month\ny: Posts\ntype: bar');
    expect(plotHtml(spec, loadRows(csv, spec))).not.toContain('plot-legend');
  });
  it('a missing CSV fails the build', () => {
    expect(() => renderPlotBlock('file: /files/nope.csv\nx: a\ny: b', { publicDirs: ['tests/fixtures/public'] })).toThrow('CSV file not found: /files/nope.csv. Put it in public/files/nope.csv');
  });
});
