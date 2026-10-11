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
  await expect(thread.locator('.thread-messages').getByText('The harbour opening feels thin.')).toBeVisible();
  await thread.getByLabel('Add a note or ask Muse').fill('@Muse is the stake clear enough?');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.locator('.thread-messages').getByText(/Muse \(mock\) on "Arrival": is the stake clear enough\?/)).toBeVisible();
  await thread.getByRole('button', { name: 'Resolve note', exact: true }).click();
  await expect(thread.getByText('Resolved', { exact: true })).toBeVisible();
  await thread.press('Escape');
  await expect(thread).toHaveCount(0);

  await page.reload();
  const again = await openSceneCard(page, 'Arrival');
  await again.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Notes on Arrival', exact: true }).locator('.thread-messages').getByText('The harbour opening feels thin.')).toBeVisible();
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

test('undo restores combined notes and the open board follows', async ({ page, projectId, request }) => {
  const arrival = await seedScene(request, projectId, 'Arrival');
  const session = await page.evaluate(() => sessionStorage.getItem('muse:undo-session'));
  expect(session).toBeTruthy();
  for (const text of ['Arrival one', 'Arrival two']) {
    const response = await request.post(`/api/projects/${projectId}/threads`, { headers: { 'x-muse-history-session': session! }, data: { target: { kind: 'scene', id: arrival }, text } });
    expect(response.ok()).toBeTruthy();
  }
  const board = await openNotesBoard(page);
  const notes = board.locator('.board-note');
  await expect(notes).toHaveCount(2);
  await board.getByLabel('Select note on Arrival').first().check();
  await board.getByLabel('Select note on Arrival').nth(1).check();
  await board.getByRole('button', { name: /^Combine/ }).click();
  await expect(notes).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo saved change' }).click();
  await expect(notes).toHaveCount(2);
});

test('Escape inside another dialog is left to that dialog while a thread is open', async ({ page, projectId, request }) => {
  await seedScene(request, projectId, 'Arrival');
  const card = await openSceneCard(page, 'Arrival');
  await card.getByRole('button', { name: 'Notes', exact: true }).click();
  const thread = page.getByRole('dialog', { name: 'Notes on Arrival', exact: true });
  await expect(thread).toBeVisible();
  await page.getByRole('button', { name: 'Open connections', exact: true }).press('Enter');
  const connections = page.getByRole('dialog', { name: 'Tags and connections', exact: true });
  await expect(connections).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(connections).toHaveCount(0);
  await expect(thread).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(thread).toHaveCount(0);
});

test('a note takes a tag and a link, and shows up in the # panel by tag and under the linked card', async ({ page, projectId, request }) => {
  const arrival = await seedScene(request, projectId, 'Arrival');
  await seedScene(request, projectId, 'Return');
  await seedThread(request, projectId, arrival, 'Opening feels thin');
  const card = await openSceneCard(page, 'Arrival');
  await card.getByRole('button', { name: /^Notes/ }).click();
  const thread = page.getByRole('dialog', { name: 'Notes on Arrival', exact: true });
  await thread.getByRole('button', { name: '+ Tag' }).click();
  await thread.getByLabel('New tag', { exact: true }).fill('pacing');
  await thread.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(thread.getByRole('button', { name: 'Remove tag pacing' })).toBeVisible();
  await thread.getByRole('button', { name: '+ Link' }).click();
  await thread.getByLabel('Find a card to link').fill('Return');
  await thread.getByRole('button', { name: /^Link Scene: Return/ }).click();
  await expect(thread.getByRole('button', { name: 'Remove link Return' })).toBeVisible();
  await thread.getByRole('button', { name: 'Close notes' }).click();
  await expect(thread).toHaveCount(0);

  await page.getByRole('button', { name: 'Open connections', exact: true }).press('Enter');
  const panel = page.getByRole('dialog', { name: 'Tags and connections', exact: true });
  await panel.getByRole('button', { name: 'Filter tag pacing', exact: true }).click();
  await expect(panel.getByText('Opening feels thin')).toBeVisible();
  await panel.getByRole('button', { name: 'All records', exact: true }).click();
  await panel.getByRole('button', { name: /^Inspect Scene: Return/ }).click();
  await expect(panel.getByText('Note on Arrival')).toBeVisible();
});

test('a passage note is created from a selection, answered by @Muse, tagged, and jumped back to after reload', async ({ page, projectId }) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Mara lit the lantern at dusk. The harbour held its breath.');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(13, 20); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  const thread = page.getByRole('dialog', { name: /^Notes on / });
  await expect(thread.locator('.thread-quote')).toContainText('lantern');
  await thread.getByLabel('Add a note or ask Muse').fill('@Muse why a lantern?');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.locator('.thread-messages').getByText(/Muse \(mock\) on "/)).toBeVisible();
  await thread.getByRole('button', { name: '+ Tag' }).click();
  await thread.getByLabel('New tag', { exact: true }).fill('imagery');
  await thread.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(thread.getByRole('button', { name: 'Remove tag imagery' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  const board = await openNotesBoard(page);
  await board.getByRole('button', { name: 'Show all notes' }).click();
  await expect(board.locator('.thread-quote')).toContainText('lantern');
  await board.getByRole('button', { name: 'Open card' }).click();
  await expect(page.getByRole('dialog', { name: /^Notes on / }).locator('.thread-quote')).toContainText('lantern');
  const selected = await page.locator('.pane-editor textarea.draft').evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(selected).toBe('lantern');
});

test('after the text around a passage is edited the note still finds it; after the quote is deleted it says so', async ({ page, projectId }) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Mara lit the lantern at dusk. The harbour held its breath.');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(13, 20); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  const thread = page.getByRole('dialog', { name: /^Notes on / });
  await thread.getByLabel('Add a note or ask Muse').fill('keep an eye on this');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.locator('.thread-messages').getByText('keep an eye on this')).toBeVisible();
  await page.keyboard.press('Escape');

  await draft.fill('Intro added. Mara lit the lantern at dusk. The harbour held its breath.');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(0, 0); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /^Notes on / }).locator('.thread-passages')).toContainText(/found|moved/);
  await page.keyboard.press('Escape');

  await draft.fill('Completely rewritten.');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(0, 0); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /^Notes on / }).locator('.thread-passages')).toContainText("can't be found");
});

test('the document popover with a passage note and the chip row fit a phone viewport', async ({ page, projectId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Mara lit the lantern at dusk. The harbour held its breath.');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(13, 20); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  const thread = page.getByRole('dialog', { name: /^Notes on / });
  await thread.getByLabel('Add a note or ask Muse').fill('phone passage note');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.locator('.thread-messages').getByText('phone passage note')).toBeVisible();
  await thread.getByRole('button', { name: '+ Tag' }).click();
  const box = await thread.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('selecting another passage and pressing Note while the thread is open starts a note on the new passage', async ({ page, projectId }) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Mara lit the lantern at dusk. The harbour held its breath.');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(13, 20); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  const thread = page.getByRole('dialog', { name: /^Notes on / });
  await expect(thread.locator('.thread-quote')).toContainText('lantern');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(30, 41); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  await expect(thread.locator('.thread-quote')).toContainText('The harbour');
  await thread.getByLabel('Add a note or ask Muse').fill('about the harbour');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.locator('.thread-passages')).toContainText('The harbour');
});
