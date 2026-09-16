import { test, expect } from './fixtures';

test.use({ isMobile: true, hasTouch: true });

test('phone workspace controls form paired rows and empty guidance follows card position', async ({ page, request, projectId }, testInfo) => {
  expect(projectId).toBeTruthy();
  const response = await request.post('/api/projects', { data: { name: 'KB' } });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'KB', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'KB', level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });

  const rows = [
    [page.locator('.tile-picker'), page.locator('.document-picker')],
    [page.getByRole('button', { name: 'Undo saved change' }), page.getByRole('button', { name: 'Redo saved change' })],
    [page.getByRole('button', { name: 'Saved desks' }), page.getByRole('button', { name: 'Open connections' })],
    [page.getByRole('button', { name: 'Project backups' }), page.getByRole('button', { name: 'Workbench', exact: true })],
  ] as const;

  let previousBottom = 0;
  for (const [left, right] of rows) {
    const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
    expect(leftBox).not.toBeNull();
    expect(rightBox).not.toBeNull();
    expect(Math.abs(leftBox!.y - rightBox!.y)).toBeLessThan(1);
    expect(Math.abs(leftBox!.width - rightBox!.width)).toBeLessThan(1);
    expect(leftBox!.y).toBeGreaterThanOrEqual(previousBottom);
    previousBottom = leftBox!.y + leftBox!.height;
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('main.workspace').evaluate((workspace) => workspace.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('mobile-toolbar-fixed.png'), animations: 'disabled' });

  const paneClose = page.locator('.pane-tools').getByTitle('Close', { exact: true });
  while (await paneClose.count()) await paneClose.first().click();
  const empty = page.locator('.workspace-empty-message');
  await expect(empty).toContainText('Use the cards above to bring your ideas to life.');
  await page.locator('main.workspace').evaluate((workspace) => workspace.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('mobile-empty-state-fixed.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 900, height: 844 });
  await expect(empty).toContainText('Use the cards on the left to bring your ideas to life.');
});
