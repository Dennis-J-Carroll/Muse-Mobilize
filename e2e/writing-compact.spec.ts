import { test, expect } from './fixtures';

test('header and writing tools fold away, Focus stays reachable, and zoom scales only the draft', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const draft = page.locator('.writing-page textarea.draft').first();
  await expect(draft).toBeVisible();

  await page.getByRole('button', { name: 'Collapse project header' }).click();
  await expect(page.locator('#workspace-heading-details')).toBeHidden();
  await expect(page.locator('.workspace-head').getByRole('button', { name: 'Keyboard shortcuts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand project header' }).click();
  await expect(page.locator('#workspace-heading-details')).toBeVisible();

  await page.getByRole('button', { name: 'Hide writing tools' }).click();
  await expect(page.locator('.writing-toolbar')).toBeHidden();
  await page.locator('.pane-head').getByRole('button', { name: 'Focus writing' }).click();
  await expect(page.locator('.app')).toHaveClass(/is-writing-focus/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.app')).not.toHaveClass(/is-writing-focus/);
  await page.getByRole('button', { name: 'Show writing tools' }).click();
  await expect(page.locator('.writing-toolbar')).toBeVisible();

  const size = () => draft.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const base = await size();
  await draft.focus();
  await page.keyboard.press('Control+Equal');
  await page.keyboard.press('Control+Equal');
  expect(await size()).toBeCloseTo(base * 1.2, 1);
  await expect(page.getByRole('button', { name: /Text zoom 120%/ })).toBeVisible();
  await page.keyboard.press('Control+Digit0');
  expect(await size()).toBeCloseTo(base, 1);

  const typewriter = page.getByRole('button', { name: 'Typewriter' });
  await typewriter.click();
  await expect(typewriter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.writing-page')).toHaveClass(/is-typewriter/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Typewriter' })).toHaveAttribute('aria-pressed', 'true');
});
