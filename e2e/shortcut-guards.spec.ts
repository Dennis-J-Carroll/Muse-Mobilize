import { test, expect } from './fixtures';

test('shortcuts stay quiet while a native modal dialog is open', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: /^Project Binder Arrange/ }).click();
  const binder = page.getByRole('dialog', { name: 'Project Binder' });
  await expect(binder).toBeVisible();
  await binder.getByRole('button', { name: 'Back to workspace', exact: true }).focus();
  await page.keyboard.press('Alt+Shift+Slash');
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toHaveCount(0);
});

test('a shortcut with nothing to do leaves the keystroke alone', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const draft = page.locator('.pane-editor textarea.draft');
  await expect(draft).toHaveValue(/Chapter One/);
  const prevented = await draft.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    const fire = (code: string) => !el.dispatchEvent(new KeyboardEvent('keydown', { code, key: '5', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    return { noDesk: fire('Digit5'), noPrevious: fire('Digit0') };
  });
  expect(prevented).toEqual({ noDesk: false, noPrevious: false });
});
