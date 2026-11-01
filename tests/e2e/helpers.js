import { expect } from '@playwright/test';

// Third-party players (YouTube, Vimeo) are stubbed so the tests don't depend on those services:
// Regression: Vimeo started redirecting the sample video's player to vimeo.com, whose
// X-Frame-Options error failed "renders without errors" although nothing on this site was wrong.
const THIRD_PARTY_EMBEDS = /^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//;

/** Fails the test on any console error or uncaught exception from this site. */
export async function trackErrors(page) {
  const errors = [];
  await page.route(THIRD_PARTY_EMBEDS, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { assertNone: () => expect(errors, errors.join('\n')).toEqual([]) };
}
