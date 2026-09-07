import fs from 'node:fs/promises';
import { test, expect, png } from './fixtures';

test('download and restore keeps saved text, connections, and image bytes in a separate project', async ({ page, request, projectId }) => {
  const { project: original } = await (await request.get(`/api/projects/${projectId}`)).json();
  const docId = original.documents.find((doc: { kind: string }) => doc.kind === 'manuscript').id;
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('The lantern survives the storm.');
  const { image } = await (await request.post(`/api/projects/${projectId}/assets/images`, { data: { name: png.name, mimeType: png.mimeType, data: png.buffer.toString('base64') } })).json();
  await request.post(`/api/projects/${projectId}/references`, { data: { title: 'Lantern', kind: 'image', images: [image], quote: '', url: '', attribution: '', sourceUrl: '', notes: '', entityRefs: [] } });
  const { tag } = await (await request.post(`/api/projects/${projectId}/connections/tags`, { data: { label: 'Storm' } })).json();
  await request.post(`/api/projects/${projectId}/connections/attachments`, { data: { target: { kind: 'document', id: docId }, tagId: tag.id } });
  await page.getByRole('button', { name: 'Project backups', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Project backups', exact: true });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download saved project', exact: true }).click();
  const artifact = await download;
  const file = await artifact.path();
  expect(file).toBeTruthy();
  const backup = await fs.readFile(file!);
  await request.put(`/api/projects/${projectId}/documents/${docId}`, { data: { content: 'New work in original project.' } });
  await dialog.getByLabel('Choose project backup').setInputFiles({ name: 'saved-story.json', mimeType: 'application/json', buffer: backup });
  await expect(dialog.getByText('Original project will not be overwritten.', { exact: true })).toBeVisible();
  const restoredResponse = page.waitForResponse((response) => response.url().endsWith('/api/projects/restore') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Restore as new project', exact: true }).click();
  const { project: restored } = await (await restoredResponse).json();
  expect(restored.id).not.toBe(projectId);
  await expect(page.getByRole('heading', { level: 1, name: `${original.name} (restored)`, exact: true })).toBeVisible();
  await expect(page.locator('.pane-editor textarea.draft')).toHaveValue('The lantern survives the storm.');
  expect((await (await request.get(`/api/projects/${projectId}/documents/${docId}`)).json()).content).toBe('New work in original project.');
  const { references } = await (await request.get(`/api/projects/${restored.id}/references`)).json();
  expect(references.items[0].images[0].src).toContain(`/api/projects/${restored.id}/assets/images/`);
  expect(await (await request.get(references.items[0].images[0].src)).body()).toEqual(png.buffer);
  const { connections } = await (await request.get(`/api/projects/${restored.id}/connections`)).json();
  expect(connections.tags[0].id).toBe(tag.id);
  expect(connections.attachments[0].target.id).toBe(docId);
});

test('invalid backup is rejected without creating a project', async ({ page, request, projectId }) => {
  expect(projectId).toBeTruthy();
  const before = (await (await request.get('/api/projects')).json()).projects.length;
  await page.getByRole('button', { name: 'Project backups', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Project backups', exact: true });
  await dialog.getByLabel('Choose project backup').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(dialog.getByRole('alert')).toContainText('Could not read this backup');
  await expect(dialog.getByRole('button', { name: 'Restore as new project', exact: true })).toBeDisabled();
  expect((await (await request.get('/api/projects')).json()).projects.length).toBe(before);
});
