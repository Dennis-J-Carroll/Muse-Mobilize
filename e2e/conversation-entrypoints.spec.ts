import { test, expect, openTool } from './fixtures';

test('selection Ask opens a visible conversation without losing the selected manuscript', async ({ page, projectId }) => {
  const draft = page.locator('.pane-editor textarea.draft');
  const value = await draft.inputValue();
  await draft.focus();
  await page.locator('.pane-editor').getByRole('button', { name: 'Expand Chapter One to full workspace', exact: true }).click();
  await draft.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+ArrowRight');
  await page.locator('.ask-agents').getByRole('button', { name: 'Muse', exact: true }).click();
  const conversation = page.getByRole('region', { name: 'Muse conversation', exact: true });
  await expect(conversation).toBeVisible();
  await expect(conversation.locator('.run-text')).toBeVisible();
  await expect(draft).toHaveValue(value);
  await expect(page.locator('.pane-editor')).toHaveClass(/pane-maximized/);
});

test('Sources Ask reveals Muse above the expanded source search and keeps the search', async ({ page, projectId }) => {
  await openTool(page, 'Sources');
  await page.getByLabel('Choose source files').setInputFiles({ name: 'trial-notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Trial notes\n\nThe crossing opens only at the new moon.') });
  await page.getByLabel('Search story material').fill('new moon crossing');
  await page.getByRole('button', { name: 'Ask Muse about this', exact: true }).first().click();
  const conversation = page.getByRole('region', { name: 'Muse conversation', exact: true });
  await expect(conversation).toBeVisible();
  await expect(conversation.locator('.run-text')).toBeVisible();
  await expect(page.locator('.pane-sources')).toHaveClass(/pane-maximized/);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Search story material')).toHaveValue('new moon crossing');
});
