import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readWorldMap, writeWorldMap } from '../src/world-map.js';

test('atlas background persists independently and can be hidden without losing its image', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-world-map-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await readWorldMap(dir), { version: 1, image: null, opacity: .55, visible: true });
  const image = { id: 'map', src: '/api/projects/story/assets/images/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', caption: 'Northern coast', tags: [] };
  await writeWorldMap(dir, { image, opacity: .7 });
  await writeWorldMap(dir, { visible: false });
  assert.deepEqual(await readWorldMap(dir), { version: 1, image, opacity: .7, visible: false });
  await writeWorldMap(dir, { image: null });
  assert.equal((await readWorldMap(dir)).image, null);
});
