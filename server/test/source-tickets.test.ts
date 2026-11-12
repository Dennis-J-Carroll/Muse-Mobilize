import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-source-tickets-'));
process.env.MUSE_CONFIG_DIR = path.join(root, 'config');
await fs.mkdir(process.env.MUSE_CONFIG_DIR);
await fs.writeFile(path.join(process.env.MUSE_CONFIG_DIR, 'settings.json'), JSON.stringify({ workspaceRoot: root, defaultProvider: 'mock' }));
const { createProject, projectDir, writeDocument } = await import('../src/projects.js');
const { importSource, deleteSource } = await import('../src/sources.js');
const { sourceSections, sectionSubject, countMentions, renderDepthMap } = await import('../src/source-map.js');
const { parseAgentOutput } = await import('../src/protocol.js');
const tickets = await import('../src/tickets.js');
const { buildFocus, validateFocus, FOCUS_SMALL_MODEL_MAX } = await import('../src/focus.js');
const { runAgent } = await import('../src/agents.js');
const { exportProjectBackup, restoreProjectBackup } = await import('../src/backups.js');
const { ticketToMarkdown } = await import('../../shared/tickets.js');
after(() => fs.rm(root, { recursive: true, force: true }));

const b64 = (text: string) => Buffer.from(text).toString('base64');
const words = (n: number, word = 'lore') => Array.from({ length: n }, () => word).join(' ');
const COMPENDIUM = [
  'Table of Contents', '', 'PART I: THE HOUSES', '',
  '1\\. House Varek — Full Lore Entry', '', words(400), '',
  '2\\. House Lorne', '', words(40), '',
  '3\\. House Maren', '', '• Colors: grey', '• Seat: the fen', words(300), '',
  '4\\. House Akkar', '', words(350), '',
  '* * *', 'PART II: PEOPLE', '',
  '1\\. Saras — Bridge Between Worlds', '', words(30), '',
  'Steps she follows:', '', '1. Wake before dawn', '2. Walk the wall', '3. Report', '',
  '2\\. Castin Hjaar — “The Architect”', '', words(500),
].join('\n');

test('depth map finds escaped-numbered, PART and # headings, and flags thin sections', () => {
  const sections = sourceSections(COMPENDIUM);
  assert.deepEqual(sections.map((s) => s.title), [
    'PART I: THE HOUSES', 'House Varek — Full Lore Entry', 'House Lorne', 'House Maren', 'House Akkar',
    'PART II: PEOPLE', 'Saras — Bridge Between Worlds', 'Castin Hjaar — “The Architect”',
  ]);
  const by = Object.fromEntries(sections.map((s) => [s.title, s]));
  assert.equal(by['House Lorne'].thin, true);
  assert.equal(by['Saras — Bridge Between Worlds'].thin, true);
  assert.equal(by['House Varek — Full Lore Entry'].thin, false);
  assert.equal(by['PART I: THE HOUSES'].thin, false, 'parts are containers, never flagged');
  assert.equal(by['House Lorne'].words, 40);
  assert.equal(by['House Maren'].words, 305, 'a heading followed by a bullet list still counts');
  assert.equal(sourceSections('# Title\n\nbody\n\n## Child\n\nmore words here')[1].level, 2);
});

test('numbered body lists and long numbered sentences are not headings', () => {
  const titles = sourceSections(COMPENDIUM).map((s) => s.title);
  assert.ok(!titles.includes('Wake before dawn'));
  assert.deepEqual(sourceSections('Intro\n\n1. This is a full sentence about the war.\n\nMore.'), []);
  assert.match(renderDepthMap([]), /No section headings were detected/);
});

test('section subjects and manuscript mentions are counted by name', () => {
  assert.equal(sectionSubject('House Varek — Full Lore Entry'), 'Varek');
  assert.equal(sectionSubject('Lathios — The Meritocrat'), 'Lathios');
  assert.equal(sectionSubject('Geography & Regions'), null);
  assert.equal(sectionSubject('Book 1: The Weight of a Choice'), null);
  assert.equal(countMentions('Lorne', 'Lorne rode out. The Lornes did not. lorne again.'), 2);
});

