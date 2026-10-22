import { test, expect } from './fixtures';

test('writing desk is opt-in, gives prose more space, and restores the previous arrangement without replacing drafts', async ({ page, projectId }, testInfo) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 720 });
  const draft = page.getByRole('textbox', { name: 'Chapter One', exact: true });
  const question = page.getByRole('textbox', { name: 'Ask Muse', exact: true });
  await expect(draft).toBeVisible();
  const originalText = await draft.inputValue();
  await question.fill('Keep this unsent question through desk changes.');
  const originalBounds = await draft.boundingBox();
  await expect(page.getByRole('button', { name: 'Hide writing tools', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your desks' });
  await dialog.getByRole('combobox', { name: 'Reference pane', exact: true }).selectOption({ label: 'Muse' });
  await dialog.getByRole('button', { name: 'Use writing desk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show writing tools', exact: true })).toBeVisible();
  await expect(question).toBeVisible();
  await expect(question).toHaveValue('Keep this unsent question through desk changes.');
  await expect(draft).toHaveValue(originalText);
  const writingBounds = await draft.boundingBox();
  expect(writingBounds!.height).toBeGreaterThan(originalBounds!.height + 100);
  expect(writingBounds!.width).toBeGreaterThan(originalBounds!.width);
  await page.screenshot({ path: testInfo.outputPath('writing-desk-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await dialog.getByRole('button', { name: 'Previous arrangement', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide writing tools', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse tool menu', exact: true })).toBeVisible();
  expect(await draft.boundingBox()).toEqual(originalBounds);
  await expect(question).toHaveValue('Keep this unsent question through desk changes.');
  await expect(draft).toHaveValue(originalText);
});

test('each named document reports its own words and save state, including a failed save', async ({ page, projectId }) => {
  const manuscript = page.getByRole('textbox', { name: 'Chapter One', exact: true });
  const notes = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  const manuscriptStatus = page.getByRole('group', { name: 'Chapter One status', exact: true });
  const notesStatus = page.getByRole('group', { name: 'Scratchpad status', exact: true });
  await expect(manuscriptStatus).toContainText('No unsaved changes');
  await expect(notesStatus).toContainText('No unsaved changes');
  await page.route(`**/api/projects/${projectId}/documents/*`, async (route) => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 500, json: { error: 'Test save unavailable' } });
    else await route.continue();
  });
  await manuscript.fill('Three manuscript words');
  await notes.fill('Two words');
  await manuscript.focus();
  await expect(manuscriptStatus).toContainText('3 words');
  await expect(notesStatus).toContainText('2 words');
  await expect(page.getByText('Could not save: Test save unavailable', { exact: true })).toBeVisible();
  await expect(manuscriptStatus).toContainText('Unsaved changes');
  await expect(notesStatus).toContainText('Unsaved changes');
  await page.unroute(`**/api/projects/${projectId}/documents/*`);
  // Blur flushes each document; a successful save must change only its owner's state.
  await notes.focus();
  await expect(manuscriptStatus).toContainText('Saved at');
  await manuscript.focus();
  await expect(notesStatus).toContainText('Saved at');
});

test('writing desk can be saved and recalled on a phone without horizontal overflow', async ({ page, projectId }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your desks' });
  await dialog.getByRole('combobox', { name: 'Reference pane', exact: true }).selectOption({ label: 'Muse' });
  await dialog.getByRole('button', { name: 'Use writing desk', exact: true }).click();
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Desk name', exact: true }).fill('My writing desk');
  await dialog.getByRole('button', { name: 'Save desk', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close saved desks', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore My writing desk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show writing tools', exact: true })).toBeVisible();
  const manuscript = page.locator('.pane-editor');
  const muse = page.locator('.pane-agent');
  const manuscriptBounds = await manuscript.boundingBox();
  const museBounds = await muse.boundingBox();
  expect(museBounds!.y).toBeGreaterThanOrEqual(manuscriptBounds!.y + manuscriptBounds!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('writing-desk-phone.png'), animations: 'disabled' });
  await page.getByRole('textbox', { name: 'Ask Muse', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('textbox', { name: 'Ask Muse', exact: true })).toBeInViewport();
});
