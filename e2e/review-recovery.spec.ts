import { test, expect } from './fixtures';

async function openReviewPane(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Workspace /, exact: false }).click();
  await page.getByRole('button', { name: 'Review pane', exact: true }).click();
}

test('a recovered patch with a persisted body can be accepted from the Review pane', async ({ page, request, projectId }) => {
  const content = 'Kiala opens the door.';
  expect((await request.put(`/api/projects/${projectId}/documents/chapter-01`, { data: { content } })).ok()).toBeTruthy();
  expect((await request.post(`/api/projects/${projectId}/events`, { data: {
    type: 'patch.proposed', actor: 'critic',
    payload: {
      patchId: 'qa-recovered', documentId: 'chapter-01', reason: 'Add material detail.',
      beforeText: 'door', afterText: 'heavy bronze door',
    },
  } })).ok()).toBeTruthy();

  await openReviewPane(page);
  await expect(page.getByText('Recovered revision')).toBeVisible();
  await expect(page.locator('.patch-before')).toHaveText('door');
  await expect(page.locator('.patch-after')).toHaveText('heavy bronze door');

  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText('No revisions waiting on you.')).toBeVisible();

  const doc = await (await request.get(`/api/projects/${projectId}/documents/chapter-01`)).json();
  expect(doc.content).toBe('Kiala opens the heavy bronze door.');
});

test('a recovered patch that no longer matches the document surfaces as stale, not a silent no-op', async ({ page, request, projectId }) => {
  expect((await request.put(`/api/projects/${projectId}/documents/chapter-01`, { data: { content: 'Kiala opens the window.' } })).ok()).toBeTruthy();
  expect((await request.post(`/api/projects/${projectId}/events`, { data: {
    type: 'patch.proposed', actor: 'critic',
    payload: {
      patchId: 'qa-stale', documentId: 'chapter-01', reason: 'Add material detail.',
      beforeText: 'door', afterText: 'heavy bronze door',
    },
  } })).ok()).toBeTruthy();

  await openReviewPane(page);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText('draft changed — stale')).toBeVisible();

  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('No revisions waiting on you.')).toBeVisible();
});

test('a recovered patch with no persisted body (pre-upgrade event) can only be dismissed', async ({ page, request, projectId }) => {
  expect((await request.post(`/api/projects/${projectId}/events`, { data: {
    type: 'patch.proposed', actor: 'critic',
    payload: { patchId: 'qa-legacy', documentId: 'chapter-01', reason: 'Older revision, no body.' },
  } })).ok()).toBeTruthy();

  await openReviewPane(page);
  await expect(page.getByText('Recovered revision')).toBeVisible();
  await expect(page.getByText('No saved content for this older revision — you can still dismiss it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('No revisions waiting on you.')).toBeVisible();

  const progress = await (await request.get(`/api/projects/${projectId}/progress`)).json();
  expect(progress.progress.unresolvedRevisions).toEqual([]);
});
