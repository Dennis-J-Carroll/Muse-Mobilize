import { test, expect } from './fixtures';

test('selecting the current project never reloads its in-progress workspace', async ({ page, projectId }) => {
  const muse = page.getByPlaceholder('Ask Muse…');
  await expect(muse).toBeVisible();
  await muse.fill('Keep this unsent question when I select the same story.');
  const name = await page.locator('.workspace-head h1').innerText();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  // A same-project selection is a UI no-op, not a request to reopen the story.
  const reopened = page.waitForRequest((request) => request.url().endsWith(`/api/projects/${projectId}`), { timeout: 700 }).catch(() => null);
  await page.getByRole('button', { name, exact: true }).click();
  expect(await reopened, 'Current-project selection must not request a destructive reload').toBeNull();
  await expect(muse).toHaveValue('Keep this unsent question when I select the same story.');
});
