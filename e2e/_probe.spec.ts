import { test } from './fixtures';
test('probe menu stacking', async ({ page }) => {
  await page.locator('.pane-editor').getByPlaceholder('Start writing your story…').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Export document' }).click();
  const box = await page.getByRole('menuitem', { name: 'Markdown (.md)' }).boundingBox();
  console.log('MENUBOX ' + JSON.stringify(box));
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.tagName + '::' + el.className : 'none';
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  console.log('HIT ' + hit);
});
