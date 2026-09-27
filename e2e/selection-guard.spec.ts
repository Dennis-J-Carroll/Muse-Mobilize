import { test, expect } from './fixtures';

test('guard is off by default; when on, Space over a long selection keeps the text', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const sentence = 'one two three four five six seven eight nine ten';
  const six = 'one two three four five six'.length; // 27: a six-word selection
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill(sentence);
  await draft.evaluate((el: HTMLTextAreaElement, end: number) => { el.focus(); el.setSelectionRange(0, end); }, six);
  await page.keyboard.press('Space');
  await expect(draft).toHaveValue('  seven eight nine ten'); // default: replaced, as today
  await draft.fill(sentence);
  await page.getByRole('button', { name: 'Page settings', exact: true }).click();
  await page.getByLabel('Protect selections from Space and Enter').check();
  await page.keyboard.press('Escape');
  await draft.evaluate((el: HTMLTextAreaElement, end: number) => { el.focus(); el.setSelectionRange(0, end); }, six);
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(draft).toHaveValue(sentence);
  await expect(page.getByText('Selection kept — press Delete or Backspace to remove it.')).toBeVisible();
  await draft.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 7)); // "one two": two words
  await page.keyboard.press('Space');
  await expect(draft).toHaveValue('  three four five six seven eight nine ten');
});
