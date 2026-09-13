import { test, expect, openTool } from './fixtures';

test('a pane can expand to full workspace and Escape restores it', async ({ page, projectId }) => {
  void projectId;
  await page.getByRole('button', { name: /Expand/ }).first().click();
  // Expanded pane fills the workspace; the control becomes Restore.
  await expect(page.getByRole('button', { name: /Restore/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Expand/ }).first()).toBeVisible();
});

test('Quick Export downloads markdown and plain text from the editor toolbar', async ({ page, projectId }) => {
  void projectId;
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export document' }).click();
  await page.getByRole('menuitem', { name: 'Markdown (.md)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const path = await download.path();
  expect(path).toBeTruthy();

  const txtPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export document' }).click();
  await page.getByRole('menuitem', { name: 'Plain text (.txt)' }).click();
  const txt = await txtPromise;
  expect(txt.suggestedFilename()).toMatch(/\.txt$/);
});
