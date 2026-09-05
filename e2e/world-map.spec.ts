import { test, expect, openTool, png } from './fixtures';

test('atlas background uploads, adjusts opacity and visibility, and survives reload', async ({ page, request, projectId }) => {
  await openTool(page, 'World');
  await page.getByRole('button', { name: 'Atlas background controls' }).click();
  await expect(page.getByText('No background image set.')).toBeVisible();

  await page.getByLabel('Upload image', { exact: true }).setInputFiles(png);
  await expect(page.locator('.world-map-panel-body img')).toBeVisible();

  const layer = page.locator('.world-map-layer');
  await expect(layer).toBeVisible();
  const src = await layer.getAttribute('src');
  expect(src).toContain(`/api/projects/${projectId}/assets/images/`);
  const stored = await request.get(src!);
  expect(stored.ok()).toBeTruthy();
  expect(await stored.body()).toEqual(png.buffer);

  await page.getByLabel('Opacity').fill('0.2');
  await expect(layer).toHaveCSS('opacity', '0.2');
  await page.getByLabel('Opacity').blur();
  await expect.poll(async () => (await (await request.get(`/api/projects/${projectId}/world-map`)).json()).worldMap.opacity).toBe(.2);

  await page.getByLabel('Show on canvas').click();
  await expect(page.getByLabel('Show on canvas')).not.toBeChecked();
  await expect(layer).toHaveCount(0);
  await page.getByLabel('Show on canvas').click();
  await expect(page.getByLabel('Show on canvas')).toBeChecked();
  await expect(layer).toBeVisible();

  await page.reload();
  await openTool(page, 'World');
  await expect(page.locator('.world-map-layer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Atlas background controls' }).click();
  await page.getByLabel('Show on canvas').click();
  await expect(page.getByLabel('Show on canvas')).toBeChecked();
  await expect(page.locator('.world-map-layer')).toHaveCSS('opacity', '0.2');
  const persisted = await (await request.get(`/api/projects/${projectId}/world-map`)).json();
  expect(persisted.worldMap.image.src).toBe(src);
});

test('removing a reference garbage collects its image even while the world map keeps using it hidden', async ({ page, request, projectId }) => {
  await openTool(page, 'References');
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Shared atlas source');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose images', { exact: true }).click();
  await (await chooser).setFiles(png);
  await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shared atlas source', exact: true })).toBeVisible();
  const image = page.getByRole('img', { name: 'Shared atlas source', exact: true });
  const src = await image.getAttribute('src');

  await request.put(`/api/projects/${projectId}/world-map`, { data: { image: { id: 'shared', src, caption: '', tags: [] }, visible: false } });

  await page.getByRole('button', { name: 'Edit Shared atlas source', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shared atlas source', exact: true })).toHaveCount(0);

  const survives = await request.get(src!);
  expect(survives.ok()).toBeTruthy();
  const { worldMap } = await (await request.get(`/api/projects/${projectId}/world-map`)).json();
  expect(worldMap.image.src).toBe(src);
});
