import { test, expect, png } from './fixtures';

test('long project lists keep creation and settings reachable on desktop and phone', async ({ page, request, projectId }) => {
  const projects = await Promise.all(Array.from({ length: 24 }, (_, index) => request.post('/api/projects', {
    data: { name: `Long menu ${projectId} ${index}` },
  })));
  for (const response of projects) expect(response.ok()).toBeTruthy();
  await page.reload();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Project menu' }).click();
    await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
    const list = page.getByRole('group', { name: 'Available projects' });
    const lastProject = list.getByRole('button').last();
    await lastProject.scrollIntoViewIfNeeded();
    await expect(lastProject).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Project menu' }).click();
  }
});

test('phone-sized story tools keep uploads and save actions inside the viewport', async ({ page, projectId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const expectNoPageOverflow = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  };
  for (const name of ['Themes', 'Goals', 'Progress', 'References']) {
    await page.getByRole('button', { name: new RegExp(`^${name}\\b`) }).click();
    await expectNoPageOverflow();
    const workspace = await page.getByRole('main').filter({ has: page.getByRole('heading', { level: 1 }) }).boundingBox();
    expect(workspace!.width).toBeGreaterThan(340);
  }
  await page.getByRole('button', { name: '+ Pin reference', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Pocket moodboard');
  await page.getByLabel('Choose images').setInputFiles(png);
  await expect(page.getByLabel('Caption for reference image 1')).toBeVisible();
  await page.getByLabel('Caption for reference image 1').fill('Pocket light');
  await expectNoPageOverflow();
  await expect(page.getByRole('button', { name: 'Pin to board', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Pin to board', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /^References\b/ }).click();
  await expect(page.getByRole('img', { name: 'Pocket light', exact: true })).toHaveJSProperty('naturalWidth', 1);
  await expectNoPageOverflow();

  // A compact navigation rail must not clip its project/settings popover.
  await page.getByRole('button', { name: 'Project menu' }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
});

test('narrow drafting keeps the manuscript readable alongside companion panes', async ({ page, projectId }) => {
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Drafting', exact: true }).click();
    const manuscript = page.getByRole('textbox').first();
    await expect(manuscript).toHaveValue(/Chapter One/);
    const bounds = await manuscript.boundingBox();
    expect(bounds!.width).toBeGreaterThan(300);
    expect(bounds!.height).toBeGreaterThan(200);
    await expect(manuscript).toBeInViewport();
    // Companion panes remain present and can be scrolled into view.
    await page.getByPlaceholder('Ask Muse…').scrollIntoViewIfNeeded();
    await expect(page.getByPlaceholder('Ask Muse…')).toBeInViewport();
    await manuscript.scrollIntoViewIfNeeded();
    await expect(manuscript).toBeInViewport();
  }
});
