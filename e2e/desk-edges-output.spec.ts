import { test, expect, openTool } from './fixtures';
import type { Locator, Page } from '@playwright/test';

async function dragEdge(page: Page, handle: Locator, dx: number, dy: number) {
  await handle.hover();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

async function reply(page: Page) {
  await page.route('**/api/projects/*/ask', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.run.text = '### The harbour\n\n1. **Preserve the oath.**\n2. Let the witness speak.\n\nA quieter ending.\n\n<script>window.replyExecuted=true</script>\n\n![hidden](https://example.test/pixel)';
    await route.fulfill({ response, json: body });
  });
  await page.getByRole('textbox', { name: 'Ask Muse', exact: true }).fill('Offer two approaches.');
  await page.locator('.pane-agent').getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.agent-reply h3')).toHaveText('The harbour');
  await page.getByText('Send to project', { exact: true }).click();
  return page.locator('.reply-placement');
}

test('desk remove control stays inside action row and removes only the chosen layout', async ({ page, projectId }, testInfo) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  for (const name of ['One', 'A longer second desk name']) {
    await page.getByLabel('Desk name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const remove = page.getByRole('button', { name: 'Remove desk One', exact: true });
    await remove.scrollIntoViewIfNeeded();
    const box = (await remove.boundingBox())!;
    const row = (await page.locator('.desk-card').first().locator('.desk-move').boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(row.y); expect(box.y + box.height).toBeLessThanOrEqual(row.y + row.height + 1);
    await page.screenshot({ path: testInfo.outputPath(`desks-${width}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Remove desk One', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore One', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore A longer second desk name', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Your desks', exact: true })).toBeVisible();
});

test('pane borders resize from all sides and keep the live draft', async ({ page, projectId }, testInfo) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 1600, height: 1100 });
  const pane = page.locator('.pane-editor');
  const draft = pane.locator('textarea.draft');
  await draft.fill('Keep this draft throughout border resizing.');
  await draft.evaluate(element => { (element as HTMLElement).dataset.liveProbe = 'same'; });
  // Left-edge resize lifts the pane out of layout and holds its right edge.
  let before = (await pane.boundingBox())!;
  await dragEdge(page, pane.locator('.resize-w'), -50, 0);
  let after = (await pane.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x - 50, 0);
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0);
  for (const [edge, dx, dy] of [['n', 0, -30], ['e', 40, 0], ['s', 0, 30], ['nw', -20, -20], ['ne', 20, -20], ['sw', -20, 20], ['se', 20, 20]] as const) {
    before = (await pane.boundingBox())!;
    await dragEdge(page, pane.locator(`.resize-${edge}`), dx, dy);
    after = (await pane.boundingBox())!;
    expect(after.width).toBeCloseTo(before.width + Math.abs(dx), 0);
    expect(after.height).toBeCloseTo(before.height + Math.abs(dy), 0);
  }
  await expect(draft).toHaveValue('Keep this draft throughout border resizing.');
  await expect(draft).toHaveAttribute('data-live-probe', 'same');
  await expect(page.locator('body')).not.toHaveClass(/is-resizing-window/);
  await page.screenshot({ path: testInfo.outputPath('pane-borders.png'), animations: 'disabled' });
});

test('floating editor borders preserve form, opposite edge, and docked dimensions', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openTool(page, 'Scenes');
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Add scene', exact: true });
  await form.getByLabel('Scene title').fill('Border keeper');
  await form.getByLabel('Scene title').evaluate(element => { (element as HTMLElement).dataset.liveProbe = 'same-form'; });
  await form.locator('.resize-w').hover();
  const before = (await form.boundingBox())!;
  await dragEdge(page, form.locator('.resize-w'), -80, 0);
  const after = (await form.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width + 80, 0);
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0);
  await form.getByRole('button', { name: 'Resize Add scene', exact: true }).press('Shift+ArrowDown');
  const resized = await form.boundingBox();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Recall Add scene', exact: true }).click();
  await form.locator('.resize-w').hover();
  expect(await form.boundingBox()).toEqual(resized);
  await expect(form.getByLabel('Scene title')).toHaveValue('Border keeper');
  await expect(form.getByLabel('Scene title')).toHaveAttribute('data-live-probe', 'same-form');
});

test('Muse formats prose and appends an edited excerpt to chosen document only after Apply', async ({ page, request, projectId }, testInfo) => {
  const placement = await reply(page);
  await expect(page.locator('.agent-reply strong')).toHaveText('Preserve the oath.');
  await expect(page.locator('.agent-reply ol li')).toHaveCount(2);
  await expect(page.locator('.agent-reply img, .agent-reply script')).toHaveCount(0);
  const { project } = await (await request.get(`/api/projects/${projectId}`)).json();
  const note = project.documents.find((doc: { title: string }) => doc.title === 'Scratchpad');
  const before = (await (await request.get(`/api/projects/${projectId}/documents/${note.id}`)).json()).content;
  await placement.getByLabel('Destination', { exact: true }).selectOption(`document:${note.id}`);
  await placement.getByLabel('Excerpt to use', { exact: true }).fill('The witness keeps the final oath.');
  await placement.getByRole('button', { name: 'Preview change', exact: true }).click();
  expect((await (await request.get(`/api/projects/${projectId}/documents/${note.id}`)).json()).content).toBe(before);
  await page.screenshot({ path: testInfo.outputPath('muse-preview-desktop.png'), animations: 'disabled' });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await placement.getByRole('button', { name: 'Apply to project', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('muse-preview-phone.png'), animations: 'disabled' });
  await page.setViewportSize(viewport);
  await placement.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(placement).toContainText('Added to Scratchpad.');
  await expect.poll(async () => (await (await request.get(`/api/projects/${projectId}/documents/${note.id}`)).json()).content).toContain('\n\nThe witness keeps the final oath.');
  const saved = (await (await request.get(`/api/projects/${projectId}/documents/${note.id}`)).json()).content;
  expect(saved.startsWith(before)).toBe(true);
  expect(saved.match(/The witness keeps the final oath\./g)).toHaveLength(1);
  await placement.getByRole('button', { name: 'Open destination', exact: true }).click();
  const scratchpad = page.getByRole('textbox', { name: 'Scratchpad', exact: true });
  await expect(scratchpad).toHaveCount(1);
  await scratchpad.press('Control+z');
  await expect(scratchpad).toHaveValue(before);
});

test('changed destination invalidates preview; fresh preview can replace exact selected passage', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const draft = page.getByRole('textbox', { name: 'Chapter One', exact: true });
  await draft.fill('Old oath. The witness remains.');
  const placement = await reply(page);
  await placement.getByLabel('Destination', { exact: true }).selectOption({ label: 'Chapter One — manuscript' });
  await placement.getByLabel('Excerpt to use', { exact: true }).fill('New oath.');
  await placement.getByRole('button', { name: 'Preview change', exact: true }).click();
  await draft.fill('Changed while preview was open.');
  await placement.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(placement.getByRole('alert')).toContainText('Destination changed');
  await expect(draft).toHaveValue('Changed while preview was open.');
  await page.getByText('Send to project', { exact: true }).click();
  await expect(placement.locator('.reply-placement-form')).toHaveCount(0);
  await draft.fill('Old oath. The witness remains.');
  await draft.press('Control+Home');
  for (let index = 0; index < 9; index++) await draft.press('Shift+ArrowRight');
  await expect(page.locator('.sel-toggle')).toContainText('2w');
  await page.getByText('Send to project', { exact: true }).click();
  await placement.getByLabel('Destination', { exact: true }).selectOption({ label: 'Chapter One — manuscript' });
  await placement.getByLabel('Placement', { exact: true }).selectOption('selection');
  await placement.getByLabel('Excerpt to use', { exact: true }).fill('New oath.');
  await placement.getByRole('button', { name: 'Preview change', exact: true }).click();
  await placement.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(draft).toHaveValue('New oath. The witness remains.');
});

test('premise transfer enforces size, adds variant and preserves working premise on phone', async ({ page, request, projectId }, testInfo) => {
  const { premise } = await (await request.get(`/api/projects/${projectId}/premise`)).json();
  await request.put(`/api/projects/${projectId}/premise`, { data: { ...premise, working: 'Existing working premise.' } });
  const placement = await reply(page);
  await placement.getByLabel('Destination', { exact: true }).selectOption('premise');
  await placement.getByLabel('Excerpt to use', { exact: true }).fill('x'.repeat(601));
  await placement.getByRole('button', { name: 'Preview change', exact: true }).click();
  await expect(placement.getByRole('alert')).toContainText('600 characters');
  await placement.getByLabel('Excerpt to use', { exact: true }).fill('A witness must choose which oath to break.');
  await placement.getByRole('button', { name: 'Preview change', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await placement.getByRole('button', { name: 'Apply to project', exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('muse-preview-phone.png'), animations: 'disabled' });
  await placement.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(placement).toContainText('Added to Premise variants.');
  const saved = (await (await request.get(`/api/projects/${projectId}/premise`)).json()).premise;
  expect(saved.working).toBe('Existing working premise.');
  expect(saved.variants[0].text).toBe('A witness must choose which oath to break.');
  expect(saved.variants[0].source).toBe('muse');
});

test('consultation keeps its managed manuscript frame free of resize handles', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await openTool(page, 'Characters');
  await expect(page.locator('.character-consultation')).toBeVisible();
  const handles = page.locator('.character-consultation .window-resize-handle');
  expect(await handles.count()).toBeGreaterThan(0);
  for (const handle of await handles.all()) await expect(handle).toBeHidden();
});
