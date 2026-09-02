import { test } from 'node:test';
import assert from 'node:assert/strict';
import viteConfig from '../../web/vite.config.js';

test('frontend refuses to fall through onto runtime API port', () => {
  assert.equal(typeof viteConfig, 'object');
  assert.equal(viteConfig.server?.port, 5177);
  assert.equal(viteConfig.server?.strictPort, true);
  const apiProxy = viteConfig.server?.proxy?.['/api'];
  assert.equal(apiProxy && typeof apiProxy === 'object'
    ? apiProxy.target
    : undefined, 'http://localhost:5178');
});
