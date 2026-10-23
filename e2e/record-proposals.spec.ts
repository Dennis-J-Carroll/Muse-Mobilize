import { test, expect, openTool } from './fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import type { RecordKind } from '../shared/record-proposals';

async function seed(request: APIRequestContext, projectId: string) {
  const root = `/api/projects/${projectId}`;
  const { entity: character } = await (await request.post(`${root}/canon/entities`, { data: { type: 'character', name: 'Oath keeper', summary: 'Keep this function.', character: { attributes: { role: 'Witness', goals: ['Survive'], fears: ['Forget'] }, physical: { description: 'Silver braid' } } } })).json();
  const { entity: world } = await (await request.post(`${root}/canon/entities`, { data: { type: 'location', name: 'Harbour', summary: 'Keep this harbour.', world: { attributes: { atmosphere: 'Cold', era: 'Late empire', significance: 'Trade' }, canvas: { x: 51, y: 79 }, referenceDocumentId: 'lore-page' } } })).json();
  const { node: plot } = await (await request.post(`${root}/plot/nodes`, { data: { title: 'Betrayal', summary: 'Keep this beat.', details: { goal: 'Escape', conflict: 'Oath', stakes: 'Reputation' }, position: { x: 29, y: 31 }, worldRefs: [{ entityId: world.id, role: 'setting' }] } })).json();
  const { scene } = await (await request.post(`${root}/scenes`, { data: { title: 'Hearing', summary: 'Keep this scene.', purpose: 'Test loyalty.', status: 'drafting', beats: [{ id: 'arrival', title: 'Arrival', summary: 'Doors open', order: 0 }], assets: [{ kind: 'character', refId: character.id, role: 'present' }] } })).json();
  return { characters: character, world, plot, scenes: scene };
}
async function record(request: APIRequestContext, projectId: string, kind: RecordKind, id: string) {
  const endpoint = kind === 'characters' || kind === 'world' ? 'canon' : kind;
  const result = await (await request.get(`/api/projects/${projectId}/${endpoint}`)).json();
  return (result.canon?.entities ?? result.plot?.nodes ?? result.board?.scenes).find((item: any) => item.id === id);
}
async function choose(page: Page, kind: RecordKind, id: string, field: string, excerpt = 'Reviewed field text.') {
  await page.getByRole('textbox', { name: 'Ask Muse', exact: true }).fill('Suggest a revision.');
  await page.locator('.pane-agent').getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByText('Send to project', { exact: true }).click();
  const form = page.locator('.reply-placement');
  await form.getByLabel('Destination', { exact: true }).selectOption(`record:${kind}`);
  await form.getByLabel('Record', { exact: true }).selectOption(id);
  await form.getByLabel('Field', { exact: true }).selectOption(field);
  await form.getByLabel('Placement', { exact: true }).selectOption('replace');
  await form.getByLabel('Excerpt to use', { exact: true }).fill(excerpt);
  return form;
}

