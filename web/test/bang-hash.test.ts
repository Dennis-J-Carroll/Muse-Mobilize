import assert from 'node:assert/strict';
import { resolveBangHash } from '../src/bangHash';

assert.deepEqual(resolveBangHash('! watched.', 1, { content: 'Mara watched.', start: 0, end: 4 }), { content: 'Mara watched.', start: 0, end: 4, quote: 'Mara' });
assert.deepEqual(resolveBangHash('Mara! watched.', 5, { content: 'Mara watched.', start: 4, end: 4 }), { content: 'Mara watched.', start: 0, end: 4, quote: 'Mara' });
assert.deepEqual(resolveBangHash('!Mara watched.', 1, { content: 'Mara watched.', start: 0, end: 0 }), { content: 'Mara watched.', start: 0, end: 4, quote: 'Mara' });
assert.deepEqual(resolveBangHash('Éowyn! walks.', 6, { content: 'Éowyn walks.', start: 5, end: 5 }), { content: 'Éowyn walks.', start: 0, end: 5, quote: 'Éowyn' });
assert.equal(resolveBangHash('Mara!', 5, null), null, 'pasted or loaded punctuation is never a command');
assert.equal(resolveBangHash('Changed!', 8, { content: 'Mara', start: 4, end: 4 }), null, 'a stale snapshot cannot restore old prose');
assert.deepEqual(resolveBangHash('!', 1, { content: '', start: 0, end: 0 }), { content: '', start: 0, end: 0, quote: '' });
console.log('bang-hash: 7 checks passed');
