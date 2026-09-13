import { test, expect } from './fixtures';

test.use({ isMobile: true, hasTouch: true });

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
]) {
  test(`mobile workspace audit ${viewport.width}x${viewport.height}`, async ({ page, projectId }, testInfo) => {
    await page.setViewportSize(viewport);
    const observations: unknown[] = [];
    for (const name of ['Drafting', 'Characters', 'World Building', 'Plot Outline', 'Scenes', 'Dialogue', 'Themes', 'References', 'Goals', 'Progress', 'Sources']) {
      const button = name === 'Drafting'
        ? page.getByRole('button', { name, exact: true })
        : page.locator('.cards').getByRole('button', { name: new RegExp(`^${name}\\b`) });
      await button.tap();
      await expect(page.locator('main.workspace')).toBeVisible();
      await page.locator('.canvas').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${name.replaceAll(' ', '-')}.png`), animations: 'disabled' });
      observations.push(await page.evaluate((tool) => {
        const workspace = document.querySelector('main.workspace')!.getBoundingClientRect();
        const canvas = document.querySelector('.canvas')!.getBoundingClientRect();
        const tiny = Array.from(document.querySelectorAll('main.workspace button, main.workspace select')).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && (r.width < 24 || r.height < 24);
        }).map((el) => ({ name: el.getAttribute('aria-label') || el.textContent?.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
        return { tool, viewport: { width: innerWidth, height: innerHeight }, pageWidth: document.documentElement.scrollWidth, workspace: workspace.toJSON(), canvas: canvas.toJSON(), tiny };
      }, name));
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth), `${name}: page width`).toBeLessThanOrEqual(viewport.width);
      const canvas = (await page.locator('.canvas').boundingBox())!;
      expect.soft(canvas.height, `${name}: usable canvas height`).toBeGreaterThan(200);
    }
    await testInfo.attach('mobile-observations', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
    await page.getByRole('button', { name: 'Project menu', exact: true }).tap();
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await page.screenshot({ path: testInfo.outputPath('Settings.png'), animations: 'disabled' });
    const modal = page.locator('.settings-modal');
    await expect(modal).toBeVisible();
    const bounds = (await modal.boundingBox())!;
    expect.soft(bounds.x).toBeGreaterThanOrEqual(0);
    expect.soft(bounds.y).toBeGreaterThanOrEqual(0);
    expect.soft(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect.soft(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await modal.getByLabel('Projects folder', { exact: true }).scrollIntoViewIfNeeded();
    await expect(modal.getByLabel('Projects folder', { exact: true })).toBeInViewport();
    await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await modal.getByRole('button', { name: 'Close', exact: true }).tap();
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`touch writing and recovery ${viewport.width}x${viewport.height}`, async ({ page, request, projectId }, testInfo) => {
    await page.setViewportSize(viewport);
    const draft = page.locator('.pane-editor textarea.draft');
    await page.getByRole('button', { name: 'Focus writing', exact: true }).tap();
    await page.getByRole('button', { name: 'Hide writing controls', exact: true }).tap();
    await expect(draft).toBeInViewport();
    expect((await draft.boundingBox())!.height).toBeGreaterThan(viewport.height - 10);
    await draft.tap();
    const text = `A page written by touch. ${projectId}`;
    await draft.fill(text);
    await page.getByRole('button', { name: 'Show writing controls', exact: true }).tap();
    await page.getByRole('button', { name: 'Exit writing focus', exact: true }).tap();
    const { project } = await (await request.get(`/api/projects/${projectId}`)).json();
    const doc = project.documents.find((item: { kind: string }) => item.kind === 'manuscript');
    await expect.poll(async () => (await (await request.get(`/api/projects/${projectId}/documents/${doc.id}`)).json()).content).toBe(text);
    await page.reload();
    await expect(draft).toHaveValue(text);
    await page.getByRole('button', { name: 'Focus writing', exact: true }).tap();
    await page.getByRole('button', { name: 'Hide writing controls', exact: true }).tap();
    await page.screenshot({ path: testInfo.outputPath('quiet-writing.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Show writing controls', exact: true }).tap();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export document', exact: true }).tap();
    await page.getByRole('menuitem', { name: 'Markdown (.md)', exact: true }).tap();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.md$/);
    expect(await download.failure()).toBeNull();
    await page.getByRole('button', { name: 'Open story cards', exact: true }).tap();
    const cards = page.getByRole('dialog', { name: 'Story cards', exact: true });
    await expect(cards).toBeInViewport();
    await cards.getByRole('button', { name: /Close/ }).tap();
    await page.getByRole('button', { name: 'Exit writing focus', exact: true }).tap();
  });
}

test('touch editors save and recall all seven story record types on a small phone', async ({ page, projectId }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 568 });
  const cases = [
    ['Scenes', '+ Add scene', 'Scene title', 'Add to board'],
    ['Characters', 'Add character', 'Name', 'Add to cast'],
    ['World', '+ Place landmark', 'Name', 'Place landmark'],
    ['Plot', '+ Add beat', 'Title', 'Add to through-line'],
    ['Themes', '+ Add theme', 'Theme name', 'Add to map'],
    ['References', '+ Pin reference', 'Title', 'Pin to board'],
    ['Goals', '+ Add milestone', 'Milestone title', 'Add to route'],
  ];
  for (const [tool, add, label, save] of cases) {
    await page.locator('.cards').getByRole('button', { name: new RegExp(`^${tool}`) }).tap();
    await page.getByRole('button', { name: tool === 'Characters' ? /Add character/ : add, exact: true }).tap();
    const dialog = page.getByRole('dialog');
    const field = tool === 'Characters' ? dialog.getByPlaceholder('Character name') : dialog.getByLabel(label, { exact: true });
    const value = `${tool} mobile ${projectId}`;
    await field.fill(value);
    await dialog.getByRole('button', { name: 'Send to side', exact: true }).tap();
    await page.locator('.floating-panel-tab').last().tap();
    await expect(field).toHaveValue(value);
    const submit = dialog.getByRole('button', { name: save, exact: true });
    await expect(submit).toBeInViewport();
    // DOM rectangles can differ by floating-point rounding after a transform.
    expect((await submit.boundingBox())!.height).toBeGreaterThan(43.9);
    await submit.tap();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test('phone sources import, search, reading, and project backup stay reachable', async ({ page, projectId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.cards').getByRole('button', { name: /^Sources\b/ }).tap();
  await page.getByLabel('Choose source files').setInputFiles({
    name: 'phone-notes.md', mimeType: 'text/markdown',
    buffer: Buffer.from('# Pocket notes\n\nThe silver harbour waits for sunrise.\n'),
  });
  await expect(page.getByRole('heading', { name: 'phone-notes', exact: true })).toBeVisible();
  await page.getByLabel('Search story material').fill('silver harbour');
  await page.getByRole('button', { name: 'Open source', exact: true }).first().tap();
  await expect(page.getByRole('heading', { name: 'phone-notes', level: 3 })).toBeVisible();
  await page.getByLabel('Display title', { exact: true }).fill('Pocket research');
  await page.getByRole('button', { name: 'Save title', exact: true }).tap();
  await page.reload();
  await page.locator('.cards').getByRole('button', { name: /^Sources\b/ }).tap();
  await expect(page.getByRole('heading', { name: 'Pocket research', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Project backups', exact: true }).tap();
  const backups = page.getByRole('dialog', { name: 'Project backups', exact: true });
  const downloadPromise = page.waitForEvent('download');
  await backups.getByRole('button', { name: 'Download saved project', exact: true }).tap();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${projectId}-muse-backup.json`);
  expect(await download.failure()).toBeNull();
  await backups.getByRole('button', { name: 'Close backups', exact: true }).tap();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
