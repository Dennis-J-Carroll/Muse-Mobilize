import { test, expect, openTool } from './fixtures';

test('theme metadata and every lifecycle state persist in scene order', async ({ page, request, projectId }) => {
  for (const title of ['Arrival', 'Return']) {
    expect((await request.post(`/api/projects/${projectId}/scenes`, { data: { title } })).ok()).toBeTruthy();
  }
  await openTool(page, 'Themes');
  await page.getByRole('button', { name: '+ Add theme', exact: true }).click();
  await page.getByLabel('Theme name').fill('Belonging');
  await page.getByLabel('Recurring motif').fill('Open doors');
  await page.getByLabel('Dramatic question').fill('Who gets to return?');
  await page.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit theme Belonging', exact: true })).toContainText('Open doors');
  await expect(page.getByRole('columnheader').filter({ hasText: /Arrival|Return/ })).toHaveText(['01 · UnsectionedArrival', '02 · UnsectionedReturn']);

  const states = ['Not present', 'Appears', 'Echoes', 'Fades', 'Resolves', 'Not present'];
  for (let index = 0; index < states.length - 1; index++) {
    await page.getByRole('button', { name: `Belonging in Arrival: ${states[index]}. Change to ${states[index + 1]}.`, exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Belonging in Arrival: ${states[index + 1]}\\.`) })).toBeEnabled();
    await page.reload();
    await openTool(page, 'Themes');
    await expect(page.getByRole('button', { name: new RegExp(`^Belonging in Arrival: ${states[index + 1]}\\.`) })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Edit theme Belonging', exact: true }).click();
  await expect(page.getByLabel('Recurring motif')).toHaveValue('Open doors');
  await expect(page.getByLabel('Dramatic question')).toHaveValue('Who gets to return?');
});
