import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };
export const test = base.extend<{ projectId: string }>({
  projectId: async ({ request, page }, use) => {
    const { settings } = await (await request.get('/api/settings')).json();
    expect(settings.workspaceRoot).toMatch(/muse-browser-[^/]+\/projects$/);
    expect(settings.defaultProvider).toBe('mock');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const name = `Browser QA ${randomUUID()}`;
    const response = await request.post('/api/projects', { data: { name } });
    expect(response.ok()).toBeTruthy();
    const { project } = await response.json();
    await page.goto('/');
    await page.getByRole('button', { name: 'Project menu' }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await use(project.id);
    expect(errors, 'Unexpected browser runtime errors').toEqual([]);
  },
});

export async function openTool(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${name} `) }).click();
}

export const png = {
  name: 'mood.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
};
