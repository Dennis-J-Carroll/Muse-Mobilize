import { test, expect } from './fixtures';

const column = (page: import('@playwright/test').Page) => page.locator('.pane-editor textarea.draft').evaluate((el: HTMLTextAreaElement) => {
  const style = getComputedStyle(el);
  return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
});

test('width presets change the text column, persist, and default stays unchanged', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  const standard = await column(page);
  await page.getByLabel('Page width').selectOption('90');
  const wide = await column(page);
  expect(wide).toBeGreaterThan(standard * 1.2);
  await page.getByLabel('Page width').selectOption('full');
  expect(await column(page)).toBeGreaterThan(1800);
  await page.getByLabel('Page width').selectOption('60');
  const narrow = await column(page);
  expect(narrow).toBeLessThan(standard);
  await page.reload();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await expect(page.getByLabel('Page width')).toHaveValue('60');
  expect(Math.abs((await column(page)) - narrow)).toBeLessThan(2);
  await page.getByLabel('Page width').selectOption('default');
  expect(Math.abs((await column(page)) - standard)).toBeLessThan(2);
});

test('garbage preference falls back to the default width', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.evaluate(() => localStorage.setItem('muse:writing-measure', 'abc'));
  await page.reload();
  await expect(page.getByLabel('Page width')).toHaveValue('default');
});
