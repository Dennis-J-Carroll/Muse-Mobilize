import { test, expect, openTool } from './fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

async function seedAtlas(request: APIRequestContext, projectId: string) {
  const { meta } = await (await request.post(`/api/projects/${projectId}/documents`, { data: { title: 'Harbour chronicle', kind: 'canon' } })).json();
  for (const [index, name] of ['North Gate', 'Old Harbour'].entries()) {
    const response = await request.post(`/api/projects/${projectId}/canon/entities`, { data: {
      type: 'location', name, summary: `Records kept at ${name}.`, aliases: [],
      world: { categories: [], attributes: { era: 'Third winter', atmosphere: '', significance: '' }, canvas: { x: 20 + index * 190, y: 60 }, images: [], ...(index ? { referenceDocumentId: meta.id } : {}) },
    } });
    expect(response.ok()).toBeTruthy();
  }
}

async function expectWithinViewport(page: Page) {
  const box = (await page.getByRole('menu').boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(7);
  expect(box.y).toBeGreaterThanOrEqual(7);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width - 7);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height - 7);
}

test('header menus support keyboard navigation without nudging panes; text retains native context menus', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const pane = page.locator('.pane-editor').first();
  const title = pane.getByRole('button', { name: 'Move Chapter One', exact: true });
  await title.focus();
  const box = await pane.boundingBox();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: 'Chapter One actions', exact: true });
  await expect(menu.getByRole('menuitem', { name: 'Focus writing', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Close view', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Focus writing', exact: true })).toBeFocused();
  await page.keyboard.press('p');
  await expect(menu.getByRole('menuitem', { name: 'Park in Tools', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Expand pane', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await expect(title).toBeFocused();
  expect(await pane.boundingBox()).toEqual(box);
  await expect(page.locator('.is-floating .pane-editor')).toHaveCount(0);
  const draft = pane.locator('textarea.draft');
  const native = await draft.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })));
  expect(native).toBe(true);
  await expect(menu).toHaveCount(0);
  await title.press('ContextMenu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  await expect(pane.getByRole('button', { name: 'Hide writing tools', exact: true })).toBeFocused();
});

