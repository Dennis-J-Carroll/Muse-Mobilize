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

  await page.getByRole('button', { name: 'Collapse atlas background controls' }).click();
  await expect(page.locator('.world-map-panel')).toHaveCount(0);
  await expect(layer).toBeVisible();

  await page.reload();
  await openTool(page, 'World');
  // Wait for the persisted map, not the brief empty state during loading.
  await expect(layer).toBeVisible();
  await expect(layer).toHaveCSS('opacity', '0.2');
  await page.getByRole('button', { name: 'Atlas background controls' }).click();
  await expect(page.getByLabel('Show on canvas')).toBeChecked();
  await page.getByLabel('Show on canvas').click();
  await expect(page.getByLabel('Show on canvas')).not.toBeChecked();
  await expect(layer).toHaveCount(0);

  await page.reload();
  await openTool(page, 'World');
  // Hidden maps reopen their controls once loaded, with the preview intact.
  await expect(page.locator('.world-map-panel-body img')).toBeVisible();
  await expect(page.getByLabel('Show on canvas')).not.toBeChecked();
  await expect(layer).toHaveCount(0);
  await page.getByLabel('Show on canvas').click();
  await expect(page.getByLabel('Show on canvas')).toBeChecked();
  await expect(page.locator('.world-map-layer')).toHaveCSS('opacity', '0.2');
  const persisted = await (await request.get(`/api/projects/${projectId}/world-map`)).json();
  expect(persisted.worldMap.image.src).toBe(src);
});

test('removing a reference retains its image while the hidden world map still uses it', async ({ page, request, projectId }) => {
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

test('large atlas backgrounds fit fully on a phone canvas', async ({ page, projectId }) => {
  // Use a real large PNG, not the 1px upload fixture, to exercise camera bounds.
  await page.setViewportSize({ width: 1600, height: 1200 });
  const map = await page.screenshot();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^World Building/ }).click();
  await page.getByRole('button', { name: 'Atlas background controls' }).click();
  await page.getByLabel('Upload image', { exact: true }).setInputFiles({ name: 'large-atlas.png', mimeType: 'image/png', buffer: map });
  await expect(page.getByRole('button', { name: 'Fit to canvas', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Fit to canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse atlas background controls' }).click();
  const canvas = (await page.locator('.world-viewport').boundingBox())!;
  const fitted = (await page.locator('.world-map-layer').boundingBox())!;
  expect(fitted.x).toBeGreaterThanOrEqual(canvas.x);
  expect(fitted.y).toBeGreaterThanOrEqual(canvas.y);
  expect(fitted.x + fitted.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(fitted.y + fitted.height).toBeLessThanOrEqual(canvas.y + canvas.height);
});
