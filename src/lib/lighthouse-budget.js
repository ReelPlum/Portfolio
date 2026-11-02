// Byte budgets for Lighthouse results (scripts/lighthouse-budget.js, after `lhci collect`).
//
// Counts what each page downloads while loading, from the network requests Lighthouse saw, minus anything
// matching `exclude` (the semantic-search model and its runtime, which only download when someone
// searches by meaning). A page over its JavaScript or total budget fails.

/** Matches a budget key ("default", or a path like "search/") to a page URL. */
export function budgetFor(budget, url, base = '/') {
  const path = new URL(url).pathname;
  const rel = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, '');
  return { ...budget.pages.default, ...(budget.pages[rel] || {}), page: rel || '(home)' };
}

/** KB of JavaScript and in total that one Lighthouse run downloaded, leaving out excluded URLs. */
export function weigh(lhr, exclude = []) {
  const res = exclude.map((e) => new RegExp(e));
  const items = lhr.audits['network-requests']?.details?.items ?? [];
  let script = 0;
  let total = 0;
  const excluded = [];
  for (const item of items) {
    if (res.some((re) => re.test(item.url))) { excluded.push(item.url); continue; }
    const bytes = item.transferSize || 0;
    total += bytes;
    if (item.resourceType === 'Script') script += bytes;
  }
  return { script: script / 1024, total: total / 1024, excluded };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** Checks every page in a set of Lighthouse results; returns one line per page and the failures. */
export function checkBudgets(lhrs, budget, base = '/') {
  const byUrl = new Map();
  for (const lhr of lhrs) {
    const url = lhr.requestedUrl || lhr.finalDisplayedUrl;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(weigh(lhr, budget.exclude));
  }
  const lines = [];
  const failures = [];
  for (const [url, runs] of byUrl) {
    const limits = budgetFor(budget, url, base);
    const script = median(runs.map((r) => r.script));
    const total = median(runs.map((r) => r.total));
    lines.push(`${limits.page}: JavaScript ${script.toFixed(1)} / ${limits.script} KB, total ${total.toFixed(1)} / ${limits.total} KB`);
    if (script > limits.script) failures.push(`${limits.page} downloads ${script.toFixed(1)} KB of JavaScript (budget ${limits.script} KB)`);
    if (total > limits.total) failures.push(`${limits.page} downloads ${total.toFixed(1)} KB in total (budget ${limits.total} KB)`);
  }
  return { lines, failures };
}
