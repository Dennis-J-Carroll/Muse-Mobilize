import { test, expect } from './fixtures';

test('premise builder composes, promotes without losing text, keeps Muse what-ifs, and survives reload', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.locator('.cards').getByRole('button', { name: /^Story Idea\b/ }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Premise Builder' }).click();
  const pane = page.locator('.premise-workspace');
  await expect(pane.getByRole('heading', { name: 'Premise', exact: true })).toBeVisible();

  await pane.getByLabel('Protagonist').fill('Traven');
  await pane.getByLabel('Wants').fill('to keep his oath');
  await pane.getByLabel('Obstacle').fill('Creedies Hjaar');
  const logline = 'When Traven wants to keep his oath, Creedies Hjaar stands in the way.';
  await expect(pane.locator('.premise-logline')).toHaveText(logline);
  await pane.getByRole('button', { name: 'Use as working premise' }).click();
  await expect(pane.getByRole('textbox', { name: 'Working premise' })).toHaveValue(logline);

  await page.reload();
  await page.locator('.cards').getByRole('button', { name: /^Story Idea\b/ }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Premise Builder' }).click();
  await expect(pane.getByRole('textbox', { name: 'Working premise' })).toHaveValue(logline);
  await expect(pane.getByLabel('Protagonist')).toHaveValue('Traven');

  await pane.getByRole('button', { name: 'Ask Muse for 3 what-ifs' }).click();
  const cards = pane.getByRole('list', { name: 'Muse what-ifs' }).getByRole('listitem');
  await expect(cards).toHaveCount(3);
  const lead = 'What if When Traven wants to keep his oath, Creedies Hjaar stands in the way…';
  await expect(cards.nth(0)).toContainText(`${lead} but the ally is the obstacle?`);

  await cards.nth(0).getByRole('button', { name: 'Keep' }).click();
  await cards.nth(0).getByRole('button', { name: 'Promote' }).click(); // the former second card
  await expect(cards).toHaveCount(1);
  await expect(pane.getByRole('textbox', { name: 'Working premise' })).toHaveValue(`${lead} but winning costs the thing they wanted?`);

  const variants = pane.getByRole('list', { name: 'Premise variants' }).getByRole('listitem');
  await expect(variants).toHaveCount(2);
  await expect(variants.filter({ hasText: logline }).first()).toContainText('Yours');
  await expect(variants.filter({ hasText: 'the ally is the obstacle' })).toContainText('Muse');

  await page.reload();
  await page.locator('.cards').getByRole('button', { name: /^Story Idea\b/ }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Premise Builder' }).click();
  await expect(variants).toHaveCount(2);
});

test('premise pane stays inside a phone viewport', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.cards').getByRole('button', { name: /^Story Idea\b/ }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Premise Builder' }).click();
  const pane = page.locator('.premise-workspace');
  await expect(pane.getByRole('textbox', { name: 'Working premise' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const name of ['Use as working premise', 'Save as variant', 'Ask Muse for 3 what-ifs']) {
    const box = (await pane.getByRole('button', { name }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});
