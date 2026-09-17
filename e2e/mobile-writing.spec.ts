import { test, expect } from './fixtures';

test.use({ isMobile: true, hasTouch: true });

test('phone workspace folds into a button and keeps the draft and selection when recalled', async ({ page, request, projectId }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const draft = page.locator('.pane-editor textarea.draft');
  const hide = page.getByRole('button', { name: 'Hide workspace controls', exact: true });
  const show = page.getByRole('button', { name: 'Show workspace controls', exact: true });
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  await hide.tap();
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Drafting', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Project menu' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open document', exact: true })).toBeHidden();
  await expect(show).toBeInViewport();
  await show.tap();

  await page.getByLabel('Page surface', { exact: true }).selectOption('paper');
  await page.getByLabel('Writing font', { exact: true }).selectOption('antic-didone');
  const text = `The door opened onto a quiet garden.\n\nA second paragraph stays separate. ${projectId}`;
  await draft.fill(text);
  await expect(show).toBeInViewport();
  await expect(draft).toBeFocused();
  await draft.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(4, 15));
  await show.tap();
  await expect(page.getByRole('button', { name: 'Project menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open document', exact: true })).toBeVisible();
  await expect(draft).toBeFocused();
  expect(await draft.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([4, 15]);
  await expect(draft).toHaveValue(text);

  // Typing after explicitly reopening the tools should tuck them away again.
  await draft.press('End');
  await draft.pressSequentially(' Still writing.');
  await expect(show).toBeInViewport();
  const edited = await draft.inputValue();
  const { project } = await (await request.get(`/api/projects/${projectId}`)).json();
  const document = project.documents.find((item: { kind: string }) => item.kind === 'manuscript');
  await expect.poll(async () => (await (await request.get(`/api/projects/${projectId}/documents/${document.id}`)).json()).content).toBe(edited);
  await page.screenshot({ path: testInfo.outputPath('phone-collapsed-writing.png'), animations: 'disabled' });

  // The phone choice must not hide desktop controls when the viewport widens.
  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(show).toBeHidden();
  await expect(page.getByRole('button', { name: 'Drafting', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Project menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open document', exact: true })).toBeVisible();
  await expect(draft).toHaveValue(edited);
});

test('mobile manuscript spacing fits both surfaces without changing paragraph breaks', async ({ page, projectId }, testInfo) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await page.getByLabel('Writing font', { exact: true }).selectOption('antic-didone');
  const text = 'The mist lifted from the garden wall. Beyond the gate, wet branches brushed against the stone, leaving dark trails where the water ran.\n\nFootsteps crossed the empty courtyard. She closed her notebook and waited for the figure beneath the arch to step into the morning light.';
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const surface of ['glass', 'paper']) {
      await page.getByLabel('Page surface', { exact: true }).selectOption(surface);
      await draft.fill(text);
      await page.getByRole('button', { name: 'Focus writing', exact: true }).tap();
      const hide = page.getByRole('button', { name: 'Hide writing controls', exact: true });
      if (await hide.isVisible()) await hide.tap();
      await expect(draft).toHaveValue(text);
      const spacing = await draft.evaluate((element) => {
        const css = getComputedStyle(element);
        return { font: parseFloat(css.fontSize), line: parseFloat(css.lineHeight), left: parseFloat(css.paddingLeft), right: parseFloat(css.paddingRight), bottom: parseFloat(css.paddingBottom) };
      });
      expect(spacing.font).toBeGreaterThanOrEqual(16);
      expect(spacing.line / spacing.font).toBeGreaterThanOrEqual(1.5);
      expect(spacing.line / spacing.font).toBeLessThanOrEqual(1.6);
      expect(spacing.left + spacing.right).toBeLessThanOrEqual(36);
      expect(spacing.bottom).toBeLessThanOrEqual(28);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.getByRole('button', { name: 'Show writing controls', exact: true })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`phone-spacing-${width}-${surface}.png`), animations: 'disabled' });
      await page.getByRole('button', { name: 'Show writing controls', exact: true }).tap();
      await page.getByRole('button', { name: 'Exit writing focus', exact: true }).tap();
    }
  }
});

test('writing follows a keyboard-sized visual viewport and restores after it closes', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill(`Keyboard viewport check. ${projectId}`);
  await page.getByRole('button', { name: 'Focus writing', exact: true }).tap();
  await page.getByRole('button', { name: 'Hide writing controls', exact: true }).tap();
  // Emulate visual-viewport events only; this is not a native iOS keyboard test.
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, { height: { configurable: true, value: 360 }, offsetTop: { configurable: true, value: 28 } });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  });
  const bounds = (await draft.boundingBox())!;
  expect(bounds.y).toBeCloseTo(28, 0);
  expect(bounds.height).toBeCloseTo(360, 0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(388);
  await expect(draft).toBeFocused();
  await draft.press('End');
  await draft.pressSequentially(' Kept typing.');
  await expect(draft).toHaveValue(`Keyboard viewport check. ${projectId} Kept typing.`);
  await expect(page.getByRole('button', { name: 'Show writing controls', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('phone-keyboard-viewport.png'), animations: 'disabled' });

  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Reflect.deleteProperty(viewport, 'height');
    Reflect.deleteProperty(viewport, 'offsetTop');
    viewport.dispatchEvent(new Event('resize'));
  });
  expect((await draft.boundingBox())!.height).toBeCloseTo(844, 0);
  await page.getByRole('button', { name: 'Show writing controls', exact: true }).tap();
  await page.getByRole('button', { name: 'Exit writing focus', exact: true }).tap();
  await page.getByRole('button', { name: 'Show workspace controls', exact: true }).tap();
  expect(await page.locator('.app').evaluate((element) => element.style.getPropertyValue('--writing-viewport-height'))).toBe('');
});

test('compact controls remain reachable on small phones after opening the atlas', async ({ page, projectId }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: /^World Building/ }).tap();
  await expect(page.locator('.world-viewport')).toBeVisible();
  await page.getByRole('button', { name: 'Hide workspace controls', exact: true }).tap();
  const show = page.getByRole('button', { name: 'Show workspace controls', exact: true });
  await expect(show).toBeInViewport();
  const app = (await page.locator('.app').boundingBox())!;
  expect(app.y).toBeCloseTo(0, 0);
  expect(app.height).toBeCloseTo(568, 0);
  const canvas = (await page.locator('.canvas').boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(568);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await show.tap();
  await expect(page.getByRole('button', { name: 'Drafting', exact: true })).toBeVisible();
});