for (const [kind, field] of [['characters', 'character.attributes.goals'], ['scenes', 'purpose'], ['plot', 'details.stakes'], ['world', 'world.attributes.atmosphere']] as const) {
  test(`${kind}: review, apply, reopen and Undo preserve other fields`, async ({ page, request, projectId }, info) => {
    const records = await seed(request, projectId); const original = records[kind];
    const text = kind === 'characters' ? 'Find proof, quietly\nKeep the oath' : 'Reviewed field text.';
    const form = await choose(page, kind, original.id, field, text);
    await form.getByRole('button', { name: 'Preview change', exact: true }).click();
    await expect(form.getByRole('region', { name: 'Proposed record change' })).toBeVisible();
    expect(await record(request, projectId, kind, original.id)).toEqual(original);
    if (kind === 'world') {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await form.getByRole('button', { name: 'Apply to project', exact: true }).scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await page.screenshot({ path: info.outputPath(`record-preview-${width}.png`), animations: 'disabled' });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await form.getByRole('button', { name: 'Apply to project', exact: true }).click();
    await expect(form).toContainText(`Updated ${original.name ?? original.title}`);
    const saved = await record(request, projectId, kind, original.id);
    const expected = structuredClone(original); const keys = field.split('.'); let parent = expected;
    for (const key of keys.slice(0, -1)) parent = parent[key];
    parent[keys.at(-1)!] = kind === 'characters' ? ['Find proof, quietly', 'Keep the oath'] : text;
    expected.updatedAt = saved.updatedAt;
    expect(saved).toEqual(expected);
    // Open the exact record, then close its form before using saved-project Undo.
    await form.getByRole('button', { name: 'Open record', exact: true }).click();
    const editor = page.locator('.floating-drawer:visible');
    await expect(editor).toHaveCount(1);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Undo saved change', exact: true }).click();
    await expect.poll(() => record(request, projectId, kind, original.id)).toEqual(original);
  });
}

test('changed records reject stale previews; editing a proposal requires a new preview', async ({ page, request, projectId }) => {
  const records = await seed(request, projectId); const scene = records.scenes;
  const form = await choose(page, 'scenes', scene.id, 'purpose');
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Apply to project', exact: true })).toBeVisible();
  await form.getByLabel('Excerpt to use', { exact: true }).fill('Revised proposal.');
  await expect(form.getByRole('button', { name: 'Apply to project', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Apply to project', exact: true })).toBeVisible();
  await request.put(`/api/projects/${projectId}/scenes/${scene.id}`, { data: { summary: 'Changed elsewhere.' } });
  await form.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Record changed after preview');
  expect((await record(request, projectId, 'scenes', scene.id)).purpose).toBe(scene.purpose);
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  await form.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(form).toContainText('Updated Hearing');
  const saved = await record(request, projectId, 'scenes', scene.id);
  expect(saved.summary).toBe('Changed elsewhere.'); expect(saved.purpose).toBe('Revised proposal.');
});

test('recovered drafts block proposals and remain intact; network failure retains excerpt', async ({ page, request, projectId }) => {
  const records = await seed(request, projectId); const scene = records.scenes;
  const form = await choose(page, 'scenes', scene.id, 'purpose', 'Keep this proposal.');
  const key = await page.evaluate(({ projectId, id }) => {
    const scope = { projectId, tool: 'scenes', entityId: id };
    const key = `muse:draft:v1:${JSON.stringify([projectId, 'scenes', id])}`;
    localStorage.setItem(key, JSON.stringify({ version: 1, scope, revision: 'draft', updatedAt: new Date().toISOString(), base: { purpose: 'Old' }, value: { purpose: 'Unfinished writing.' } }));
    return key;
  }, { projectId, id: scene.id });
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('open or recovered editor');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toContain('Unfinished writing.');
  await page.evaluate(key => localStorage.removeItem(key), key);
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  await page.route('**/record-proposals/apply', route => route.fulfill({ status: 503, json: { error: 'Injected offline save.' } }));
  await form.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Injected offline save');
  await expect(form.getByLabel('Excerpt to use', { exact: true })).toHaveValue('Keep this proposal.');
  expect(await record(request, projectId, 'scenes', scene.id)).toEqual(scene);
  await page.unroute('**/record-proposals/apply');
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  await form.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(form).toContainText('Updated Hearing');
});

test('parked editor blocks Apply after preview and keeps its unfinished text', async ({ page, request, projectId }) => {
  const records = await seed(request, projectId); const scene = records.scenes;
  const form = await choose(page, 'scenes', scene.id, 'purpose');
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Apply to project', exact: true })).toBeVisible();
  await openTool(page, 'Scenes');
  await page.locator('.scene-lane').getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Revise Hearing', exact: true });
  await editor.getByLabel('Why this scene exists').fill('Unfinished editor purpose.');
  await editor.press('Escape');
  await page.getByRole('button', { name: 'Restore Scene Board to workspace', exact: true }).click();
  await form.getByRole('button', { name: 'Apply to project', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Parked editors still hold drafts');
  expect(await record(request, projectId, 'scenes', scene.id)).toEqual(scene);
  await page.getByRole('button', { name: 'Recall Revise Hearing', exact: true }).click();
  await expect(editor.getByLabel('Why this scene exists')).toHaveValue('Unfinished editor purpose.');
});

test('pending Apply prevents opening a stale editor and finishes once', async ({ page, request, projectId }) => {
  const records = await seed(request, projectId); const scene = records.scenes;
  const form = await choose(page, 'scenes', scene.id, 'purpose', 'Accepted while waiting.');
  await form.getByRole('button', { name: 'Preview change', exact: true }).click();
  let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  await page.route('**/record-proposals/apply', async route => { calls++; started(); await gate; await route.continue(); });
  try {
    await form.getByRole('button', { name: 'Apply to project', exact: true }).click();
    await entered;
    await openTool(page, 'Scenes');
    await page.locator('.scene-lane').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Wait for the reviewed field change');
    await expect(page.getByRole('dialog', { name: 'Revise Hearing', exact: true })).toHaveCount(0);
  } finally { release(); }
  await page.getByRole('button', { name: 'Restore Scene Board to workspace', exact: true }).click();
  await expect(form).toContainText('Updated Hearing');
  expect(calls).toBe(1);
  expect((await record(request, projectId, 'scenes', scene.id)).purpose).toBe('Accepted while waiting.');
});
