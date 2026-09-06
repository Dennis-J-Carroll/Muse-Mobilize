import { test, expect } from './fixtures';

test('manuscript fonts load locally, preserve text, and persist independently of tool typography', async ({ page, projectId }, testInfo) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await expect(draft).toHaveValue(/Chapter One/);
  const original = await draft.inputValue();
  const companion = page.getByPlaceholder('Ask Muse…');
  const companionFont = await companion.evaluate((el) => getComputedStyle(el).fontFamily);
  const fonts = [
    ['times', 'Times New Roman'], ['antic', 'Antic'], ['antic-didone', 'Antic Didone'],
    ['italiana', 'Italiana'], ['josefin-sans', 'Josefin Sans Variable'], ['josefin-slab', 'Josefin Slab Variable'],
  ];
  for (const [value, family] of fonts) {
    await page.getByLabel('Writing font', { exact: true }).selectOption(value);
    await expect(draft).toHaveCSS('font-family', new RegExp(family));
    if (value !== 'times') {
      expect(await page.evaluate(async (name) => (await document.fonts.load(`400 18px "${name}"`)).length, family)).toBeGreaterThan(0);
    }
    await expect(draft).toHaveValue(original);
    await expect(companion).toHaveCSS('font-family', companionFont);
  }
  await page.reload();
  await expect(page.getByLabel('Writing font', { exact: true })).toHaveValue('josefin-slab');
  await page.getByLabel('Writing weight', { exact: true }).selectOption('350');
  await expect(draft).toHaveCSS('font-weight', '350');
  await page.getByLabel('Writing font', { exact: true }).selectOption('times');
  await expect(page.getByText('Uses installed Times New Roman; otherwise a serif fallback.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Writing weight', { exact: true })).toBeDisabled();
  await expect(draft).toHaveCSS('font-weight', '400');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await expect(page.getByLabel('Writing font', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('writing-fonts-phone.png'), animations: 'disabled' });
});
