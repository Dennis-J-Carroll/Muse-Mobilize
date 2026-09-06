import { test, expect } from './fixtures';

test('Workbench parks companions, launches every tool, and preserves drafts through drawer and focus', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const question = page.getByPlaceholder('Ask Muse…');
  await question.fill('A question resting beside the atlas.');
  await expect(page.getByRole('button', { name: 'Workbench', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  const rail = page.getByRole('navigation', { name: 'Workbench tools', exact: true });
  await expect(rail).toBeVisible();
  await expect(question).toBeHidden();
  await expect(page.locator('.pane-editor textarea.draft')).toBeVisible();
  for (const name of ['Characters', 'World Building', 'Plot Outline', 'Scenes', 'Dialogue', 'Themes', 'References', 'Goals', 'Progress']) {
    await expect(rail.getByRole('button', { name: `Open ${name} in workbench`, exact: true })).toBeAttached();
  }
  await rail.getByRole('button', { name: 'Open World Building in workbench', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Parked workspace tools', exact: true });
  await expect(drawer.getByRole('button', { name: 'Move World Atlas', exact: true })).toBeVisible();
  await rail.getByRole('button', { name: 'Open Muse in workbench', exact: true }).click();
  await expect(question).toBeVisible();
  await expect(question).toHaveValue('A question resting beside the atlas.');
  await question.press('Escape');
  await expect(drawer).toBeHidden();
  await page.getByRole('button', { name: 'Open tool drawer', exact: true }).click();
  await drawer.getByRole('button', { name: 'Stack', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Move World Atlas', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close tool drawer', exact: true }).click();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await expect(rail).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(rail).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('workbench-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  await expect(rail).toHaveCount(0);
  await expect(question).toBeVisible();
  await expect(question).toHaveValue('A question resting beside the atlas.');
});

test('phone Workbench separates editor recall and keeps tool dragging keyboard-accessible', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Collapse tool menu', exact: true }).click();
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  const rail = page.getByRole('navigation', { name: 'Workbench tools', exact: true });
  await rail.getByRole('button', { name: 'Open Themes in workbench', exact: true }).click();
  const theme = page.locator('.pane-themes');
  const handle = theme.getByRole('button', { name: 'Move Theme Threads', exact: true });
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(handle).toBeFocused();
  const before = (await theme.boundingBox())!;
  await page.keyboard.press('ArrowDown');
  expect((await theme.boundingBox())!.y).toBeCloseTo(before.y + 5, 0);
  await theme.getByRole('button', { name: 'Minimize', exact: true }).click();
  await rail.getByRole('button', { name: 'Open Characters in workbench', exact: true }).click();
  await page.getByRole('button', { name: /Add character/ }).click();
  await page.getByPlaceholder('Character name').fill('Waiting in the lower drawer');
  await page.keyboard.press('Escape');
  const recall = page.getByRole('navigation', { name: 'Collapsed editors', exact: true });
  await expect(recall).toBeVisible();
  const railBox = (await rail.boundingBox())!;
  const recallBox = (await recall.boundingBox())!;
  expect(railBox.y + railBox.height).toBeLessThan(recallBox.y);
  await page.getByRole('button', { name: 'Close tool drawer', exact: true }).click();
  await page.getByRole('button', { name: 'Recall New character', exact: true }).click();
  await expect(page.getByPlaceholder('Character name')).toHaveValue('Waiting in the lower drawer');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('workbench-phone.png'), animations: 'disabled' });
});
