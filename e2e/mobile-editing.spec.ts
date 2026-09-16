import { test, expect, openTool, png } from './fixtures';

test.use({ hasTouch: true });

test('phone atlas pinches in and out, pans with remaining finger, and ignores cancelled drags', async ({ page, request, projectId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { entity } = await (await request.post(`/api/projects/${projectId}/canon/entities`, { data: { type: 'location', name: 'Touch landmark', world: { categories: [], attributes: {}, canvas: { x: 30, y: 30 }, images: [] } } })).json();
  await page.getByRole('button', { name: /^World Building/ }).click();
  const viewport = page.locator('.world-viewport'); const space = page.locator('.world-space');
  await expect(page.getByRole('button', { name: 'Place: Touch landmark', exact: true })).toBeVisible();
  let rect = (await viewport.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const point = (id: number, x: number, y: number) => ({ id, x: rect.x + x, y: rect.y + y, radiusX: 6, radiusY: 6, force: 1 });
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: ReturnType<typeof point>[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const camera = () => space.evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return { scale: m.a, x: m.e, y: m.f }; });
  const before = await camera();
  await touch('touchStart', [point(1, 180, 50), point(2, 240, 50)]);
  await touch('touchMove', [point(1, 130, 50), point(2, 290, 50)]);
  await expect.poll(async () => (await camera()).scale).toBeGreaterThan(before.scale);
  await touch('touchMove', [point(1, 200, 50), point(2, 220, 50)]);
  await expect.poll(async () => (await camera()).scale).toBeLessThan(before.scale);
  // Chromium's targeted release uses the lifted contact's ID.
  await touch('touchEnd', [point(2, 220, 50)]);
  const remaining = await camera();
  await touch('touchMove', [point(1, 230, 70)]);
  await expect.poll(async () => (await camera()).x).toBeCloseTo(remaining.x + 30, 0);
  await touch('touchEnd', []);
  await expect(viewport).not.toHaveClass(/is-panning/);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);

  // Restore camera, then start a gesture on a landmark itself.
  await page.getByRole('button', { name: 'Fit landmarks' }).click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await viewport.scrollIntoViewIfNeeded();
  rect = (await viewport.boundingBox())!;
  const marker = (await page.getByRole('button', { name: 'Place: Touch landmark', exact: true }).boundingBox())!;
  const mx = marker.x + marker.width / 2 - rect.x; const my = marker.y + 15 - rect.y;
  await touch('touchStart', [point(1, mx, my)]);
  await touch('touchMove', [point(1, mx + 12, my + 12)]);
  await touch('touchStart', [point(1, mx + 12, my + 12), point(2, mx + 80, my + 12)]);
  await touch('touchMove', [point(1, mx - 15, my + 12), point(2, mx + 110, my + 12)]);
  await touch('touchCancel', []);
  await expect(viewport).not.toHaveClass(/is-panning/);
  const saved = await (await request.get(`/api/projects/${projectId}/canon`)).json();
  expect(saved.canon.entities.find((e: any) => e.id === entity.id).world.canvas).toEqual({ x: 30, y: 30 });
});

test('writing undo works before autosave, supports keyboard redo, and persists restored text', async ({ page, request, projectId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = page.locator('.pane-editor textarea.draft').first();
  const original = await editor.inputValue();
  expect(original).toContain('character-1'); expect(original).not.toMatch(/Kiala|Senna/i);
  await editor.fill('A new sentence.');
  await page.getByRole('button', { name: 'Undo writing', exact: true }).first().click();
  await expect(editor).toHaveValue(original);
  await editor.focus(); await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue('A new sentence.');
  await page.getByRole('button', { name: 'Undo writing', exact: true }).first().click();
  await expect.poll(async () => (await (await request.get(`/api/projects/${projectId}/documents/chapter-01`)).json()).content).toBe(original);
  await page.reload(); await expect(editor).toHaveValue(original);
  const { meta } = await (await request.post(`/api/projects/${projectId}/documents`, { data: { title: 'Travel — 狐', kind: 'notes' } })).json();
  const unicode = await request.put(`/api/projects/${projectId}/documents/${meta.id}`, { headers: { 'x-muse-history-session': 'unicode-history-test' }, data: { content: 'Unicode title' } });
  expect(unicode.ok()).toBeTruthy();
  expect(JSON.parse(decodeURIComponent(unicode.headers()['x-muse-history'])).undo.label).toBe('Write Travel — 狐');
});

test('saved undo restores created cards, survives reload, and refuses newer edits from another browser', async ({ page, request, projectId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Characters', exact: true }).click(); await page.getByRole('button', { name: /Add character/ }).click();
  const form = page.locator('[id="floating-characters:new"]');
  await form.getByPlaceholder('Character name').fill('Undo character');
  await form.getByRole('button', { name: 'Undo form edit', exact: true }).click();
  await expect(form.getByPlaceholder('Character name')).toHaveValue('');
  await form.getByRole('button', { name: 'Redo form edit', exact: true }).click();
  await expect(form.getByPlaceholder('Character name')).toHaveValue('Undo character');
  await form.getByRole('button', { name: 'Add to cast', exact: true }).click();
  const read = async () => (await (await request.get(`/api/projects/${projectId}/canon`)).json()).canon.entities;
  await expect.poll(async () => (await read()).length).toBe(1);
  await page.getByRole('button', { name: 'Undo saved change', exact: true }).click();
  await expect.poll(async () => (await read()).length).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: 'Redo saved change', exact: true }).click();
  await expect.poll(async () => (await read()).length).toBe(1);
  const entity = (await read())[0];
  await request.put(`/api/projects/${projectId}/canon/entities/${entity.id}`, { data: { name: 'Newer phone edit' } });
  await page.getByRole('button', { name: 'Undo saved change', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  expect((await read())[0].name).toBe('Newer phone edit');
});

test('saved undo restores removed reference with its image bytes', async ({ page, request, projectId }) => {
  await openTool(page, 'References');
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Undo image');
  const chooser = page.waitForEvent('filechooser'); await page.getByText('Choose images', { exact: true }).click();
  await (await chooser).setFiles(png);
  await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  const src = await page.getByRole('img', { name: 'Undo image', exact: true }).getAttribute('src');
  await page.getByRole('button', { name: 'Edit Undo image', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Undo image', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo saved change', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Undo image', exact: true })).toBeVisible();
  expect(await (await request.get(src!)).body()).toEqual(png.buffer);
});
