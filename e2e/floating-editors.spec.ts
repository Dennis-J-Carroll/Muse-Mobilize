import { test, expect, openTool } from './fixtures';

test('scene and character drafts survive tool switches, dragging, docking and recall', async ({ page, projectId }, testInfo) => {
  await openTool(page, 'Scenes');
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  const scene = page.locator('[id="floating-scenes:new"]');
  await scene.getByLabel('Scene title').fill(`Trial ${projectId}`);
  const before = await scene.boundingBox();
  const grip = await scene.getByRole('button', { name: 'Move Add scene', exact: true }).boundingBox();
  await page.mouse.move(grip!.x + 20, grip!.y + 15);
  await page.mouse.down();
  await page.mouse.move(grip!.x - 70, grip!.y + 15, { steps: 6 });
  await page.mouse.up();
  expect((await scene.boundingBox())!.x).toBeLessThan(before!.x - 70);

  await openTool(page, 'Characters');
  await page.getByRole('button', { name: /Add character/ }).click();
  const character = page.locator('[id="floating-characters:new"]');
  await character.getByPlaceholder('Character name').fill('Kiala draft');
  await expect(scene).toBeVisible();
  await expect(character).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('floating-drafts-desktop.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(character).toBeHidden();
  await expect(page.getByRole('button', { name: 'Recall New character' })).toBeFocused();
  await scene.getByLabel('Scene title').focus();
  await page.keyboard.press('Escape');
  await expect(scene).toBeHidden();
  await page.keyboard.press('Alt+2');
  await expect(character.getByPlaceholder('Character name')).toHaveValue('Kiala draft');
  await expect(character.getByPlaceholder('Character name')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+1');
  await expect(scene.getByLabel('Scene title')).toHaveValue(`Trial ${projectId}`);
  await expect(scene.getByLabel('Scene title')).toBeFocused();
  await scene.getByRole('button', { name: 'Add to board', exact: true }).click();
  await expect(scene).toHaveCount(0);
  await page.getByRole('button', { name: 'Recall New character' }).click();
  await character.getByRole('button', { name: 'Add to cast', exact: true }).click();
  await expect(character).toHaveCount(0);
  await openTool(page, 'Scenes');
  await expect(page.getByRole('heading', { name: `Trial ${projectId}` })).toBeVisible();
});

test('same-type editors keep separate drafts and reopening a docked entity never duplicates it', async ({ page, request, projectId }) => {
  for (const title of ['Arrival', 'Return']) await request.post(`/api/projects/${projectId}/scenes`, { data: { title } });
  await openTool(page, 'Scenes');
  for (const title of ['Arrival', 'Return']) {
    await page.locator('.scene-lane').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Revise ${title}`, exact: true });
    await dialog.getByLabel('Scene title').fill(`${title} revised`);
    await page.keyboard.press('Escape');
  }
  await page.locator('.scene-lane').filter({ has: page.getByRole('heading', { name: 'Arrival', exact: true }) }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.floating-drawer')).toHaveCount(2);
  const arrival = page.getByRole('dialog', { name: 'Revise Arrival', exact: true });
  await expect(arrival.getByLabel('Scene title')).toHaveValue('Arrival revised');
  await arrival.getByRole('button', { name: 'Save scene', exact: true }).click();
  await page.keyboard.press('Alt+2');
  const returned = page.getByRole('dialog', { name: 'Revise Return', exact: true });
  await expect(returned.getByLabel('Scene title')).toHaveValue('Return revised');
  await returned.getByRole('button', { name: 'Save scene', exact: true }).click();
  await expect(page.locator('.floating-drawer')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Arrival revised', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Return revised', exact: true })).toBeVisible();
});

test('story material collapse reclaims board space and pane resize survives maximize', async ({ page, projectId }) => {
  await openTool(page, 'Scenes');
  const board = page.locator('.scene-board');
  const before = await board.boundingBox();
  await page.getByRole('button', { name: 'Collapse story material', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand story material', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.scene-rail-body')).toBeHidden();
  expect((await board.boundingBox())!.width).toBeGreaterThan(before!.width + 100);
  await page.getByRole('button', { name: 'Expand story material', exact: true }).click();
  const pane = page.locator('.pane-scenes');
  // Dedicated story panes start maximized; restore exposes generic resize.
  await pane.getByRole('button', { name: 'Maximize', exact: true }).click();
  const size = await pane.boundingBox();
  const handle = pane.getByRole('button', { name: /^Resize / });
  const grip = await handle.boundingBox();
  await page.mouse.move(grip!.x + 8, grip!.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip!.x - 92, grip!.y + 108, { steps: 6 });
  await page.mouse.up();
  const resized = await pane.boundingBox();
  expect(resized!.width).toBeLessThan(size!.width - 80);
  expect(resized!.height).toBeGreaterThan(size!.height + 70);
  await pane.getByRole('button', { name: 'Maximize', exact: true }).click();
  await pane.getByRole('button', { name: 'Maximize', exact: true }).click();
  expect((await pane.boundingBox())!.width).toBeCloseTo(resized!.width, 0);
  expect((await pane.boundingBox())!.height).toBeCloseTo(resized!.height, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Collapse story material', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand story material', exact: true })).toBeInViewport();
});

test('all seven editor types dock and recall on phone without losing input', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cases = [
    ['Scenes', '+ Add scene', 'Scene title'],
    ['Characters', 'Add character', 'Name'],
    ['World', '+ Place landmark', 'Name'],
    ['Plot', '+ Add beat', 'Title'],
    ['Themes', '+ Add theme', 'Theme name'],
    ['References', '+ Pin reference', 'Title'],
    ['Goals', '+ Add milestone', 'Milestone title'],
  ];
  for (const [index, [tool, add, label]] of cases.entries()) {
    await page.getByRole('button', { name: new RegExp(`^${tool}`) }).click();
    await page.getByRole('button', { name: tool === 'Characters' ? /Add character/ : add, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const field = tool === 'Characters' ? dialog.getByPlaceholder('Character name') : dialog.getByLabel(label, { exact: true });
    await field.fill(`${tool} draft`);
    await expect(dialog.getByRole('button', { name: 'Send to side' })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press(`Alt+${index + 1}`);
    await expect(field).toHaveValue(`${tool} draft`);
    await dialog.getByRole('button', { name: 'Send to side' }).click();
  }
  await expect(page.locator('.floating-panel-tab')).toHaveCount(7);
  await expect(page.locator('.floating-drawer')).toHaveCount(7);
  await page.keyboard.press('Alt+6');
  await page.screenshot({ path: testInfo.outputPath('floating-drafts-phone.png'), animations: 'disabled' });
});
