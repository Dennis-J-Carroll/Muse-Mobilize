import { test, expect, openTool } from './fixtures';
import type { Page } from '@playwright/test';

async function openCard(page: Page) {
  await openTool(page, 'Scenes');
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  return page.locator('.floating-drawer').first();
}

test('every card offers a placement menu that snaps it and closes on Escape without docking', async ({ page, projectId }, testInfo) => {
  expect(projectId).toBeTruthy();
  const card = await openCard(page);
  const trigger = card.getByRole('button', { name: /^Arrange / });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Card placement' });
  await expect(menu.getByRole('group', { name: 'Move' }).getByRole('menuitemradio')).toHaveCount(4);
  await expect(menu.getByRole('group', { name: 'Fill and arrange' }).getByRole('menuitemradio')).toHaveCount(2);

  await menu.getByRole('menuitemradio', { name: 'Right half' }).click();
  await expect(menu).toBeHidden();
  const view = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThan(view.width / 2 - 40);
  expect(box.height).toBeGreaterThan(view.height - 40);

  await trigger.click();
  await expect(menu.getByRole('menuitemradio', { name: 'Right half' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: testInfo.outputPath('card-placement-menu.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(card).toBeVisible();          // Escape closed the menu, not the card
  await expect(trigger).toBeFocused();

  // Moving the card by hand gives up the snapped placement.
  await card.getByRole('button', { name: /^Move / }).focus();
  await page.keyboard.press('ArrowLeft');
  await trigger.click();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(6);
  await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(0);
});

test('the placement menu is keyboard operable', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const card = await openCard(page);
  const trigger = card.getByRole('button', { name: /^Arrange / });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Card placement' });
  await expect(menu.getByRole('menuitemradio', { name: 'Left half' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(menu.getByRole('menuitemradio', { name: 'Right half' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitemradio', { name: 'Side by side' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(menu.getByRole('menuitemradio', { name: 'Fill desk' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  const view = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(box.width).toBeGreaterThan(view.width / 2);

  await trigger.click();
  await expect(menu.getByRole('menuitemradio', { name: 'Fill desk' })).toHaveAttribute('aria-checked', 'true');
  await page.mouse.click(4, view.height - 4);
  await expect(menu).toBeHidden();
  await expect(card).toBeVisible();
});

test('the placement menu is hidden at narrow widths', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const card = await openCard(page);
  await expect(card.getByRole('button', { name: /^Arrange / })).toBeVisible();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: /^Arrange / })).toHaveCount(0);
});

/** Open one edit card per seeded scene; each stays floating on the desk. */
async function openSceneCards(page: Page, request: import('@playwright/test').APIRequestContext, projectId: string, titles: string[]) {
  for (const title of titles) expect((await request.post(`/api/projects/${projectId}/scenes`, { data: { title } })).ok()).toBeTruthy();
  await openTool(page, 'Scenes');
  for (const title of titles) {
    await page.locator('.scene-lane').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: `Revise ${title}`, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  for (let slot = 1; slot <= titles.length; slot++) await page.keyboard.press(`Alt+${slot}`);
  const cards = titles.map(title => page.getByRole('dialog', { name: `Revise ${title}`, exact: true }));
  for (const card of cards) await expect(card).toBeVisible();
  return cards;
}

test('Side by side tiles every open card and is then the checked placement', async ({ page, request, projectId }) => {
  const [first, second] = await openSceneCards(page, request, projectId, ['Arrival', 'Return']);
  const trigger = second.getByRole('button', { name: /^Arrange / });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Card placement' });
  await menu.getByRole('menuitemradio', { name: 'Side by side' }).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  const boxes = [(await first.boundingBox())!, (await second.boundingBox())!].sort((a, b) => a.x - b.x);
  expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThanOrEqual(2);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(1);

  await trigger.click();
  await expect(menu.getByRole('menuitemradio', { name: 'Side by side' })).toHaveAttribute('aria-checked', 'true');
});

test('the whole placement menu stays inside a narrow Side by side card', async ({ page, request, projectId }, testInfo) => {
  await page.setViewportSize({ width: 760, height: 800 });
  const cards = await openSceneCards(page, request, projectId, ['Arrival', 'Return', 'Departure']);
  const card = cards[2];
  const trigger = card.getByRole('button', { name: /^Arrange / });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Card placement' });
  await menu.getByRole('menuitemradio', { name: 'Side by side' }).click();
  await expect(menu).toBeHidden();

  for (const narrow of cards) {
    const box = (await narrow.boundingBox())!;
    expect(box.width).toBeLessThan(290);
    await narrow.getByRole('button', { name: /^Arrange / }).click();
    const items = menu.getByRole('menuitemradio');
    await expect(items).toHaveCount(6);
    for (const item of await items.all()) {
      const itemBox = (await item.boundingBox())!;
      expect(itemBox.x).toBeGreaterThanOrEqual(box.x);
      expect(itemBox.y).toBeGreaterThanOrEqual(box.y);
      expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(box.x + box.width);
      expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(box.y + box.height);
    }
    await expect(menu.getByRole('menuitemradio', { name: 'Side by side' })).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: testInfo.outputPath(`card-placement-narrow-${box.x | 0}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
});
