import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test.describe('WASM playground', () => {
  test('runs the program and shows what it printed', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('projects/tiny-calc/');
    await page.getByRole('button', { name: 'Run' }).click();
    const out = page.locator('[data-pg-output]');
    await expect(out.locator('.pg-out')).toHaveText(['Area:', '42']);
    await expect(out.locator('.pg-meta')).toContainText('exited with code 0');
    errors.assertNone();
  });

  test('shows errors from stderr', async ({ page }) => {
    await page.goto('projects/tiny-calc/');
    await page.locator('[data-pg-examples]').selectOption({ label: 'Errors' });
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('.pg-err')).toHaveText('line 2: division by zero');
    await expect(page.locator('.pg-meta')).toContainText('exited with code 1');
  });

  test('runs edited code with Ctrl+Enter, and reset restores the example', async ({ page }) => {
    await page.goto('projects/tiny-calc/');
    const editor = page.getByRole('textbox', { name: 'Code' });
    const original = await editor.inputValue();
    await editor.fill('print 2 + 2');
    await editor.press('Control+Enter');
    await expect(page.locator('.pg-out')).toHaveText(['4']);
    await page.getByRole('button', { name: 'Reset code' }).click();
    await expect(editor).toHaveValue(original);
    await expect(page.locator('.pg-out')).toHaveCount(0);
  });

  test('Tab indents instead of leaving the editor', async ({ page }) => {
    await page.goto('projects/tiny-calc/');
    const editor = page.getByRole('textbox', { name: 'Code' });
    await editor.fill('');
    await editor.press('Tab');
    await expect(editor).toHaveValue('  ');
    await expect(editor).toBeFocused();
  });

  test('copy puts the code on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('projects/tiny-calc/');
    await page.getByRole('textbox', { name: 'Code' }).fill('print 1');
    await page.getByRole('button', { name: 'Copy code' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('print 1');
  });

  test('shows "coming soon" until the interpreter build is added', async ({ page }) => {
    await page.goto('projects/interpreter/');
    await expect(page.getByText('Playground coming soon')).toBeVisible();
    await expect(page.locator('[data-pg-run]')).toHaveCount(0);
  });
});
