import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentOutput, anchorPatch, applyPatch } from '../src/protocol.js';

test('extracts prose, consults and patches', () => {
  const raw = [
    'The paragraph loses momentum at the turn.',
    '<consult agent="continuity">Does Kiala know the seal in chapter 4?</consult>',
    '<patch>',
    '<before>Kiala walked across the chamber.</before>',
    '<after>Kiala crossed the chamber without looking back.</after>',
    '<reason>Movement signals withdrawal.</reason>',
    '</patch>',
    'Otherwise the scene holds.',
  ].join('\n');

  const out = parseAgentOutput(raw);
  assert.equal(out.consults.length, 1);
  assert.equal(out.consults[0].agent, 'continuity');
  assert.match(out.consults[0].question, /imperial|seal/i);
  assert.equal(out.patches.length, 1);
  assert.equal(out.patches[0].beforeText, 'Kiala walked across the chamber.');
  assert.equal(out.patches[0].afterText, 'Kiala crossed the chamber without looking back.');
  assert.match(out.prose, /loses momentum/);
  assert.match(out.prose, /scene holds/);
  assert.ok(!out.prose.includes('<patch>'));
  assert.deepEqual(out.warnings, []);
});

test('malformed patch is preserved as prose and warned about, never thrown', () => {
  const raw = 'Try this:\n<patch>\n<before>only a before</before>\n</patch>';
  const out = parseAgentOutput(raw);
  assert.equal(out.patches.length, 0);
  assert.equal(out.warnings.length, 1);
  assert.match(out.prose, /only a before/);
});

test('empty and absent blocks degrade quietly', () => {
  assert.deepEqual(parseAgentOutput('').patches, []);
  const out = parseAgentOutput('plain answer, no blocks');
  assert.equal(out.prose, 'plain answer, no blocks');
  assert.equal(out.consults.length, 0);
});

test('anchor prefers the selection window over an earlier duplicate', () => {
  const doc = 'She waited. ' + 'She waited. ' + 'Then the door opened.';
  const hint = { start: 12, end: 24 };
  const a = anchorPatch(doc, 'She waited.', hint);
  assert.equal(a.anchored, true);
  assert.equal(a.start, 12);
});

test('anchor reports failure instead of guessing', () => {
  const a = anchorPatch('nothing like it here', 'absent text', { start: 0, end: 5 });
  assert.equal(a.anchored, false);
});

test('apply refuses a stale patch', () => {
  const doc = 'Kiala walked across the chamber.';
  const patch = { start: 0, end: 31, beforeText: 'Kiala walked across the chamber.', afterText: 'Kiala crossed it.', anchored: true };
  assert.deepEqual(applyPatch(doc, patch), { ok: true, text: 'Kiala crossed it.' });

  const edited = 'Elsewhere entirely.';
  const res = applyPatch(edited, patch);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'stale');
});

test('apply re-anchors when text shifted but is still unique', () => {
  const doc = 'A new opening line.\n\nKiala walked across the chamber.';
  const patch = { start: 0, end: 31, beforeText: 'Kiala walked across the chamber.', afterText: 'Kiala crossed it.', anchored: true };
  const res = applyPatch(doc, patch);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.text, 'A new opening line.\n\nKiala crossed it.');
});
