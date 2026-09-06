import { test, expect } from './fixtures';

test('visual desk presets restore arrangement and survive reload without replacing live drafts', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const question = page.getByPlaceholder('Ask Muse…');
  await question.fill('A live question must survive desk switching.');
  await page.getByRole('button', { name: 'Collapse tool menu', exact: true }).click();
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  await page.getByLabel('Document tiles', { exact: true }).selectOption('columns');
  const manuscript = page.locator('.pane-editor');
  await page.getByLabel('Writing font', { exact: true }).selectOption('josefin-slab');
  await manuscript.getByRole('button', { name: 'Move Chapter One', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  const savedPosition = await manuscript.boundingBox();
  await expect(page.getByRole('button', { name: 'Saved desks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name', { exact: true }).fill('Atlas desk');
  await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Preview of Atlas desk', exact: true })).toBeVisible();
  // SVG paints later groups on top; the floating page must be above tiled notes.
  await expect(page.getByRole('img', { name: 'Preview of Atlas desk', exact: true }).locator('g').last()).toContainText('Chapter One');
  await page.screenshot({ path: testInfo.outputPath('saved-desks-preview.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Close saved desks', exact: true }).click();
  await manuscript.getByRole('button', { name: 'Return to layout', exact: true }).click();
  await page.getByLabel('Document tiles', { exact: true }).selectOption('rows');
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  await page.getByLabel('Writing font', { exact: true }).selectOption('inter');
  await page.getByRole('button', { name: 'Expand tool menu', exact: true }).click();
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByRole('button', { name: 'Restore Atlas desk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Workbench', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Expand tool menu', exact: true })).toBeVisible();
  await expect(page.getByLabel('Document tiles', { exact: true })).toHaveValue('columns');
  await expect(page.getByLabel('Writing font', { exact: true })).toHaveValue('josefin-slab');
  expect(await manuscript.boundingBox()).toEqual(savedPosition);
  await page.getByRole('button', { name: 'Open Muse in workbench', exact: true }).click();
  await expect(question).toHaveValue('A live question must survive desk switching.');
  await page.getByRole('button', { name: 'Close tool drawer', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByRole('button', { name: 'Restore Atlas desk', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Workbench tools', exact: true })).toBeVisible();
  await expect(page.getByLabel('Document tiles', { exact: true })).toHaveValue('columns');
  await expect(page.locator('.pane-editor')).toHaveCount(1);
  expect(await manuscript.boundingBox()).toEqual(savedPosition);
});

test('desk storage failure leaves existing previews intact and reports unsaved layout on phone', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name', { exact: true }).fill('First desk');
  await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore First desk', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('muse:desks:')) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByLabel('Desk name', { exact: true }).fill('Cannot save');
  await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('existing desks are unchanged');
  await expect(page.getByRole('button', { name: 'Restore First desk', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore Cannot save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close saved desks', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('saved-desks-phone.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Saved desks', exact: true })).toBeFocused();
});
