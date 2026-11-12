import { test, expect, openTool } from './fixtures';

const words = (n: number) => Array.from({ length: n }, () => 'lore').join(' ');
const COMPENDIUM = [
  'PART I: THE HOUSES', '',
  '1\\. House Varek — Full Lore Entry', '', words(300), '',
  '2\\. House Lorne', '', `Grey banners over the fen. ${words(20)}`, '',
  '3\\. House Akkar', '', words(260), '',
  '4\\. House Maren', '', words(240),
].join('\n');

test('source gate: Muse reads the whole source, suggests a ticket the writer accepts, and the ticket goes out and comes back', async ({ page, request, projectId }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1500, height: 1000 });
  const imported = await request.post(`/api/projects/${projectId}/sources`, { data: { name: 'compendium.md', data: Buffer.from(COMPENDIUM).toString('base64') } });
  expect(imported.ok()).toBeTruthy();

  // Gate: open the source and attach it to Muse.
  await openTool(page, 'Sources');
  await page.getByRole('button', { name: /^compendium/ }).click();
  const asks: any[] = [];
  page.on('request', (req) => { if (req.url().endsWith('/ask')) asks.push(req.postDataJSON()); });
  await page.getByRole('button', { name: 'Ask Muse about this source', exact: true }).click();
  const conversation = page.getByRole('region', { name: 'Muse conversation', exact: true });
  const attached = conversation.getByRole('region', { name: 'Attached to this conversation', exact: true });
  await expect(attached).toContainText('Source: compendium');
  await expect(attached).toContainText('Whole document sent to mock');

  // Empty Ask asks for ripe threads; the reply names the thin section.
  await conversation.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(conversation.locator('.run-text').getByText(/Muse \(mock\) on “House Lorne”/)).toBeVisible();
  expect(asks[0].focus.sourceId).toBeTruthy();
  expect(asks[0].question).toMatch(/thinnest subjects/);
  expect(asks[0].history).toEqual([]);

  // A suggestion is not saved until accepted.
  const suggestion = conversation.getByRole('region', { name: 'Suggested ticket: Explore House Lorne', exact: true });
  await expect(suggestion).toContainText('Suggested ticket · not saved');
  expect((await (await request.get(`/api/projects/${projectId}/tickets`)).json()).tickets).toEqual([]);
  await suggestion.getByRole('button', { name: 'Edit', exact: true }).click();
  await suggestion.getByLabel('Assignment').fill('Explore House Lorne and the fen');
  await suggestion.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await expect(conversation.getByText('Ticket saved: Explore House Lorne and the fen. Find it in Tickets.')).toBeVisible();
  const saved = (await (await request.get(`/api/projects/${projectId}/tickets`)).json()).tickets;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ title: 'Explore House Lorne and the fen', origin: 'muse', status: 'open', threads: ['House Lorne'] });

  // A follow-up carries the earlier exchange.
  await conversation.getByRole('textbox', { name: 'Ask Muse', exact: true }).fill('Dig into that one.');
  await conversation.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(conversation.locator('.run-text').getByText(/Picking up from what we said before/)).toBeVisible();
  expect(asks[1].history).toHaveLength(1);
  await conversation.getByRole('button', { name: 'Remove source compendium', exact: true }).click();
  await expect(attached).toBeHidden();

  // Out: export marks the ticket Out.
  await openTool(page, 'Tickets');
  await page.getByRole('button', { name: /Explore House Lorne and the fen/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('explore-house-lorne-and-the-fen.md');
  await expect(page.locator('.ticket-editor .tickets-head .ticket-status')).toHaveText('Out');

  // In: a returned file goes through Sources and marks the ticket Returned.
  await page.getByLabel('Choose returned file').setInputFiles({ name: 'lorne-notebook.md', mimeType: 'text/markdown', buffer: Buffer.from('# Lorne notebook\n\nThe grey banners hide a debt to House Varek.\n') });
  await expect(page.getByRole('list', { name: 'Returned files' })).toContainText('lorne-notebook');
  await expect(page.locator('.ticket-editor .tickets-head .ticket-status')).toHaveText('Returned');
  const sources = (await (await request.get(`/api/projects/${projectId}/sources`)).json()).sources;
  expect(sources.map((s: { title: string; classification: string }) => [s.title, s.classification])).toContainEqual(['lorne-notebook', 'notes']);

  // Back to Muse with the ticket: the reply responds to the returned file and the ticket remembers it.
  await page.getByRole('button', { name: 'Work on with Muse', exact: true }).click();
  await expect(attached).toContainText('Ticket: Explore House Lorne and the fen');
  await conversation.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(conversation.locator('.run-text').getByText(/Muse \(mock\) on your returned file “lorne-notebook”/)).toBeVisible();
  expect(asks[2].focus).toEqual({ ticketId: saved[0].id });
  await expect.poll(async () => (await (await request.get(`/api/projects/${projectId}/tickets`)).json()).tickets[0].log.length).toBe(1);
});

test('tickets: writer creates, edits, filters and deletes; returned files stay in Sources', async ({ page, request, projectId }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
  await openTool(page, 'Tickets');
  await expect(page.getByText(/No tickets yet/)).toBeVisible();
  await page.getByRole('button', { name: '+ New ticket', exact: true }).click();
  await page.getByLabel('Assignment').fill('Explore the Omorrii lore and Saras’s connection');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByLabel('Current wants').fill('Where Saras stands with the family.');
  await page.getByLabel(/Current threads/).fill('Saras\nCheliaous moon rites');
  await page.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save ticket', exact: true })).toBeDisabled();
  const [ticket] = (await (await request.get(`/api/projects/${projectId}/tickets`)).json()).tickets;
  expect(ticket).toMatchObject({ origin: 'writer', wants: 'Where Saras stands with the family.', threads: ['Saras', 'Cheliaous moon rites'] });

  await page.getByLabel('Choose returned file').setInputFiles({ name: 'saras.txt', mimeType: 'text/plain', buffer: Buffer.from('Saras was fostered in the moon court.') });
  await expect(page.getByRole('list', { name: 'Returned files' })).toContainText('saras');
  await page.getByLabel('Ticket status').selectOption('closed');
  await page.getByRole('button', { name: '← All tickets', exact: true }).click();
  await expect(page.getByText('No tickets here.')).toBeVisible();
  await page.getByRole('button', { name: /^Closed/ }).click();
  await page.getByRole('button', { name: /Explore the Omorrii lore/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete ticket…', exact: true }).click();
  await expect(page.getByText(/No tickets yet/)).toBeVisible();
  const sources = (await (await request.get(`/api/projects/${projectId}/sources`)).json()).sources;
  expect(sources.map((s: { title: string }) => s.title)).toContain('saras');
});
