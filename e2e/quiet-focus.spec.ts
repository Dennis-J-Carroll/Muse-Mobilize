import { test, expect } from './fixtures';

test('hidden focus controls leave a full-height draft and return without changing selection', async ({ page, projectId }, testInfo) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await expect(draft).toHaveValue(/Chapter One/);
  await page.getByLabel('Writing font', { exact: true }).selectOption('times');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(12, 22); });
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await page.getByRole('button', { name: 'Hide writing controls', exact: true }).click();
  await expect(page.getByLabel('Writing font', { exact: true })).toBeHidden();
  await expect(page.getByText('Uses installed Times New Roman; otherwise a serif fallback.')).toBeHidden();
  await expect(draft).toBeFocused();
  expect(await draft.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([12, 22]);
  expect((await draft.boundingBox())!.height).toBeGreaterThan(page.viewportSize()!.height - 8);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Show writing controls', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('quiet-focus-phone.png') });
  await page.getByRole('button', { name: 'Show writing controls', exact: true }).click();
  await expect(page.getByLabel('Writing font', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide writing controls', exact: true }).click();
  await draft.press('Escape');
  await expect(page.getByLabel('Writing font', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await expect(page.getByLabel('Writing font', { exact: true })).toBeHidden();
});

test('browser fullscreen exits independently of writing focus and includes body overlays', async ({ page, projectId }) => {
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await page.getByRole('button', { name: 'Enter browser fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.getByRole('button', { name: 'Exit browser fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter browser fullscreen', exact: true }).click();
  // Browser-owned exit (Escape/F11) reports fullscreenchange, not an app exit.
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter browser fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Exit writing focus', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.getByRole('button', { name: 'Focus writing', exact: true })).toBeVisible();
});

test('denied fullscreen keeps focus and draft with an actionable fallback', async ({ page, projectId }) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Keep my writing when fullscreen is blocked.');
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  // Embedded browser policies may reject this browser boundary.
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')); });
  await page.getByRole('button', { name: 'Enter browser fullscreen', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'fullscreen' })).toContainText('browser');
  await expect(draft).toHaveValue('Keep my writing when fullscreen is blocked.');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide writing controls', exact: true }).click();
  await expect(draft).toBeFocused();
});
