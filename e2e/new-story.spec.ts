import { test, expect } from './fixtures';

test('a new story starts from an idea, which becomes the working premise', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const form = page.getByRole('dialog', { name: 'New story' });
  await expect(form.getByRole('heading', { name: "What's the idea?" })).toBeVisible();
  await form.getByLabel("What's the idea?").fill('a lighthouse keeper hears the sea answer back.');
  await expect(form.getByLabel('Story name (optional)')).toHaveAttribute('placeholder', 'A Lighthouse Keeper Hears The');
  await form.getByRole('button', { name: 'Start writing' }).dblclick();
  await expect(page.getByRole('heading', { name: 'A Lighthouse Keeper Hears The', level: 1 })).toBeVisible();
  await expect(page.locator('.premise-workspace').getByRole('textbox', { name: 'Working premise' }))
    .toHaveValue('a lighthouse keeper hears the sea answer back.');
  await page.getByRole('button', { name: 'Project menu' }).click();
  await expect(page.getByRole('button', { name: 'A Lighthouse Keeper Hears The', exact: true })).toHaveCount(1);
});

test('an over-long idea cannot be submitted', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const form = page.getByRole('dialog', { name: 'New story' });
  await form.getByLabel("What's the idea?").fill('x'.repeat(1201));
  await expect(form.getByText('1201 / 1200')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Start writing' })).toBeDisabled();
});

test('an idea with no words starts an untitled story without a premise', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const created = page.waitForRequest((request) => request.url().endsWith('/api/projects') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const form = page.getByRole('dialog', { name: 'New story' });
  await form.getByLabel("What's the idea?").fill('…?!');
  await form.getByRole('button', { name: 'Start writing' }).click();
  expect((await created).postDataJSON()).toEqual({ name: 'Untitled Story' });
  await expect(page.getByRole('heading', { name: 'Untitled Story', level: 1 })).toBeVisible();
  await expect(page.locator('.premise-workspace')).toHaveCount(0);
});

test('skipping the idea gives an untitled page', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const form = page.getByRole('dialog', { name: 'New story' });
  await form.getByRole('button', { name: 'Skip, just give me a page' }).click();
  await expect(page.getByRole('heading', { name: 'Untitled Story', level: 1 })).toBeVisible();
  await expect(page.locator('.premise-workspace')).toHaveCount(0);
});

test('Escape and the backdrop close the form and return focus to the Project menu', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const menuButton = page.getByRole('button', { name: 'Project menu' });
  const form = page.getByRole('dialog', { name: 'New story' });
  await menuButton.click();
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(form.getByLabel("What's the idea?")).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(menuButton).toBeFocused();

  await menuButton.click();
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(form).toBeVisible();
  await page.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } });
  await expect(form).toHaveCount(0);
  await expect(menuButton).toBeFocused();
});
