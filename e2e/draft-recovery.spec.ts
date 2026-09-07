import { test, expect, openTool, png } from './fixtures';

test('failed autosave survives reload and waits for an explicit choice when saved text changed', async ({ page, request, projectId }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  const { project } = await (await request.get(`/api/projects/${projectId}`)).json();
  const docId = project.documents.find((doc: { kind: string }) => doc.kind === 'manuscript').id;
  await page.route(`**/api/projects/${projectId}/documents/${docId}`, async (route) => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 503, json: { error: 'Simulated save outage' } });
    else await route.continue();
  });
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Unsaved scene that must survive.');
  await draft.press('Tab');
  await expect(page.getByRole('alert')).toContainText('Simulated save outage');
  await request.put(`/api/projects/${projectId}/documents/${docId}`, { data: { content: 'Changed on disk while away.' } });
  await page.reload();
  const recovery = page.getByRole('complementary', { name: 'Draft recovery', exact: true });
  await expect(recovery).toContainText('saved page has changed');
  await expect(draft).toHaveValue('Changed on disk while away.');
  await expect(draft).toHaveAttribute('readonly', '');
  await recovery.getByText('Compare versions', { exact: true }).click();
  await expect(recovery.getByText('Unsaved scene that must survive.', { exact: true })).toBeVisible();
  await page.unroute(`**/api/projects/${projectId}/documents/${docId}`);
  await recovery.getByRole('button', { name: 'Restore recovered draft', exact: true }).click();
  await expect(draft).toHaveValue('Unsaved scene that must survive.');
  await expect.poll(async () => (await (await request.get(`/api/projects/${projectId}/documents/${docId}`)).json()).content).toBe('Unsaved scene that must survive.');
  await page.reload();
  await expect(recovery).toBeHidden();
  await expect(draft).toHaveValue('Unsaved scene that must survive.');
});

test('all seven story editors recover unsaved fields after reload, then clear recovery when saved', async ({ page, request, projectId }) => {
  test.setTimeout(60000);
  page.on('dialog', (dialog) => void dialog.accept());
  const root = `/api/projects/${projectId}`;
  const inputs = [
    ['canon/entities', { type: 'character', name: 'Mara' }],
    ['canon/entities', { type: 'location', name: 'Harbour' }],
    ['plot/nodes', { title: 'Arrival beat' }],
    ['scenes', { title: 'Arrival scene' }],
    ['scenes/themes', { name: 'Returning home' }],
    ['references', { kind: 'quote', title: 'Travel journal', quote: 'The tide turned.' }],
  ] as const;
  for (const [route, data] of inputs) expect((await request.post(`${root}/${route}`, { data })).ok()).toBeTruthy();
  await request.put(`${root}/goals`, { data: { milestones: [{ title: 'Finish arrival' }] } });
  const cases = [
    ['Character', 'Mara', 'Revise Mara', 'Name', 'Save changes'],
    ['World', 'Harbour', 'Edit Harbour', 'Name', 'Save landmark'],
    ['Plot', 'Arrival beat', 'Revise Arrival beat', 'Title', 'Save folio'],
    ['Scene', 'Arrival scene', 'Revise Arrival scene', 'Scene title', 'Save scene'],
    ['Theme', 'Returning home', 'Revise Returning home', 'Theme name', 'Save theme'],
    ['Reference', 'Travel journal', 'Revise Travel journal', 'Title', 'Save reference'],
    ['Goal', 'Finish arrival', 'Revise Finish arrival', 'Milestone title', 'Save milestone'],
  ];
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  const open = async (group: string, title: string, dialogTitle: string) => {
    await page.getByRole('button', { name: 'Open story cards', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Story cards', exact: true });
    await picker.getByLabel('Find story card').fill(title);
    await picker.getByRole('button', { name: `${group}: ${title}`, exact: true }).click();
    return page.getByRole('dialog', { name: dialogTitle, exact: true });
  };
  for (const [group, title, dialogTitle, field] of cases) {
    const card = await open(group, title, dialogTitle);
    if (group === 'Character') await card.getByPlaceholder('Character name').fill(`${title} recovered`);
    else await card.getByLabel(field, { exact: true }).fill(`${title} recovered`);
    await card.press('Escape');
  }
  await page.reload();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  for (const [group, title, dialogTitle, field, save] of cases) {
    const card = await open(group, title, dialogTitle);
    await expect(card).toContainText('Recovered your unsaved changes');
    const control = group === 'Character' ? card.getByPlaceholder('Character name') : card.getByLabel(field, { exact: true });
    await expect(control).toHaveValue(`${title} recovered`);
    await card.getByRole('button', { name: save, exact: true }).click();
    await expect(card).toBeHidden();
  }
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('muse:draft:v1:')))).toEqual([]);
});

test('new reference draft keeps an uploaded image through reload and explicit Cancel clears it', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  page.on('dialog', (dialog) => void dialog.accept());
  await openTool(page, 'References');
  await page.getByRole('button', { name: /Pin reference/ }).first().click();
  const card = page.getByRole('dialog', { name: 'Pin reference', exact: true });
  await card.getByLabel('Title', { exact: true }).fill('Unsaved moodboard');
  await card.locator('input[type=file]').setInputFiles(png);
  await expect(card.locator('.image-gallery-editor img')).toHaveCount(1);
  await card.press('Escape');
  await page.reload();
  await openTool(page, 'References');
  await page.getByRole('button', { name: /Pin reference/ }).first().click();
  await expect(card.getByLabel('Title', { exact: true })).toHaveValue('Unsaved moodboard');
  await expect(card.locator('.image-gallery-editor img')).toHaveCount(1);
  expect(await card.locator('.image-gallery-editor img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Pin reference/ }).first().click();
  await expect(card.getByLabel('Title', { exact: true })).toHaveValue('');
  await expect(card.locator('.image-gallery-editor img')).toHaveCount(0);
});

test('unsaved session target survives closing and reopening its tool', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await openTool(page, 'Goals');
  await page.getByPlaceholder('Draft council reversal').fill('Resolve the harbour scene');
  await page.getByRole('button', { name: 'Drafting', exact: true }).click();
  await openTool(page, 'Goals');
  await expect(page.getByPlaceholder('Draft council reversal')).toHaveValue('Resolve the harbour scene');
});
