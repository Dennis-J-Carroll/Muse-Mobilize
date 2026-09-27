import { test, expect } from './fixtures';

test('legend opens from the logo icon and Alt+Shift+/, lists shortcuts, and returns focus', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const trigger = page.locator('.workspace-head').getByRole('button', { name: 'Keyboard shortcuts', exact: true });
  await trigger.click();
  const legend = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(legend).toBeVisible();
  for (const label of ['Enter or leave focus', 'Open desk 1–9', 'Back to previous arrangement', 'Find a desk', 'Recall a floating card', 'Show these shortcuts']) await expect(legend.getByText(label)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(legend).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Alt+Shift+Slash');
  await expect(legend).toBeVisible();
  await page.keyboard.press('Escape');
});

test('legend trigger stays reachable with the sidebar collapsed and in focus mode', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Collapse tool menu', exact: true }).click();
  await expect(page.locator('.workspace-head').getByRole('button', { name: 'Keyboard shortcuts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand tool menu', exact: true }).click();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  const focusTrigger = page.locator('.writing-focus-actions').getByRole('button', { name: 'Keyboard shortcuts', exact: true });
  await expect(focusTrigger).toBeVisible();
  await focusTrigger.click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible(); // Esc closed the legend only
});
