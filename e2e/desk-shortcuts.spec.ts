import { test, expect } from './fixtures';

async function saveDesk(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name').fill(name);
  await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  await page.getByRole('button', { name: 'Close saved desks', exact: true }).click();
}
const layout = (page: import('@playwright/test').Page) => page.getByLabel('Document tiles');

test('Alt+Shift+N restores desk N, Alt+Shift+0 bounces back, switcher finds by name', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await layout(page).selectOption('columns');
  await saveDesk(page, 'Columns desk');
  await layout(page).selectOption('rows');
  await saveDesk(page, 'Rows desk');
  await layout(page).selectOption('grid');

  await page.keyboard.press('Alt+Shift+1');
  await expect(layout(page)).toHaveValue('columns');
  await page.keyboard.press('Alt+Shift+2');
  await expect(layout(page)).toHaveValue('rows');
  await page.keyboard.press('Alt+Shift+0');
  await expect(layout(page)).toHaveValue('columns');
  await page.keyboard.press('Alt+Shift+0');
  await expect(layout(page)).toHaveValue('rows');
  await page.keyboard.press('Alt+Shift+7'); // no seventh desk: nothing happens
  await expect(layout(page)).toHaveValue('rows');

  await page.keyboard.press('Alt+Shift+D');
  const switcher = page.getByRole('dialog', { name: 'Find a desk' });
  await expect(switcher).toBeVisible();
  await switcher.getByLabel('Filter desks').fill('colu');
  await page.keyboard.press('Enter');
  await expect(switcher).toBeHidden();
  await expect(layout(page)).toHaveValue('columns');
});

test('desk keys stay quiet while typing in a form field', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await layout(page).selectOption('columns');
  await saveDesk(page, 'Columns desk');
  await layout(page).selectOption('rows');
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name').focus();
  await page.keyboard.press('Alt+Shift+1');
  await page.keyboard.press('Escape');
  await expect(layout(page)).toHaveValue('rows');
});

test('Move up changes which desk a number opens', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await layout(page).selectOption('columns');
  await saveDesk(page, 'Columns desk');
  await layout(page).selectOption('rows');
  await saveDesk(page, 'Rows desk');
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByRole('button', { name: 'Move Rows desk up', exact: true }).click();
  await page.getByRole('button', { name: 'Close saved desks', exact: true }).click();
  await layout(page).selectOption('grid');
  await page.keyboard.press('Alt+Shift+1');
  await expect(layout(page)).toHaveValue('rows');
});
