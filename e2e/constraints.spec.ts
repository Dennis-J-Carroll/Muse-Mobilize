import { test, expect } from './fixtures';

const openGenerator = async (page: import('@playwright/test').Page) => {
  await page.locator('.cards').getByRole('button', { name: /^Story Idea\b/ }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Constraint Generator' }).click();
};

test('constraints roll from canon, lock, pin over the draft, persist ticks, and unpin', async ({ page, request, projectId }) => {
  for (const [type, name] of [['character', 'Mara'], ['location', 'Tonnell'], ['object', 'the war hammer']]) {
    expect((await request.post(`/api/projects/${projectId}/canon/entities`, { data: { type, name } })).ok()).toBeTruthy();
  }
  await page.reload();
  await openGenerator(page);
  const rows = page.getByRole('list', { name: 'Rolled constraints' }).getByRole('listitem');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText("Tell it from Mara's point of view.");
  await expect(rows.nth(1)).toContainText('Set it in Tonnell.');
  await expect(rows.nth(2)).toContainText(/war hammer/i);
  await expect(page.getByRole('status').filter({ hasText: 'Not pinned' })).toBeVisible();

  const restriction = await rows.nth(3).locator('p').textContent();
  await page.getByRole('button', { name: 'Lock Restriction' }).click();
  await expect(page.getByRole('button', { name: 'Lock Restriction' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reroll all' }).click();
  await expect(rows.nth(3).locator('p')).toHaveText(restriction!);

  await page.getByRole('button', { name: 'Pin to draft' }).click();
  // Pinning docks the generator so the manuscript comes forward.
  await expect(page.getByRole('list', { name: 'Rolled constraints' })).toBeHidden();

  const banner = page.getByRole('group', { name: 'Pinned constraints' }).first();
  await expect(banner.getByRole('checkbox')).toHaveCount(5);
  await expect(banner).toContainText(restriction!);
  await banner.getByRole('checkbox').first().check();

  await page.reload();
  const reloaded = page.getByRole('group', { name: 'Pinned constraints' }).first();
  await expect(reloaded.getByRole('checkbox').first()).toBeChecked();
  await expect(reloaded).toContainText(restriction!);

  await page.getByRole('button', { name: 'Roll constraints' }).first().click();
  await expect(reloaded.getByRole('checkbox').first()).not.toBeChecked();
  await expect(reloaded.getByRole('checkbox')).toHaveCount(5);

  await reloaded.getByRole('button', { name: 'Unpin constraints' }).click();
  await expect(page.getByRole('group', { name: 'Pinned constraints' })).toHaveCount(0);
});

test('constraints pane and banner stay inside a phone viewport', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await openGenerator(page);
  const pinButton = page.getByRole('button', { name: 'Pin to draft' });
  for (const name of ['Reroll all', 'Lock Point of view', 'Reroll Pressure', 'Pin to draft']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await pinButton.click();
  await expect(page.getByRole('group', { name: 'Pinned constraints' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const banner = (await page.getByRole('group', { name: 'Pinned constraints' }).first().boundingBox())!;
  expect(banner.x + banner.width).toBeLessThanOrEqual(390);
});
