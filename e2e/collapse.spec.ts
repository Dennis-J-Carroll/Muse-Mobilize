import { test, expect } from './fixtures';

test('collapsing the tool menu reclaims writing space without losing the draft', async ({ page, projectId }) => {
  const manuscript = page.locator('.pane-editor').getByPlaceholder('Start writing your story…');
  await expect(manuscript).toHaveValue(/\S/);
  const original = `${await manuscript.inputValue()}\nSidebar collapse draft ${projectId}`;
  await manuscript.fill(original);
  const before = await page.locator('main.workspace').boundingBox();
  await page.getByRole('button', { name: 'Collapse tool menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand tool menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect((await page.locator('main.workspace').boundingBox())!.width).toBeGreaterThan(before!.width + 150);
  await expect(manuscript).toHaveValue(original);
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('button', { name: 'Expand tool menu', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Themes / })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const expanded = await page.locator('main.workspace').boundingBox();
  await page.getByRole('button', { name: 'Collapse tool menu', exact: true }).click();
  expect((await page.locator('main.workspace').boundingBox())!.height).toBeGreaterThan(expanded!.height + 50);
  await expect(manuscript).toHaveValue(original);
});
