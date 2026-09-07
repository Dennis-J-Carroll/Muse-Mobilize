import { test, expect } from './fixtures';

test('focus card lookup edits a shared draft and Escape dismisses only the card layer', async ({ page, projectId, request }, testInfo) => {
  const response = await request.post(`/api/projects/${projectId}/canon/entities`, { data: { type: 'character', name: 'Focus keeper', aliases: ['Lantern'] } });
  expect(response.ok()).toBeTruthy();
  const { entity } = await response.json();
  const draft = page.locator('.pane-editor textarea.draft');
  await expect(draft).toHaveValue(/Chapter One/);
  const prose = await draft.inputValue();
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(15, 23); });
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await page.getByRole('button', { name: 'Open story cards', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Story cards', exact: true });
  await picker.getByLabel('Find story card').fill('Lantern');
  await picker.getByRole('button', { name: 'Character: Focus keeper', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Revise Focus keeper', exact: true });
  await expect(card).toBeVisible();
  await card.getByPlaceholder('Character name').fill('Focus keeper revised');
  const position = await card.boundingBox();
  const grip = card.getByRole('button', { name: 'Move Revise Focus keeper', exact: true });
  await grip.focus();
  await grip.press('ArrowLeft');
  expect((await card.boundingBox())!.x).toBe(position!.x - 5);
  await page.screenshot({ path: testInfo.outputPath('focus-story-card.png') });
  await card.press('Escape');
  await expect(card).toBeHidden();
  await expect(draft).toBeFocused();
  expect(await draft.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([15, 23]);
  await expect(draft).toHaveValue(prose);
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
  await draft.press('Alt+Shift+k');
  await picker.getByLabel('Find story card').fill('Focus keeper');
  await picker.getByRole('button', { name: 'Character: Focus keeper', exact: true }).click();
  await expect(card.getByPlaceholder('Character name')).toHaveValue('Focus keeper revised');
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(draft).toBeFocused();
  const { canon } = await (await request.get(`/api/projects/${projectId}/canon`)).json();
  expect(canon.entities.find((item: { id: string }) => item.id === entity.id).name).toBe('Focus keeper revised');
  await draft.press('Escape');
  await expect(page.getByRole('button', { name: 'Focus writing', exact: true })).toBeVisible();
  await page.reload();
  await expect(draft).toHaveValue(prose);
});

test('quiet phone lookup cancels above the draft and can reopen a parked editor without duplicates', async ({ page, projectId }) => {
  await page.getByRole('button', { name: /^Characters / }).click();
  await page.getByRole('button', { name: /Add character/ }).click();
  await page.getByPlaceholder('Character name').fill('Parked before focus');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Drafting', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await page.getByRole('button', { name: 'Hide writing controls', exact: true }).click();
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.press('Alt+Shift+k');
  const picker = page.getByRole('dialog', { name: 'Story cards', exact: true });
  await expect(picker.getByLabel('Find story card')).toBeFocused();
  await picker.getByRole('button', { name: 'Resume New character', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'New character', exact: true });
  await expect(card.getByPlaceholder('Character name')).toHaveValue('Parked before focus');
  await expect(card).toBeInViewport();
  // Focus layers trap Tab, including reverse wrap from the move handle.
  await card.getByRole('button', { name: 'Move New character', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  expect(await card.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await card.press('Escape');
  await expect(draft).toBeFocused();
  await expect(page.getByRole('button', { name: 'Show writing controls', exact: true })).toBeVisible();
  await draft.press('Alt+Shift+k');
  await picker.getByLabel('Find story card').fill('No such story card');
  await expect(picker.getByText('No matching cards.')).toBeVisible();
  await picker.press('Escape');
  await expect(draft).toBeFocused();
  await expect(page.getByRole('button', { name: 'Show writing controls', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await draft.press('Escape');
  await expect(page.getByRole('button', { name: 'Recall New character', exact: true })).toHaveCount(1);
});

test('all story-card kinds can save over a fullscreen draft without moving their workspace data', async ({ page, projectId, request }) => {
  const root = `/api/projects/${projectId}`;
  const inputs = [
    ['canon/entities', { type: 'location', name: 'Harbour', world: { canvas: { x: 345, y: 210 } } }],
    ['plot/nodes', { title: 'Arrival beat', position: { x: 210, y: 330 } }],
    ['scenes', { title: 'Arrival scene' }],
    ['scenes/themes', { name: 'Returning home', description: 'A test theme.' }],
    ['references', { kind: 'quote', title: 'Travel journal', quote: 'The tide turned.' }],
  ] as const;
  for (const [route, data] of inputs) expect((await request.post(`${root}/${route}`, { data })).ok()).toBeTruthy();
  expect((await request.put(`${root}/goals`, { data: { milestones: [{ title: 'Finish arrival' }] } })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await page.getByRole('button', { name: 'Enter browser fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  const cases = [
    ['World', 'Harbour', 'Edit Harbour', 'Name', 'Save landmark'],
    ['Plot', 'Arrival beat', 'Revise Arrival beat', 'Title', 'Save folio'],
    ['Scene', 'Arrival scene', 'Revise Arrival scene', 'Scene title', 'Save scene'],
    ['Theme', 'Returning home', 'Revise Returning home', 'Theme name', 'Save theme'],
    ['Reference', 'Travel journal', 'Revise Travel journal', 'Title', 'Save reference'],
    ['Goal', 'Finish arrival', 'Revise Finish arrival', 'Milestone title', 'Save milestone'],
  ];
  for (const [group, title, dialogTitle, field, save] of cases) {
    await page.getByRole('button', { name: 'Open story cards', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Story cards', exact: true });
    await picker.getByLabel('Find story card').fill(title);
    await picker.getByRole('button', { name: `${group}: ${title}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: dialogTitle, exact: true });
    await expect(dialog).toBeInViewport();
    await dialog.getByLabel(field, { exact: true }).fill(`${title} revised`);
    await dialog.getByRole('button', { name: save, exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.pane-editor textarea.draft')).toBeFocused();
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  }
  const { canon } = await (await request.get(`${root}/canon`)).json();
  expect(canon.entities.find((item: { name: string }) => item.name === 'Harbour revised').world.canvas).toEqual({ x: 345, y: 210 });
  const { plot } = await (await request.get(`${root}/plot`)).json();
  expect(plot.nodes.find((item: { title: string }) => item.title === 'Arrival beat revised').position).toEqual({ x: 210, y: 330 });
});
