import { test, expect, openTool } from './fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

async function seedScene(request: APIRequestContext, projectId: string, title: string): Promise<string> {
  const response = await request.post(`/api/projects/${projectId}/scenes`, { data: { title } });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return (body.scene ?? body).id;
}

async function seedThread(request: APIRequestContext, projectId: string, sceneId: string, text: string) {
  const response = await request.post(`/api/projects/${projectId}/threads`, { data: { target: { kind: 'scene', id: sceneId }, text } });
  expect(response.ok()).toBeTruthy();
}

async function openSceneCard(page: Page, title: string) {
  await openTool(page, 'Scenes');
  await page.locator('.scene-lane').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: 'Edit', exact: true }).click();
  return page.getByRole('dialog', { name: `Revise ${title}`, exact: true });
}

async function openNotesBoard(page: Page) {
  await page.locator('.cards').getByRole('button', { name: /^Story Idea\b/ }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Notes Board' }).click();
  return page.locator('.threads-board');
}

test('a card thread takes a note and an @Muse reply, resolves, and survives reload', async ({ page, projectId, request }) => {
  await seedScene(request, projectId, 'Arrival');
  const card = await openSceneCard(page, 'Arrival');
  await card.getByRole('button', { name: 'Notes', exact: true }).click();
  const thread = page.getByRole('dialog', { name: 'Notes on Arrival', exact: true });
  await thread.getByLabel('Add a note or ask Muse').fill('The harbour opening feels thin.');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.getByText('The harbour opening feels thin.')).toBeVisible();
  await thread.getByLabel('Add a note or ask Muse').fill('@Muse is the stake clear enough?');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.getByText(/Muse \(mock\) on "Arrival": is the stake clear enough\?/)).toBeVisible();
  await thread.getByRole('button', { name: 'Resolve note', exact: true }).click();
  await expect(thread.getByText('Resolved', { exact: true })).toBeVisible();
  await thread.press('Escape');
  await expect(thread).toHaveCount(0);

  await page.reload();
  const again = await openSceneCard(page, 'Arrival');
  await again.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Notes on Arrival', exact: true }).getByText('The harbour opening feels thin.')).toBeVisible();
});

test('the Notes Board edits, trashes, restores, combines same-card notes, and jumps back to the card', async ({ page, projectId, request }) => {
  const arrival = await seedScene(request, projectId, 'Arrival');
  const returned = await seedScene(request, projectId, 'Return');
  await seedThread(request, projectId, arrival, 'Arrival one');
  await seedThread(request, projectId, arrival, 'Arrival two');
  await seedThread(request, projectId, returned, 'Return one');
  const board = await openNotesBoard(page);
  const notes = board.locator('.board-note');
  await expect(notes).toHaveCount(3);

  const returnNote = board.locator('.board-note', { hasText: 'Return one' });
  await returnNote.getByRole('button', { name: 'Edit' }).click();
  await returnNote.getByLabel('Edit note').fill('Return one, revised');
  await returnNote.getByRole('button', { name: 'Save' }).click();
  await expect(board.getByText('Return one, revised')).toBeVisible();

  await board.getByLabel('Select note on Arrival').first().check();
  await board.getByLabel('Select note on Return').check();
  await expect(board.getByRole('button', { name: /^Combine/ })).toBeDisabled();
  await expect(board.getByText('Combine works within one card')).toBeVisible();
  await board.getByLabel('Select note on Return').uncheck();
  await board.getByLabel('Select note on Arrival').nth(1).check();
  await board.getByRole('button', { name: /^Combine/ }).click();
  await expect(notes).toHaveCount(2);
  await expect(board.locator('.board-note', { hasText: 'Arrival one' })).toContainText('Arrival two');

  await board.locator('.board-note', { hasText: 'Return one, revised' }).getByRole('button', { name: 'Trash' }).click();
  await expect(notes).toHaveCount(1);
  await board.getByLabel('Filter notes').getByRole('button', { name: 'Trash', exact: true }).click();
  await board.getByRole('button', { name: 'Restore' }).click();
  await board.getByLabel('Filter notes').getByRole('button', { name: 'This session' }).click();
  await expect(notes).toHaveCount(2);

  await board.locator('.board-note', { hasText: 'Arrival one' }).getByRole('button', { name: 'Open card' }).click();
  await expect(page.getByRole('dialog', { name: 'Revise Arrival', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Notes on Arrival', exact: true }).getByText('Arrival two')).toBeVisible();
});

test('thread popover and board fit a phone viewport', async ({ page, projectId, request }) => {
  const arrival = await seedScene(request, projectId, 'Arrival');
  await seedThread(request, projectId, arrival, 'Phone note');
  await page.setViewportSize({ width: 390, height: 844 });
  const board = await openNotesBoard(page);
  await expect(board.getByText('Phone note')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await board.getByRole('button', { name: 'Open card' }).click();
  const sheet = page.getByRole('dialog', { name: 'Notes on Arrival', exact: true });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('after a reload the board explains that older notes are hidden and shows them on request', async ({ page, projectId, request }) => {
  const arrival = await seedScene(request, projectId, 'Arrival');
  await seedThread(request, projectId, arrival, 'Written before the reload');
  await page.reload();
  const board = await openNotesBoard(page);
  await expect(board.getByText('1 older note from before this session.')).toBeVisible();
  await board.getByRole('button', { name: 'Show all notes' }).click();
  await expect(board.getByText('Written before the reload')).toBeVisible();
});
