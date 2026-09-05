import { test, expect, openTool } from './fixtures';

test('Progress reflects saved manuscript, completed scenes, and revision decisions after reload', async ({ page, request, projectId }) => {
  for (const [title, status] of [['Arrival', 'planned'], ['Return', 'locked']]) {
    expect((await request.post(`/api/projects/${projectId}/scenes`, { data: { title, status } })).ok()).toBeTruthy();
  }
  const saved = page.waitForResponse((response) => response.url().endsWith(`/projects/${projectId}/documents/chapter-01`) && response.request().method() === 'PUT');
  await page.locator('.pane-editor textarea.draft').fill('Kiala opens the door.');
  expect((await saved).ok()).toBeTruthy();
  expect((await request.post(`/api/projects/${projectId}/events`, { data: {
    type: 'patch.proposed', actor: 'critic',
    payload: { patchId: 'qa-revision', documentId: 'chapter-01', reason: 'Clarify the choice.' },
  } })).ok()).toBeTruthy();
  await openTool(page, 'Progress');
  await expect(page.getByRole('img', { name: 'Word-flow from 4 to 4 words across 1 saves' })).toBeVisible();
  await expect(page.getByRole('button', { name: /✓ Return\s*locked/ })).toBeVisible();
  await expect(page.getByText('Clarify the choice.', { exact: true })).toBeVisible();
  await page.reload();
  await openTool(page, 'Progress');
  await expect(page.getByRole('img', { name: 'Word-flow from 4 to 4 words across 1 saves' })).toBeVisible();
  await expect(page.getByText('Clarify the choice.', { exact: true })).toBeVisible();
  expect((await request.post(`/api/projects/${projectId}/patches/reject`, { data: { patchId: 'qa-revision' } })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Queue clear', exact: true })).toBeVisible();
  await expect(page.getByText('Clarify the choice.', { exact: true })).toHaveCount(0);
});

test('accepted manuscript patch contributes to word-flow history', async ({ page, request, projectId }) => {
  const content = 'Kiala opens the door.';
  expect((await request.put(`/api/projects/${projectId}/documents/chapter-01`, { data: { content } })).ok()).toBeTruthy();
  await openTool(page, 'Progress');
  await expect(page.getByRole('img', { name: 'Word-flow from 4 to 4 words across 1 saves' })).toBeVisible();
  const start = content.indexOf('door');
  const response = await request.post(`/api/projects/${projectId}/patches/apply`, { data: {
    documentId: 'chapter-01',
    patch: { id: 'qa-word-flow', start, end: start + 4, beforeText: 'door', afterText: 'heavy bronze door', anchored: true, reason: 'Add material detail.' },
  } });
  expect(response.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Word-flow from 4 to 6 words across 2 saves' })).toBeVisible();
  await page.reload();
  await openTool(page, 'Progress');
  await expect(page.getByRole('img', { name: 'Word-flow from 4 to 6 words across 2 saves' })).toBeVisible();
});
