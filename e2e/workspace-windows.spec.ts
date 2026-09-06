import { test, expect } from './fixtures';

test('workspace headers drag cards, retain drafts, and return to their original layout', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const question = page.getByPlaceholder('Ask Muse…');
  await question.fill('Do not lose this question when moving windows.');
  for (const kind of ['agent', 'notes', 'editor']) {
    const pane = page.locator(`.pane-${kind}`);
    const before = (await pane.boundingBox())!;
    const handle = pane.getByRole('button', { name: /^Move / });
    const grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + 24, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 76, grip.y + grip.height / 2 + 35, { steps: 8 });
    await page.mouse.up();
    await expect(pane.locator('..')).toHaveClass(/is-floating/);
    const moved = (await pane.boundingBox())!;
    expect(moved.x).toBeLessThan(before.x - 40);
    await expect(pane.getByRole('button', { name: 'Return to layout', exact: true })).toBeVisible();
    await handle.focus();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await pane.boundingBox())!.x).toBeCloseTo(moved.x + 20, 0);
    await pane.getByRole('button', { name: 'Return to layout', exact: true }).click();
    expect(await pane.boundingBox()).toEqual(before);
    await expect(question).toHaveValue('Do not lose this question when moving windows.');
  }
  const manuscript = page.locator('.pane-editor');
  await manuscript.getByRole('button', { name: /^Move / }).focus();
  await page.keyboard.press('ArrowLeft');
  const floating = (await manuscript.boundingBox())!;
  await manuscript.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(await manuscript.boundingBox()).toEqual(floating);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => { const box = (await manuscript.boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(390);
  const phone = (await manuscript.boundingBox())!;
  expect(phone.x).toBeGreaterThanOrEqual(0);
  expect(phone.x + phone.width).toBeLessThanOrEqual(390);
  expect(phone.y + phone.height).toBeLessThanOrEqual(844);
  await expect(manuscript.getByRole('button', { name: 'Return to layout', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('draggable-window-phone.png'), animations: 'disabled' });
});
