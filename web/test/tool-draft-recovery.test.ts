import assert from 'node:assert/strict';
import test from 'node:test';
import * as recovery from '../src/draftRecovery.ts';

const scope = { projectId: 'one', tool: 'characters', entityId: 'new' };
const baseline = { name: '', notes: '', images: [] as { src: string }[] };

function setup() {
  const data = new Map<string, string>();
  let blocked = false;
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (blocked) throw new Error('QuotaExceededError'); data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
  const journal = new recovery.DraftJournal(() => storage);
  return { journal, data, block: () => { blocked = true; } };
}

test('tool edits survive reopening only their exact project, tool, and record', () => {
  const { journal } = setup();
  assert.equal(typeof recovery.RecoverableDraft, 'function');
  const form = new recovery.RecoverableDraft(journal, scope, baseline);
  form.update({ ...baseline, name: 'Ada', images: [{ src: '/api/projects/one/assets/images/reference.png' }] });
  const reopened = new recovery.RecoverableDraft(journal, scope, baseline);
  assert.equal(reopened.value.name, 'Ada');
  assert.equal(reopened.value.images[0].src, '/api/projects/one/assets/images/reference.png');
  for (const other of [{ ...scope, projectId: 'two' }, { ...scope, tool: 'world' }, { ...scope, entityId: 'existing' }]) {
    assert.equal(new recovery.RecoverableDraft(journal, other, baseline).value.name, '');
  }
});

test('a tool save clears the matching draft but leaves later edits recoverable with the saved baseline', () => {
  const { journal } = setup();
  assert.equal(typeof recovery.RecoverableDraft, 'function');
  const form = new recovery.RecoverableDraft(journal, scope, baseline);
  form.update({ ...baseline, name: 'Ada' });
  const submitted = form.checkpoint();
  form.update({ ...baseline, name: 'Ada', notes: 'New writing during save.' });
  assert.equal(form.completeSave(submitted), false);
  const reopened = new recovery.RecoverableDraft(journal, scope, submitted.value);
  assert.equal(reopened.value.notes, 'New writing during save.');
  assert.equal(reopened.conflict, false);
  assert.equal(form.completeSave(form.checkpoint()), true);
  assert.equal(journal.read(scope), null);
});

test('explicit Cancel clears the draft while reopening alone preserves it', () => {
  const { journal } = setup();
  assert.equal(typeof recovery.RecoverableDraft, 'function');
  const form = new recovery.RecoverableDraft(journal, scope, baseline);
  form.update({ ...baseline, notes: 'Draft in a docked form.' });
  const reopened = new recovery.RecoverableDraft(journal, scope, baseline);
  assert.equal(reopened.restored, true);
  reopened.discard();
  assert.equal(journal.read(scope), null);
  assert.equal(new recovery.RecoverableDraft(journal, scope, baseline).value.notes, '');
});

test('changed saved record is flagged while the tool draft remains recoverable', () => {
  const { journal } = setup();
  assert.equal(typeof recovery.RecoverableDraft, 'function');
  new recovery.RecoverableDraft(journal, scope, baseline).update({ ...baseline, name: 'Writer draft' });
  const reopened = new recovery.RecoverableDraft(journal, scope, { ...baseline, name: 'Newer saved record' });
  assert.equal(reopened.value.name, 'Writer draft');
  assert.equal(reopened.conflict, true);
  assert.equal(journal.read<typeof baseline>(scope)?.value.name, 'Writer draft');
});

test('quota failure preserves the last durable copy and reports that the latest edits are unprotected', () => {
  const { journal, data, block } = setup();
  const first = journal.write(scope, baseline, { ...baseline, name: 'Prior recovery' });
  const raw = data.get(recovery.draftKey(scope));
  block();
  journal.write(scope, baseline, { ...baseline, name: 'Latest writing' });
  assert.equal(data.get(recovery.draftKey(scope)), raw);
  assert.equal(journal.read(scope)?.revision, first.revision);
  assert.equal(journal.getIssues().length, 1);
  assert.match(journal.getIssues()[0], /latest edits could not be stored/i);
});

test('malformed and future recovery versions are preserved without entering a form', () => {
  const { journal, data } = setup();
  for (const raw of ['not json', JSON.stringify({ version: 9, scope, base: baseline, value: baseline })]) {
    data.set(recovery.draftKey(scope), raw);
    assert.equal(journal.read(scope), null);
    assert.equal(data.get(recovery.draftKey(scope)), raw);
    assert.ok(journal.getIssues().length);
  }
});

test('a stale successful save cannot clear a newer independently reopened form', () => {
  const { journal } = setup();
  assert.equal(typeof recovery.RecoverableDraft, 'function');
  const first = new recovery.RecoverableDraft(journal, scope, baseline);
  first.update({ ...baseline, name: 'First form' });
  const pending = first.checkpoint();
  const newer = new recovery.RecoverableDraft(journal, scope, baseline);
  newer.update({ ...baseline, name: 'New form writing' });
  first.completeSave(pending);
  assert.equal(journal.read<typeof baseline>(scope)?.value.name, 'New form writing');
});

test('a partially saved new form remembers its created record after reopening', () => {
  const { journal } = setup();
  const form = new recovery.RecoverableDraft(journal, scope, baseline);
  form.update({ ...baseline, name: 'Created theme', notes: 'Details awaiting save' });
  assert.equal(typeof form.rememberRecord, 'function');
  form.rememberRecord('created-record');
  form.update({ ...form.value, notes: 'More details' });
  const reopened = new recovery.RecoverableDraft(journal, scope, baseline);
  assert.equal(reopened.recordId, 'created-record');
  assert.equal(reopened.value.notes, 'More details');
});

test('Cancel in an older form cannot remove a newer recovery copy from another form', () => {
  const { journal } = setup();
  const first = new recovery.RecoverableDraft(journal, scope, baseline);
  first.update({ ...baseline, name: 'Old form' });
  const newer = new recovery.RecoverableDraft(journal, scope, baseline);
  newer.update({ ...baseline, name: 'Newer form' });
  first.discard();
  assert.equal(journal.read<typeof baseline>(scope)?.value.name, 'Newer form');
});
