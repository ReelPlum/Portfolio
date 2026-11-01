import { expect } from '@playwright/test';

/** Fails the test on any console error or uncaught exception. */
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { assertNone: () => expect(errors, errors.join('\n')).toEqual([]) };
}
