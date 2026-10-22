import { test, expect, openPageSettings, closePageSettings } from './fixtures';

test('Page keyboard controls retain the live manuscript, selection, and reading position', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const draft = page.getByRole('textbox', { name: 'Chapter One', exact: true });
  const text = Array.from({ length: 100 }, (_, index) => `Paragraph ${index}. The garden wall held the last warmth of the afternoon. Beyond the gate, branches brushed the stone.`).join('\n\n');
  await draft.fill(text);
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  const before = await draft.evaluate((element: HTMLTextAreaElement) => {
    element.dataset.continuityProbe = 'same-draft';
    element.setSelectionRange(1000, 1040);
    element.scrollTop = element.scrollHeight * .38;
    return element.scrollTop / element.scrollHeight;
  });
  const trigger = page.getByRole('button', { name: 'Page settings', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Page settings', exact: true });
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close page settings', exact: true })).toBeFocused();
  await page.getByLabel('Page surface', { exact: true }).selectOption('paper');
  await page.getByLabel('Page width in characters').fill('83');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
  await expect(draft).toHaveAttribute('data-continuity-probe', 'same-draft');
  await expect(draft).toHaveValue(text);
  expect(await draft.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([1000, 1040]);
  expect(Math.abs(await draft.evaluate((element) => element.scrollTop / element.scrollHeight) - before)).toBeLessThan(.01);
  await trigger.press('Enter');
  await page.getByLabel('Protect selections from Space and Enter').focus();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Drafting controls stay grouped and Page settings escape pane clipping', async ({ page, projectId }, testInfo) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 800 });
  const draft = page.getByRole('textbox', { name: 'Chapter One', exact: true });
  await expect(page.getByRole('button', { name: 'Page settings', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Note on selection', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Tag or link selection', exact: true })).toBeInViewport();
  await expect(page.getByText(/words selected/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('drafting-layout-desktop.png'), animations: 'disabled' });
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const dialog = await openPageSettings(page);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
    const control = page.getByLabel('Writing font', { exact: true });
    const hit = await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
    });
    expect(hit, 'Font control must be painted above the pane, not clipped by it').toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`drafting-page-${width}.png`), animations: 'disabled' });
    await closePageSettings(page);
  }
  await draft.press('Control+Home');
  await draft.press('Control+Shift+ArrowRight');
  await expect(page.getByText(/words selected/)).toBeVisible();
});

test.describe('touch Page settings', () => {
  test.use({ isMobile: true, hasTouch: true });
  test('small viewport keeps every setting reachable and touch targets usable', async ({ page, projectId }, testInfo) => {
    expect(projectId).toBeTruthy();
    await page.setViewportSize({ width: 320, height: 568 });
    const dialog = await openPageSettings(page);
    const width = page.getByLabel('Page width', { exact: true });
    expect((await width.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(width).toHaveCSS('font-size', '16px');
    const guard = page.getByLabel('Protect selections from Space and Enter');
    await guard.check();
    await expect(guard).toBeInViewport();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: testInfo.outputPath('drafting-page-touch.png'), animations: 'disabled' });
    await closePageSettings(page);
    await expect(page.getByRole('button', { name: 'Page settings', exact: true })).toBeFocused();
  });
});
