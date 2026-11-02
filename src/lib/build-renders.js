// Astro integration: after the build, uses a headless Chromium (Playwright) to
//   - print /cv/ to dist/cv/<name>-cv.pdf
//   - draw a 1200×630 social preview image for every post (dist/og/posts/<id>.png),
//     and one for the rest of the site (dist/og/site.png)
//
// RENDERS=auto      (default) skip with a warning when Chromium isn't installed (`npx playwright install chromium`)
// RENDERS=required  fail the build instead (used by the deploy)
// RENDERS=off       skip
// PW_CHROMIUM=/path/to/chrome uses an existing Chromium.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ogCardHtml, ogImagePath } from './og.js';
import { cvPdfName } from './cv.js';
import site from '../../site.config.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.pdf': 'application/pdf' };

/** Serves dist/ under the site's base path on a random local port. */
export function serveDist(dir, base) {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!path.startsWith(base)) { res.writeHead(404).end(); return; }
    path = join(dir, path.slice(base.length));
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

async function launch() {
  const { chromium } = await import('playwright');
  return chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
}

const findFont = (dir) => readdirSync(join(dir, '_astro')).find((f) => /^roboto-flex-latin-wght-normal\..+\.woff2$/.test(f));

export function buildRenders({ base: rawBase = '/' } = {}) {
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return {
    name: 'build-renders',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const mode = process.env.RENDERS || 'auto';
        if (mode === 'off') return;
        const out = fileURLToPath(dir);
        let browser;
        try {
          browser = await launch();
        } catch (e) {
          const msg = `Chromium is not available, so the CV PDF and social preview images were skipped (${e.message.split('\n')[0]}). Run \`npx playwright install chromium\`.`;
          if (mode === 'required') throw new Error(msg);
          logger.warn(msg);
          removeCvLink(out);
          return;
        }
        const { server, origin } = await serveDist(out, base);
        try {
          await renderCv({ browser, origin, out, base, logger });
          await renderOgImages({ browser, out, base, logger });
        } finally {
          server.close();
          await browser.close();
        }
      },
    },
  };
}

/** Without a PDF, the CV page must not offer one. */
function removeCvLink(out) {
  const page = join(out, 'cv', 'index.html');
  if (existsSync(page)) writeFileSync(page, readFileSync(page, 'utf8').replace(/<a [^>]*data-cv-pdf[^>]*>[\s\S]*?<\/a>/, ''));
}

async function renderCv({ browser, origin, out, base, logger }) {
  const html = join(out, 'cv', 'index.html');
  if (!existsSync(html)) return;
  const name = /<h1[^>]*>([^<]+)<\/h1>/.exec(readFileSync(html, 'utf8'))?.[1] || site.author;
  const page = await browser.newPage();
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await page.goto(`${origin}${base}cv/`, { waitUntil: 'networkidle' });
  const file = join(out, 'cv', cvPdfName(name.trim()));
  await page.pdf({ path: file, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' } });
  await page.close();
  logger.info(`CV PDF: ${file.slice(out.length)}`);
}

async function renderOgImages({ browser, out, base, logger }) {
  const index = join(out, 'search-index.json');
  const docs = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : [];
  const font = findFont(out);
  const fontUrl = font ? `data:font/woff2;base64,${readFileSync(join(out, '_astro', font)).toString('base64')}` : null;
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const cards = [
    { path: ogImagePath(null), doc: { title: site.title, description: site.tagline, type: 'Site' } },
    ...docs.map((d) => ({ path: ogImagePath(d.id), doc: d })),
  ];
  for (const { path, doc } of cards) {
    await page.setContent(ogCardHtml(doc, { site, fontUrl }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const file = join(out, path.replace(/^\//, ''));
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'png' });
  }
  await page.close();
  logger.info(`Social preview images: ${cards.length}`);
}
