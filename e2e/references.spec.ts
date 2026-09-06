import { test, expect, openTool, png } from './fixtures';

test('quotes and web sources support edit, filters, search, and reload', async ({ page, projectId }) => {
  await openTool(page, 'References');
  for (const [kind, title] of [['quote', 'Weather quote'], ['link', 'Archive source']]) {
    await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
    await page.getByLabel('Reference kind').selectOption(kind);
    await page.getByLabel('Title', { exact: true }).fill(title);
    if (kind === 'quote') await page.getByLabel('Quote or excerpt').fill('Rain makes the old stone shine.');
    else await page.getByLabel('Primary link').fill('https://example.com/archive');
    await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Edit Weather quote', exact: true }).click();
  await page.getByLabel('Attribution', { exact: true }).fill('QA notebook');
  await page.getByRole('button', { name: 'Save reference', exact: true }).click();
  await expect(page.getByText('QA notebook', { exact: true })).toBeVisible();
  await page.reload();
  await openTool(page, 'References');
  await page.getByRole('button', { name: /^Quotes / }).click();
  await expect(page.getByRole('heading', { name: 'Weather quote', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archive source', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Everything / }).click();
  await page.getByLabel('Search references').fill('old stone');
  await expect(page.getByRole('heading', { name: 'Weather quote', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archive source', exact: true })).toHaveCount(0);
  await page.getByLabel('Search references').fill('');
  await page.getByRole('button', { name: /^Web sources / }).click();
  await expect(page.getByRole('link', { name: 'Open source for Archive source' })).toHaveAttribute('href', 'https://example.com/archive');
});

test('overlapping chooser and drop batches preserve edits and both images', async ({ page, projectId }) => {
  await openTool(page, 'References');
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Two arrivals');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let first = true;
  await page.route(`**/api/projects/${projectId}/assets/images`, async (route) => {
    if (first) { first = false; await pending; }
    await route.continue();
  });
  await page.getByLabel('Choose images').setInputFiles({ ...png, name: 'slow.png' });
  const drop = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' }));
    return transfer;
  }, [...png.buffer]);
  try {
    await page.locator('.image-drop').dispatchEvent('drop', { dataTransfer: drop });
    await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
    await page.getByLabel('Caption for reference image 1').fill('Caption written during upload');
  } finally {
    release();
    await drop.dispose();
  }
  await expect(page.getByLabel('Caption for reference image 2')).toBeVisible();
  await expect(page.getByLabel('Caption for reference image 1')).toHaveValue('Caption written during upload');
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Two arrivals', exact: true })).toBeVisible();
  await page.reload();
  await openTool(page, 'References');
  await page.getByRole('button', { name: 'Edit Two arrivals', exact: true }).click();
  await expect(page.getByLabel('Caption for reference image 1')).toHaveValue('Caption written during upload');
  await expect(page.getByLabel('Caption for reference image 2')).toBeVisible();
});

test('mixed uploads preserve valid images while docked and block discarding until upload completes', async ({ page, projectId }) => {
  await openTool(page, 'References');
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Mixed image batch');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/projects/${projectId}/assets/images`, async (route) => {
    await pending;
    await route.continue();
  });
  await page.getByLabel('Choose images').setInputFiles([
    png,
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Not an image') },
    { name: 'forged.png', mimeType: 'image/png', buffer: Buffer.from('Renaming is not conversion') },
    { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
  ]);
  try {
    await expect(page.getByRole('button', { name: 'Pin to board', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Close reference editor', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Recall Pin reference', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Pin reference', exact: true })).toBeHidden();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Mixed image batch');
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toContainText('3 images skipped:');
  await expect(page.getByRole('alert')).toContainText('file contents do not match image type');
  await page.getByRole('button', { name: 'Recall Pin reference', exact: true }).click();
  await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
  await expect(page.getByLabel('Caption for reference image 2')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mixed image batch', exact: true })).toBeVisible();
  await page.reload();
  await openTool(page, 'References');
  await page.getByRole('button', { name: 'Edit Mixed image batch', exact: true }).click();
  await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
  await expect(page.getByLabel('Caption for reference image 2')).toHaveCount(0);
});

test('image upload, reference save, and reload preserve bytes and story links', async ({ page, request, projectId }) => {
  await openTool(page, 'References');
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Storm palette');
  await page.getByLabel('Attribution', { exact: true }).fill('Acceptance fixture');
  await page.getByLabel('Source page', { exact: true }).fill('https://example.com/palette');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose images', { exact: true }).click();
  await (await chooser).setFiles(png);
  await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
  await page.getByLabel('Caption for reference image 1').fill('Storm light');
  await page.getByLabel('Story entity to link').selectOption('document:chapter-01');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Storm palette', exact: true })).toBeVisible();

  await page.reload();
  await openTool(page, 'References');
  const image = page.getByRole('img', { name: 'Storm light', exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('naturalWidth', 1);
  const src = await image.getAttribute('src');
  expect(src).toContain(`/api/projects/${projectId}/assets/images/`);
  const response = await request.get(src!);
  expect(response.ok()).toBeTruthy();
  expect(await response.body()).toEqual(png.buffer);
  await expect(page.getByRole('link', { name: 'Open source for Storm palette' })).toHaveAttribute('href', 'https://example.com/palette');
  await page.getByRole('button', { name: 'Edit Storm palette', exact: true }).click();
  await expect(page.getByLabel('Attribution', { exact: true })).toHaveValue('Acceptance fixture');
  await expect(page.getByLabel('Caption for reference image 1')).toHaveValue('Storm light');
  await expect(page.getByRole('button', { name: /Document\s*Chapter One ×/ })).toBeVisible();
});

test('reference save is single-flight and keeps draft available after failure', async ({ page, request, projectId }) => {
  await openTool(page, 'References');
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('One deliberate pin');
  await page.getByLabel('Why it matters').fill('Keep this draft through retry.');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const saving = new Promise<void>((resolve) => { started = resolve; });
  await page.route(`**/api/projects/${projectId}/references`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    started();
    await pending;
    await route.fulfill({ status: 503, json: { error: 'QA save unavailable' } });
  });
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  await saving;
  try {
    await expect(page.locator('.reference-drawer button[type="submit"], .reference-drawer .btn-primary')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('One deliberate pin');
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toContainText('QA save unavailable');
  await expect(page.getByLabel('Why it matters')).toHaveValue('Keep this draft through retry.');
  await page.unroute(`**/api/projects/${projectId}/references`);
  await page.getByRole('button', { name: 'Pin to board', exact: true }).dblclick();
  await expect(page.getByRole('heading', { name: 'One deliberate pin', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const { references } = await (await request.get(`/api/projects/${projectId}/references`)).json();
  expect(references.items).toHaveLength(1);
});

test('removing a reference deletes it and garbage collects its only image', async ({ page, request, projectId }) => {
  await openTool(page, 'References');
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Doomed reference');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose images', { exact: true }).click();
  await (await chooser).setFiles(png);
  await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Doomed reference', exact: true })).toBeVisible();

  const image = page.getByRole('img', { name: 'Doomed reference', exact: true });
  const imageSrc = await image.getAttribute('src');
  expect(imageSrc).toContain(`/api/projects/${projectId}/assets/images/`);

  await page.getByRole('button', { name: 'Edit Doomed reference', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Doomed reference', exact: true })).toHaveCount(0);

  await page.reload();
  await openTool(page, 'References');
  await expect(page.getByRole('heading', { name: 'Doomed reference', exact: true })).toHaveCount(0);
  const { references } = await (await request.get(`/api/projects/${projectId}/references`)).json();
  expect(references.items).toHaveLength(0);
  const orphanCheck = await request.get(imageSrc!);
  expect(orphanCheck.ok()).toBeFalsy();
});
