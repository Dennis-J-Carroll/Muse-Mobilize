import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectImageUploadResults,
  createConcurrencyLimiter,
  formatImageUploadIssues,
  IMAGE_UPLOAD_BATCH_LIMIT,
  IMAGE_UPLOAD_MAX_BYTES,
  mergeStoryImages,
  preflightImageFiles,
} from '../src/components/ImageGalleryEditor.tsx';
import type { StoryImage } from '../src/types.ts';

const imageFile = (name: string, type: string, size = 1) =>
  new File([new Uint8Array(size)], name, { type });

test('image preflight keeps supported files while rejecting exact-type and size violations', () => {
  const png = imageFile('valid.png', 'image/png', IMAGE_UPLOAD_MAX_BYTES);
  const svg = imageFile('vector.svg', 'image/svg+xml');
  const large = imageFile('large.webp', 'image/webp', IMAGE_UPLOAD_MAX_BYTES + 1);

  const result = preflightImageFiles([png, svg, large]);

  assert.deepEqual(result.accepted, [png]);
  assert.deepEqual(result.issues, [
    { fileName: 'vector.svg', reason: 'unsupported type image/svg+xml' },
    { fileName: 'large.webp', reason: 'larger than 5 MB' },
  ]);
  assert.match(formatImageUploadIssues(result.issues), /^2 images skipped:/);
});

test('image preflight caps each batch without dropping earlier valid files', () => {
  const files = Array.from(
    { length: IMAGE_UPLOAD_BATCH_LIMIT + 2 },
    (_, index) => imageFile(`${index}.jpg`, 'image/jpeg'),
  );

  const result = preflightImageFiles(files);

  assert.equal(result.accepted.length, IMAGE_UPLOAD_BATCH_LIMIT);
  assert.deepEqual(result.issues.map((issue) => issue.fileName), [
    `${IMAGE_UPLOAD_BATCH_LIMIT}.jpg`,
    `${IMAGE_UPLOAD_BATCH_LIMIT + 1}.jpg`,
  ]);
});

test('concurrency limiter never runs more than configured task count', async () => {
  const run = createConcurrencyLimiter(3);
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 9 }, (_, index) => run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return index;
  }));

  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(peak, 3);
});

test('image merge preserves current edits and ignores duplicate upload results', () => {
  const current: StoryImage[] = [{ id: 'current', src: '/current.png', caption: 'edited', tags: [] }];
  const incoming: StoryImage[] = [
    { id: 'new', src: '/new.png', caption: '', tags: [] },
    { id: 'current', src: '/stale.png', caption: '', tags: [] },
    { id: 'new', src: '/duplicate.png', caption: '', tags: [] },
  ];

  assert.deepEqual(mergeStoryImages(current, incoming), [current[0], incoming[0]]);
});

test('mixed upload result keeps successful images and reports failed file', () => {
  const files = [imageFile('good.png', 'image/png'), imageFile('bad.jpg', 'image/jpeg')];
  const image: StoryImage = { id: 'uploaded', src: '/uploaded.png', caption: '', tags: [] };

  assert.deepEqual(collectImageUploadResults(files, [
    { status: 'fulfilled', value: image },
    { status: 'rejected', reason: new Error('signature mismatch') },
  ]), {
    successful: [image],
    issues: [{ fileName: 'bad.jpg', reason: 'signature mismatch' }],
  });
});