test('ticket suggestions are parsed from replies and removed from the prose', () => {
  const parsed = parseAgentOutput([
    'Here is a thread.',
    '<ticket-suggestion><title>Explore House Lorne</title><wants>depth</wants>',
    '<thread>Lorne and the Dane Wars</thread><quote section="House Lorne">Grey banners</quote>',
    '<question>Who remembers them?</question></ticket-suggestion>',
    '<ticket-suggestion><wants>no title</wants></ticket-suggestion>',
  ].join('\n'));
  assert.equal(parsed.ticketSuggestions.length, 1);
  assert.deepEqual(parsed.ticketSuggestions[0], {
    title: 'Explore House Lorne', wants: 'depth', threads: ['Lorne and the Dane Wars'],
    questions: ['Who remembers them?'], quotes: [{ section: 'House Lorne', quote: 'Grey banners' }],
  });
  assert.doesNotMatch(parsed.prose, /Explore House Lorne/);
  assert.match(parsed.prose, /no title/, 'a malformed suggestion stays visible');
  assert.ok(parsed.warnings.some((w) => /without a <title>/.test(w)));
});

test('tickets normalize untrusted input and keep returns and the Muse log server-owned', async () => {
  const project = await createProject('Tickets');
  const dir = await projectDir(project.id);
  assert.deepEqual(await tickets.readTickets(dir), []);
  await assert.rejects(tickets.createTicket(dir, { title: '  ' }), /needs an assignment/);
  const ticket = await tickets.createTicket(dir, {
    title: 'Explore the Omorrii lore', wants: 'Saras and the family', threads: ['Saras', '', 'Cheliaous'],
    sourceRefs: [{ title: 'Compendium', section: 'House Omorrii', quote: 'Moon-blooded.' }, { title: 'x', quote: '' }],
    questions: ['Who raised her?'], origin: 'muse', status: 'nonsense' as never,
  });
  assert.equal(ticket.status, 'open');
  assert.equal(ticket.origin, 'muse');
  assert.deepEqual(ticket.threads, ['Saras', 'Cheliaous']);
  assert.equal(ticket.sourceRefs.length, 1);
  const edited = await tickets.updateTicket(dir, ticket.id, { wants: 'Only Saras', returns: [{ sourceId: 'forged' }], log: [{ answer: 'forged' }] } as never);
  assert.equal(edited.wants, 'Only Saras');
  assert.deepEqual(edited.returns, []);
  assert.deepEqual(edited.log, []);
  const markdown = ticketToMarkdown(edited);
  assert.match(markdown, /^# Explore the Omorrii lore/);
  assert.match(markdown, /## From the source[\s\S]*\*\*Compendium — House Omorrii\*\*[\s\S]*> Moon-blooded\./);
  await assert.rejects(tickets.updateTicket(dir, 'missing', { wants: 'x' }), /Ticket not found/);
  await tickets.deleteTicket(dir, ticket.id);
  assert.deepEqual(await tickets.readTickets(dir), []);
});

test('returned files attach through Sources; duplicates relink and missing files are reported', async () => {
  const project = await createProject('Returns');
  const dir = await projectDir(project.id);
  const ticket = await tickets.createTicket(dir, { title: 'House Lorne' });
  const { source } = await importSource(dir, { name: 'lorne-notes.md', data: b64('# Lorne notes\n\nThe grey banners hide a debt.\n') });
  let updated = await tickets.attachTicketReturn(dir, ticket.id, source.id);
  assert.equal(updated.status, 'returned');
  assert.deepEqual(updated.returns.map((r) => r.title), ['lorne-notes']);
  const again = await importSource(dir, { name: 'copy.md', data: b64('# Lorne notes\n\nThe grey banners hide a debt.\n') });
  assert.equal(again.duplicate, true);
  updated = await tickets.attachTicketReturn(dir, ticket.id, again.source.id);
  assert.equal(updated.returns.length, 1, 'a duplicate import relinks the same source once');
  await assert.rejects(tickets.attachTicketReturn(dir, ticket.id, 'nope'), /not in Sources/);
  await deleteSource(dir, source.id);
  const { block } = await buildFocus(project.id, { ticketId: ticket.id }, 'mock');
  assert.match(block, /missing="true">This file was removed from Sources/);
});

test('focus runs send the whole source with its depth map, suggest tickets, and remember ticket exchanges', async () => {
  const project = await createProject('Focus');
  const dir = await projectDir(project.id);
  await writeDocument(project.id, 'chapter-01', 'Lorne rode north. Lorne did not look back.');
  const { source } = await importSource(dir, { name: 'compendium.md', data: b64(COMPENDIUM) });
  const ticket = await tickets.createTicket(dir, { title: 'Saras and the Omorrii' });

  const { block, summary } = await buildFocus(project.id, { sourceId: source.id }, 'mock');
  assert.match(block, /<depth-map>[\s\S]*House Lorne — 40 words · THIN · chapters mention it 2×/);
  assert.match(block, /<source-text>[\s\S]*Castin Hjaar/);
  assert.match(summary[0], /^Whole source attached by the writer: compendium/);

  const run = await runAgent(project.id, { agentId: 'muse', question: 'Find a ripe thread.', focus: { sourceId: source.id, ticketId: ticket.id }, history: [{ question: 'Earlier?', answer: 'Earlier answer.' }] });
  assert.equal(run.error, undefined);
  assert.match(run.text, /House Lorne/);
  assert.match(run.text, /Picking up from what we said before/);
  assert.equal(run.ticketSuggestions?.[0].title, 'Explore House Lorne');
  assert.ok(run.contextSummary.some((line) => /Ticket attached by the writer: Saras and the Omorrii/.test(line)));
  const logged = await tickets.readTicket(dir, ticket.id);
  assert.equal(logged.log.length, 1);
  assert.equal(logged.log[0].question, 'Find a ripe thread.');

  const plain = await runAgent(project.id, { agentId: 'muse', question: 'Hello' });
  assert.equal(plain.ticketSuggestions, undefined, 'no suggestions without attached material');
});

test('local models refuse oversized sources with a clear message, and focus input is validated', async () => {
  const project = await createProject('Small model');
  const dir = await projectDir(project.id);
  const { source } = await importSource(dir, { name: 'big.md', data: b64(`# Big\n\n${'word '.repeat(FOCUS_SMALL_MODEL_MAX / 4)}`) });
  await assert.rejects(buildFocus(project.id, { sourceId: source.id }, 'ollama'), /too large for the local model/);
  await assert.rejects(buildFocus(project.id, { sourceId: 'gone' }, 'mock'), /no longer in Sources/);
  assert.throws(() => validateFocus({ sourceId: 5 }, undefined), /Invalid attached material/);
  assert.throws(() => validateFocus(undefined, [{ question: 'q' }]), /Invalid conversation history/);
  assert.deepEqual(validateFocus({ sourceId: '' }, undefined), { focus: undefined, history: undefined });
  assert.equal(validateFocus(undefined, Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: 'a' }))).history?.length, 3);
});

test('tickets survive a project backup and restore', async () => {
  const project = await createProject('Backup tickets');
  const dir = await projectDir(project.id);
  await tickets.createTicket(dir, { title: 'Carry me through a restore' });
  const backup = await exportProjectBackup(project.id);
  assert.ok(backup.files.some((file) => file.path === 'tickets/tickets.json'));
  const restored = await restoreProjectBackup(JSON.parse(JSON.stringify(backup)));
  const list = await tickets.readTickets(await projectDir(restored.id));
  assert.deepEqual(list.map((t) => t.title), ['Carry me through a restore']);
});
