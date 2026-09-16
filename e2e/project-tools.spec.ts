import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
test.use({ hasTouch: true });

test('Agent Studio saves one-character access, previews withheld material, reloads, and saves an arrangement', async ({ page, request, projectId }, testInfo) => {
  const { entity } = await (await request.post(`/api/projects/${projectId}/canon/entities`, { data: { type: 'character', name: 'Mara', summary: 'PUBLIC_MARA' } })).json();
  await request.post(`/api/projects/${projectId}/canon/entities`, { data: { type: 'character', name: 'Private character', summary: 'PRIVATE_CHARACTER' } });
  await page.getByRole('button', { name: /^Agent Studio Assign/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Agent Studio' });
  await dialog.getByRole('button', { name: 'New agent', exact: true }).click();
  await dialog.getByLabel('Agent name', { exact: true }).fill('Muse B — Mara');
  await dialog.getByRole('button', { name: 'Undo agent edit', exact: true }).click();
  await expect(dialog.getByLabel('Agent name', { exact: true })).toHaveValue('New Muse');
  await dialog.getByRole('button', { name: 'Redo agent edit', exact: true }).click();
  await expect(dialog.getByLabel('Agent name', { exact: true })).toHaveValue('Muse B — Mara');
  await dialog.locator('summary').filter({ hasText: /^Characters ·/ }).click();
  await dialog.getByLabel('Characters access', { exact: true }).selectOption('selected');
  await dialog.getByRole('group', { name: 'Characters records', exact: true }).getByLabel('Mara', { exact: false }).check();
  await dialog.getByText('Preview model context', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Preview assigned context' }).click();
  await expect(dialog.locator('.context-preview')).toContainText('PUBLIC_MARA');
  await expect(dialog.locator('.context-preview')).not.toContainText('PRIVATE_CHARACTER');
  await page.screenshot({ path: testInfo.outputPath('agent-studio.png') });
  await dialog.getByRole('button', { name: 'Save agent', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Agent saved');
  const { agents } = await (await request.get(`/api/projects/${projectId}/agents`)).json();
  const saved = agents.find((a: any) => a.name === 'Muse B — Mara');
  expect(saved.access.allow).toEqual([{ kind: 'character', selection: { mode: 'selected', ids: [entity.id] } }]);
  await dialog.getByText('Saved arrangements', { exact: true }).click();
  await dialog.getByLabel('Arrangement name').fill('Character voice');
  await dialog.getByLabel('Muse B — Mara', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save arrangement', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Load Character voice as new agents' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to workspace' }).click();
  await page.reload();
  await page.getByRole('button', { name: /^Agent Studio Assign/ }).click();
  await dialog.getByRole('button', { name: 'Muse B — Mara Assigned knowledge' }).click();
  await expect(dialog.getByLabel('Agent name', { exact: true })).toHaveValue('Muse B — Mara');
  await dialog.getByRole('button', { name: 'Open conversation' }).click();
  const pane = page.locator('.agent-pane').filter({ hasText: 'Writing adviser' });
  await pane.getByPlaceholder('Ask Muse B — Mara…').fill('Explore her motivation.');
  await pane.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(pane.locator('.run-text')).toContainText('PUBLIC_MARA');
  await expect(pane.locator('.run-text')).not.toContainText('PRIVATE_CHARACTER');
});

test('binder recipe saves, previews selected story, downloads HTML and ZIP, and detects changed content', async ({ page, request, projectId }, testInfo) => {
  await request.put(`/api/projects/${projectId}/documents/chapter-01`, { data: { content: '# Reader story\n\nUNICODE — 狐.\n\n<script>alert("bad")</script>' } });
  await page.getByRole('button', { name: /^Project Binder Arrange/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Project Binder' });
  await dialog.getByRole('button', { name: 'Reader manuscript', exact: true }).click();
  await dialog.getByRole('button', { name: 'Undo recipe edit', exact: true }).click();
  await expect(dialog.locator('.binder-section')).toHaveCount(12);
  await dialog.getByRole('button', { name: 'Redo recipe edit', exact: true }).click();
  await expect(dialog.locator('.binder-section')).toHaveCount(1);
  await dialog.getByLabel('Binder title', { exact: true }).fill('My presentable project');
  await dialog.getByRole('button', { name: 'Save binder recipe' }).click();
  await expect(dialog.getByRole('status')).toContainText('recipe saved');
  await dialog.getByRole('button', { name: 'Preview binder', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Binder presentation"]');
  await expect(frame.getByRole('heading', { name: 'My presentable project', level: 1 })).toBeVisible();
  await expect(frame.locator('body')).toContainText('UNICODE — 狐.');
  expect(await frame.locator('script').count()).toBe(0);
  await frame.getByRole('navigation', { name: 'Contents' }).getByRole('link', { name: 'Manuscript' }).click();
  await expect(frame.getByRole('heading', { name: 'Manuscript', level: 2 })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'My presentable project', level: 1 })).toHaveCount(1);
  // Register in the parent realm: preview scripts are deliberately disabled.
  await page.evaluate(() => {
    const child = (document.querySelector('iframe[title="Binder presentation"]') as HTMLIFrameElement).contentWindow!;
    child.addEventListener('beforeprint', () => { document.body.dataset.binderPrinted = 'yes'; });
  });
  await dialog.getByRole('button', { name: 'Print / Save PDF' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-binder-printed', 'yes');
  await page.screenshot({ path: testInfo.outputPath('project-binder.png') });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const html = await downloadPromise;
  const downloadedHtml = await readFile((await html.path())!, 'utf8');
  expect(downloadedHtml).toContain('UNICODE — 狐.');
  const printable = await page.context().newPage();
  await printable.setContent(downloadedHtml);
  const pdf = await printable.pdf({ path: testInfo.outputPath('binder-print.pdf'), preferCSSPageSize: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  await printable.close();
  await dialog.getByText('Portable project package', { exact: true }).click();
  await dialog.getByLabel('Include private saved-project data, even material omitted from this binder').check();
  const zipPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download project ZIP' }).click();
  const zip = await zipPromise;
  expect((await readFile((await zip.path())!)).readUInt32LE(0)).toBe(0x04034b50);
  await request.put(`/api/projects/${projectId}/documents/chapter-01`, { data: { content: 'Changed after preview.' } });
  await dialog.getByRole('button', { name: 'Download HTML', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed');
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`project tools fit touch viewport ${viewport.width}×${viewport.height}`, async ({ page, projectId }, testInfo) => {
    void projectId;
    await page.setViewportSize(viewport);
    for (const [button, title] of [[/^Agent Studio/, 'Agent Studio'], [/^Project Binder/, 'Project Binder']] as const) {
      await page.getByRole('button', { name: button }).click();
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog.getByRole('button', { name: 'Back to workspace' })).toBeEnabled();
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const close = await dialog.getByRole('button', { name: 'Back to workspace' }).boundingBox();
      expect(close!.height).toBeGreaterThanOrEqual(44);
      await expect(dialog.locator('fieldset')).toBeEnabled();
      if (title === 'Project Binder') {
        await dialog.getByRole('button', { name: 'Preview binder', exact: true }).click();
        await expect(page.frameLocator('iframe[title="Binder presentation"]').locator('h1')).toBeVisible();
        expect(await page.frameLocator('iframe[title="Binder presentation"]').locator('body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`${title.replaceAll(' ', '-').toLowerCase()}.png`) });
      await dialog.getByRole('button', { name: 'Back to workspace' }).click();
      await expect(dialog).not.toBeVisible();
    }
  });
}