test('More preserves manuscript selection, scroll, font and live element', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const draft = page.getByRole('textbox', { name: 'Chapter One', exact: true });
  await draft.fill(Array.from({ length: 200 }, (_, index) => `Line ${index}: the harbour keeps its record.`).join('\n'));
  const before = await draft.evaluate((element: HTMLTextAreaElement) => {
    element.dataset.continuityProbe = 'same-draft'; element.focus(); element.setSelectionRange(410, 435); element.scrollTop = 300;
    return { start: element.selectionStart, end: element.selectionEnd, scroll: element.scrollTop, font: getComputedStyle(element).fontFamily };
  });
  const more = page.getByRole('button', { name: 'More actions for Chapter One', exact: true });
  await more.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  expect(await draft.evaluate((element: HTMLTextAreaElement) => ({ start: element.selectionStart, end: element.selectionEnd, scroll: element.scrollTop, font: getComputedStyle(element).fontFamily }))).toEqual(before);
  await expect(draft).toHaveAttribute('data-continuity-probe', 'same-draft');
  await more.click();
  await more.click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('right-click park and restore reuse drawer behavior and preserve an unsent question', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const agent = page.locator('.pane-agent');
  const question = agent.getByRole('textbox', { name: 'Ask Muse', exact: true });
  await question.fill('Keep this question while parked.');
  await question.evaluate(element => { (element as HTMLElement).dataset.continuityProbe = 'same-question'; });
  await agent.locator('.pane-title').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Park in Tools', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open tool drawer', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Parked workspace tools' });
  await drawer.getByRole('button', { name: 'More actions for Muse', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'More actions for Muse', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Restore to workspace', exact: true }).click();
  await expect(question).toHaveValue('Keep this question while parked.');
  await expect(question).toHaveAttribute('data-continuity-probe', 'same-question');
  await expect(agent).not.toHaveClass(/is-min/);
});

test('pane actions focus, expand, return from floating, and close only the view', async ({ page, request, projectId }) => {
  const pane = page.locator('.pane-editor').first();
  const more = pane.getByRole('button', { name: 'More actions for Chapter One', exact: true });
  await more.click();
  await page.getByRole('menuitem', { name: 'Focus writing', exact: true }).click();
  await expect(pane).toHaveClass(/is-writing-focus/);
  await page.getByRole('button', { name: 'Exit writing focus', exact: true }).click();
  await more.click();
  await page.getByRole('menuitem', { name: 'Expand pane', exact: true }).click();
  await expect(pane).toHaveClass(/pane-maximized/);
  await more.click();
  await page.getByRole('menuitem', { name: 'Restore pane size', exact: true }).click();
  await pane.getByRole('button', { name: 'Move Chapter One', exact: true }).press('ArrowRight');
  await expect(page.locator('.is-floating .pane-editor')).toHaveCount(1);
  await more.click();
  await page.getByRole('menuitem', { name: 'Return to layout', exact: true }).click();
  await expect(page.locator('.is-floating .pane-editor')).toHaveCount(0);
  await more.click();
  await page.getByRole('menuitem', { name: 'Close view', exact: true }).click();
  await expect(pane).toHaveCount(0);
  const { project } = await (await request.get(`/api/projects/${projectId}`)).json();
  expect(project.documents.some((document: { title: string }) => document.title === 'Chapter One')).toBe(true);
});

test('atlas menus target the clicked landmark, open lore and connections, and leave form context menus native', async ({ page, request, projectId }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedAtlas(request, projectId);
  await page.reload();
  await openTool(page, 'World');
  await expect(page.locator('.world-inspector h1')).toHaveText('North Gate');
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  const harbour = page.getByRole('button', { name: 'Place: Old Harbour', exact: true });
  await harbour.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit landmark', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit Old Harbour', exact: true });
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Old Harbour');
  expect(await form.getByLabel('Name', { exact: true }).evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })))).toBe(true);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await harbour.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Tags and links', exact: true }).click();
  const connections = page.getByRole('dialog', { name: 'Tags and connections', exact: true });
  await expect(connections.getByRole('region', { name: 'Selected connection source' })).toContainText('Old Harbour');
  await page.keyboard.press('Escape');
  await expect(harbour).toBeFocused();
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByRole('button', { name: 'More actions for Old Harbour', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open lore page', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Harbour chronicle', exact: true })).toBeVisible();
});

test('menus stay singular, clamp at viewport edges, and dismiss outside or on resize', async ({ page, projectId }, testInfo) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const header = page.locator('.pane-editor .pane-head').first();
  await header.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1438, clientY: 998, button: 2 })));
  await expectWithinViewport(page);
  expect((await page.getByRole('menu').boundingBox())!.x).toBeGreaterThan(1100);
  await page.screenshot({ path: testInfo.outputPath('pane-menu-desktop.png'), animations: 'disabled' });
  await page.locator('.pane-agent .pane-title').click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(1);
  await expect(page.getByRole('menu', { name: 'Muse actions', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await header.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 319, clientY: 798, button: 2 })));
  await expectWithinViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: testInfo.outputPath('pane-menu-phone.png'), animations: 'disabled' });
  await page.getByRole('textbox', { name: 'Chapter One', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test.describe('touch access', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('visible More buttons expose pane and atlas actions with finger-sized targets', async ({ page, request, projectId }, testInfo) => {
    const more = page.getByRole('button', { name: 'More actions for Chapter One', exact: true });
    await more.tap();
    await expectWithinViewport(page);
    for (const item of await page.getByRole('menuitem').all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 844 });
    await more.tap();
    await expectWithinViewport(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: testInfo.outputPath('pane-menu-touch-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAtlas(request, projectId);
    await page.reload();
    await openTool(page, 'World');
    const landmarkMore = page.getByRole('button', { name: 'More actions for North Gate', exact: true });
    await landmarkMore.tap();
    await expectWithinViewport(page);
    await expect(page.getByRole('menuitem', { name: 'Open lore page', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('landmark-menu-touch.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Pages', exact: true }).tap();
    await page.getByRole('button', { name: 'More actions for Old Harbour', exact: true }).tap();
    await expect(page.getByRole('menuitem', { name: 'Open lore page', exact: true })).toBeVisible();
    await expectWithinViewport(page);
  });
});
