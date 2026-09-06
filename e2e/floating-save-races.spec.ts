import { test, expect, openTool } from './fixtures';

test('overlapping milestone saves preserve both independent edits', async ({ page, request, projectId }) => {
  const response = await request.put(`/api/projects/${projectId}/goals`, { data: { milestones: [
    { id: 'a', title: 'Arrival', order: 0, status: 'not_started' },
    { id: 'b', title: 'Return', order: 1, status: 'not_started' },
  ] } });
  expect(response.ok()).toBeTruthy();
  await openTool(page, 'Goals');
  for (const title of ['Arrival', 'Return']) {
    await page.locator('.goal-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog', { name: `Revise ${title}`, exact: true }).getByLabel('Milestone title').fill(`${title} revised`);
    await page.keyboard.press('Escape');
  }
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  let first = true;
  await page.route(`**/projects/${projectId}/goals`, async (route) => {
    if (route.request().method() === 'PUT' && first) { first = false; started(); await held; }
    await route.continue();
  });
  try {
    await page.keyboard.press('Alt+1');
    await page.getByRole('button', { name: 'Save milestone', exact: true }).click();
    await firstStarted;
    await page.getByRole('button', { name: 'Send to side' }).click();
    await page.keyboard.press('Alt+2');
    await page.getByRole('button', { name: 'Save milestone', exact: true }).click();
  } finally { release(); }
  await expect(page.locator('.floating-drawer')).toHaveCount(0);
  const { goals } = await (await request.get(`/api/projects/${projectId}/goals`)).json();
  expect(goals.milestones.map((item: { title: string }) => item.title)).toEqual(['Arrival revised', 'Return revised']);
});

test('late scene save cannot populate the next project after its editors reset', async ({ page, projectId }) => {
  await openTool(page, 'Scenes');
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  await page.getByLabel('Scene title').fill('Old project scene');
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  await page.route(`**/projects/${projectId}/scenes`, async (route) => {
    if (route.request().method() === 'POST') { started(); await held; }
    await route.continue();
  });
  const saved = page.waitForResponse((response) => response.url().endsWith(`/projects/${projectId}/scenes`) && response.request().method() === 'POST');
  try {
    await page.getByRole('button', { name: 'Add to board', exact: true }).click();
    await requestStarted;
    await page.getByRole('button', { name: 'Project menu', exact: true }).click();
    const name = `Second project ${projectId}`;
    page.once('dialog', (dialog) => dialog.accept(name));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await expect(page.locator('.floating-drawer')).toHaveCount(0);
    await openTool(page, 'Scenes');
    await expect(page.getByRole('heading', { name: 'First scene starts lane' })).toBeVisible();
  } finally { release(); }
  await saved;
  // Let the save's event refresh settle before checking the visible new board.
  await expect(page.getByRole('heading', { name: 'Old project scene', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'First scene starts lane' })).toBeVisible();
});
