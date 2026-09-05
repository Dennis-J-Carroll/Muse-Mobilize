import { test, expect, openTool } from './fixtures';

test('whole-number milestone target saves and survives reload', async ({ page, projectId }) => {
  await openTool(page, 'Goals');
  await page.getByRole('button', { name: '+ Add milestone', exact: true }).click();
  await page.getByLabel('Milestone title').fill('Finish first act');
  await page.getByLabel('Target manuscript words').fill('25000');
  await page.getByLabel('Definition of done').fill('Council reversal drafted.');
  await page.getByRole('button', { name: 'Add to route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Finish first act', exact: true })).toBeVisible();
  await page.reload();
  await openTool(page, 'Goals');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Target manuscript words')).toHaveValue('25000');
  await expect(page.getByLabel('Definition of done')).toHaveValue('Council reversal drafted.');
});

test('pending milestone save protects session target and route order', async ({ page, request, projectId }) => {
  expect((await request.put(`/api/projects/${projectId}/goals`, { data: { milestones: [
    { title: 'First draft', status: 'not_started' }, { title: 'Revision pass', status: 'not_started' },
  ] } })).ok()).toBeTruthy();
  await openTool(page, 'Goals');
  await page.getByLabel('Focus', { exact: true }).fill('Keep this session focus');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const saving = new Promise<void>((resolve) => { started = resolve; });
  let first = true;
  await page.route(`**/api/projects/${projectId}/goals`, async (route) => {
    if (route.request().method() === 'PUT' && first) {
      first = false;
      started();
      await pending;
    }
    await route.continue();
  });
  await page.getByLabel('Status for First draft').selectOption('completed');
  await saving;
  try {
    await expect(page.getByRole('button', { name: 'Save session target', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByLabel('Status for First draft')).toHaveValue('completed');
  await expect(page.getByRole('button', { name: 'Save session target', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save session target', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save session target', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Move Revision pass earlier', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move Revision pass earlier', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move Revision pass later', exact: true })).toBeEnabled();
  await page.reload();
  await openTool(page, 'Goals');
  await expect(page.getByLabel('Focus', { exact: true })).toHaveValue('Keep this session focus');
  await expect(page.getByLabel('Status for First draft')).toHaveValue('completed');
  await expect(page.locator('.goal-card h4')).toHaveText(['Revision pass', 'First draft']);
});

test('session targets accept any whole word and minute count', async ({ page, projectId }) => {
  await openTool(page, 'Goals');
  await page.getByLabel('Focus', { exact: true }).fill('A short focused session');
  await page.getByLabel('Words', { exact: true }).fill('125');
  await page.getByLabel('Minutes', { exact: true }).fill('17');
  await page.getByRole('button', { name: 'Save session target', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Writing goals updated.');
  await page.reload();
  await openTool(page, 'Goals');
  await expect(page.getByLabel('Words', { exact: true })).toHaveValue('125');
  await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('17');
  await expect(page.getByLabel('Focus', { exact: true })).toHaveValue('A short focused session');
});
