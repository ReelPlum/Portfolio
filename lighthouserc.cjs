// Lighthouse CI: npm run lighthouse (after npm run build).
// Each page is measured three times on an emulated phone and the middle run counts. Scores below these
// fail the check; so do the byte budgets in lighthouse-budget.json (checked by scripts/lighthouse-budget.js,
// which leaves out the search model that only downloads when someone searches by meaning).
const PORT = 4400;
const base = process.env.BASE_PATH || '/Portfolio/';
const url = (p) => `http://localhost:${PORT}${base}${p}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `npx astro preview --port ${PORT} --ignore-lock`,
      startServerReadyPattern: `localhost:${PORT}`,
      url: [url(''), url('blog/how-a-tree-walking-interpreter-works/'), url('blog/everything-this-site-can-do/'), url('search/')],
      numberOfRuns: 3,
      settings: {
        // The chrome flags CI containers need.
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertMatrix: [
        { matchingUrlPattern: '.*', aggregationMethod: 'median-run', assertions: {
          'categories:performance': ['error', { minScore: 0.9 }],
          'categories:accessibility': ['error', { minScore: 1 }],
          'categories:best-practices': ['error', { minScore: 1 }],
        } },
        // The search page is kept out of search engines on purpose (noindex), which costs it the
        // "is crawlable" part of the SEO score; every other SEO check still has to pass.
        { matchingUrlPattern: '^(?!.*/search/$)', aggregationMethod: 'median-run', assertions: { 'categories:seo': ['error', { minScore: 1 }] } },
        { matchingUrlPattern: '/search/$', aggregationMethod: 'median-run', assertions: Object.fromEntries(
          ['document-title', 'meta-description', 'http-status-code', 'link-text', 'crawlable-anchors', 'robots-txt', 'hreflang', 'canonical', 'image-alt']
            .map((id) => [id, ['error', { minScore: 1 }]]),
        ) },
      ],
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
