import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAgentMarkdown } from '../src/agentMarkdown';
import { placeReply } from '../src/replyPlacement';

test('renders response structure while preserving literal HTML and blocking active URLs/images', () => {
  const html = renderAgentMarkdown('### Choice\n\n1. **Strong** and *quiet*.\n2. Next.\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![remote](https://example.test/pixel)\n\n[Good](https://example.test)');
  assert.match(html, /<h3>Choice<\/h3>/); assert.match(html, /<strong>Strong<\/strong>/);
  assert.match(html, /<ol>/); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:/);
  assert.match(html, /rel="noopener noreferrer"/);
});
test('append preserves the entire draft; replacement changes only an exact selected passage', () => {
  assert.equal(placeReply('Original.', 'Added.', 'append'), 'Original.\n\nAdded.');
  assert.equal(placeReply('Original.\n', 'Added.', 'append'), 'Original.\n\nAdded.');
  assert.equal(placeReply('One old ending.', 'new', 'selection', { documentId: 'x', start: 4, end: 7, text: 'old' }), 'One new ending.');
  assert.throws(() => placeReply('One OLD ending.', 'new', 'selection', { documentId: 'x', start: 4, end: 7, text: 'old' }), /changed/);
  assert.throws(() => placeReply('Original.', '  ', 'append'), /Choose/);
});
