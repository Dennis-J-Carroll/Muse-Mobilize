import { test, expect, openTool } from './fixtures';

test('lore hierarchy handles long entries on desktop and phone without changing manuscript font', async ({ page, request, projectId }, testInfo) => {
  const manuscript = page.getByRole('textbox', { name: 'Chapter One', exact: true });
  const font = await manuscript.evaluate(element => getComputedStyle(element).fontFamily);
  const name = 'Archive of the Winter Harbour and the UnbrokenNorthernCauseway';
  const summary = 'For three winters the harbour remained open after every inland road had closed. Its keepers recorded each arrival, including ships whose names had been erased from the coastal registers.\n\nAt dawn, bells marked the tide and the return of the night watch.';
  await request.post(`/api/projects/${projectId}/canon/entities`, { data: {
    type: 'lore', name, summary, aliases: ['The harbour archive'],
    world: { categories: ['record'], attributes: { era: 'Third winter', atmosphere: 'Salt air and distant bells', significance: 'A record that contradicts the accepted history.' }, canvas: { x: 30, y: 30 }, images: [] },
  } });
  await openTool(page, 'World');
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  const entry = page.locator('.world-page-entry');
  await expect(entry.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(entry.locator('p')).toHaveCSS('font-size', '16px');
  await expect(entry.locator('p')).toHaveCSS('white-space', 'pre-line');
  await expect(entry.locator('.world-page-meta em').first()).toHaveCSS('font-size', '12px');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 700 && await page.getByRole('button', { name: 'Hide workspace controls', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Hide workspace controls', exact: true }).click();
    }
    await entry.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await entry.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`lore-pages-${width}.png`), animations: 'disabled' });
  }
  await entry.getByRole('button', { name: 'Locate', exact: true }).click();
  await expect(page.locator('.world-summary')).toHaveCSS('font-size', '16px');
  await expect(page.locator('.world-ledger dd').first()).toHaveCSS('font-size', '14px');
  await page.screenshot({ path: testInfo.outputPath('lore-inspector-phone.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Edit landmark', exact: true }).click();
  const form = page.getByRole('dialog', { name: `Edit ${name}`, exact: true });
  await expect(form.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(summary);
  await expect(form.getByRole('textbox', { name: 'Summary', exact: true })).toHaveCSS('font-size', '16px');
  await expect(form.getByRole('button', { name: 'Save landmark', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Show workspace controls', exact: true }).click();
  await page.getByRole('button', { name: 'Drafting', exact: true }).click();
  await expect(manuscript).toHaveCSS('font-family', font);
});

type MotionLog = { duration: number; frames: Keyframe[] }[];
async function recordMotion(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const target = window as Window & { motionLog?: MotionLog };
    target.motionLog = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains('workspace-motion-cue')) target.motionLog!.push({ duration: Number(typeof options === 'number' ? options : options?.duration), frames: frames as Keyframe[] });
      return original.call(this, frames, options);
    };
  });
}
const motions = (page: import('@playwright/test').Page) => page.evaluate(() => (window as Window & { motionLog?: MotionLog }).motionLog ?? []);

test('parking and desk recall explain movement while preserving live fields; new input cancels cues', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await recordMotion(page);
  const question = page.getByRole('textbox', { name: 'Ask Muse', exact: true });
  await question.fill('Keep this unsent question through every move.');
  await question.evaluate((element: HTMLTextAreaElement) => { element.dataset.continuityProbe = 'live-question'; element.setSelectionRange(5, 9); });
  await page.locator('.pane-agent').getByRole('button', { name: 'Minimize', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Muse moved to Tools');
  await expect.poll(async () => (await motions(page)).length).toBeGreaterThan(0);
  for (const motion of await motions(page)) {
    expect(motion.duration).toBeLessThanOrEqual(240);
    expect(JSON.stringify(motion.frames)).not.toContain('scale');
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true })));
  await expect(page.locator('.workspace-motion-cue')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open tool drawer', exact: true }).click();
  await expect(question).toHaveAttribute('data-continuity-probe', 'live-question');
  await expect(question).toHaveValue('Keep this unsent question through every move.');
  expect(await question.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([5, 9]);
  const drawer = page.getByRole('region', { name: 'Parked workspace tools' });
  await expect(drawer).toHaveCSS('animation-name', 'drawer-arrive');
  await drawer.getByRole('button', { name: 'Restore Muse to workspace', exact: true }).click();
  await expect(question).toHaveAttribute('data-continuity-probe', 'live-question');
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name').fill('Original desk');
  await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  await page.getByRole('button', { name: 'Close saved desks', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse tool menu', exact: true }).click();
  const count = (await motions(page)).length;
  await page.keyboard.press('Alt+Shift+1');
  await expect(page.locator('.toast[role="status"]')).toContainText('Desk restored: Original desk');
  await expect.poll(async () => (await motions(page)).length).toBeGreaterThan(count);
  await page.keyboard.press('Alt+Shift+0');
  await page.keyboard.press('Alt+Shift+1');
  await expect(question).toHaveValue('Keep this unsent question through every move.');
  await expect(question).toHaveAttribute('data-continuity-probe', 'live-question');
  await expect(page.locator('.workspace-motion-cue')).toHaveCount(0);
});

test('reduced motion keeps state feedback, skips travel, and disables drawer movement', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordMotion(page);
  await page.locator('.pane-agent').getByRole('button', { name: 'Minimize', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Muse moved to Tools');
  await page.getByRole('button', { name: 'Open tool drawer', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Parked workspace tools' });
  await expect(drawer).toHaveCSS('animation-name', 'none');
  await drawer.getByRole('button', { name: 'Restore Muse to workspace', exact: true }).click();
  expect(await motions(page)).toEqual([]);
  await expect(page.locator('.workspace-motion-cue')).toHaveCount(0);
  await openTool(page, 'World');
  await page.getByRole('button', { name: '+ Place landmark', exact: true }).click();
  const form = page.getByRole('dialog');
  await expect(form).toHaveCSS('animation-name', 'none');
  await form.getByLabel('Name', { exact: true }).fill('A retained lore draft');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Recall Place a landmark', exact: true }).click();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('A retained lore draft');
});
