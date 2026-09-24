import { test, expect } from './fixtures';

const long = Array.from({ length: 400 }, (_, i) => `Line ${i + 1} of the long chapter, steady and plain.`).join('\n');

test('Alt+Shift+F toggles focus and keeps caret and scroll position', async ({ page, request, projectId }) => {
  const { project } = await (await request.get(`/api/projects/${projectId}`)).json();
  const doc = project.documents.find((d: { kind: string }) => d.kind === 'manuscript');
  await request.put(`/api/projects/${projectId}/documents/${doc.id}`, { data: { content: long, log: false } });
  await page.reload();
  const draft = page.locator('.pane-editor textarea.draft');
  await expect(draft).toHaveValue(/Line 400/);
  const caret = long.indexOf('Line 200 ');
  await draft.evaluate((el: HTMLTextAreaElement, at: number) => { el.focus(); el.setSelectionRange(at, at + 8); el.scrollTop = el.scrollHeight * 0.5 - el.clientHeight / 2; }, caret);
  const fraction = () => draft.evaluate((el: HTMLTextAreaElement) => el.scrollTop / el.scrollHeight);
  const before = await fraction();
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
  await page.waitForTimeout(100);
  expect(await draft.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([caret, caret + 8]);
  expect(Math.abs((await fraction()) - before)).toBeLessThan(0.02);
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.getByRole('button', { name: 'Focus writing', exact: true })).toBeVisible();
  await page.waitForTimeout(100);
  expect(Math.abs((await fraction()) - before)).toBeLessThan(0.02);
  await expect(draft).toHaveValue(long);
});

test('Alt+Shift+F does nothing when no manuscript card is open', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.locator('section.pane-editor').getByTitle('Close', { exact: true }).click();
  await expect(page.locator('section.pane-editor')).toHaveCount(0);
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toHaveCount(0);
});
