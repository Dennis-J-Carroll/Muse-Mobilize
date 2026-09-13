import { test, expect } from './fixtures';
test('probe menu stacking', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await expect(page.locator('.pane-editor').getByPlaceholder('Start writing your story…')).toBeVisible();
  await page.getByRole('button', { name: 'Export document' }).click();
  const box = await page.getByRole('menuitem', { name: 'Markdown (.md)' }).boundingBox();
  if (!box) throw new Error('Export menu item has no visible bounds');
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[role="menuitem"]')?.textContent;
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(hit).toBe('Markdown (.md)');
});
