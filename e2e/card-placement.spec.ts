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
