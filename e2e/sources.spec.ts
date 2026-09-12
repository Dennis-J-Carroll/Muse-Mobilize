import { test, expect, openTool } from './fixtures';

const NOTE_MD = {
  name: 'savair-notes.md',
  mimeType: 'text/markdown',
  buffer: Buffer.from(
    `# Savair Notes\n\nInterdimensional Island: the crossing only opens at the new moon.\n\nSavair keeps her promises, but never her appointments.\n`,
    'utf8',
  ),
};

const DRAFT_MD = {
  name: 'amber-draft.md',
  mimeType: 'text/markdown',
  buffer: Buffer.from(
    `# Amber Eyes Draft\n\nSavair's island rose from the mist like a jaw of black stone.\n\nThe harbour was empty, and Kiala counted the boats twice.\n`,
    'utf8',
  ),
};

async function importSources(page: import('@playwright/test').Page) {
  await openTool(page, 'Sources');
  await page.getByLabel('Classification for imported sources').selectOption('notes');
  await page.getByLabel('Choose source files').setInputFiles([NOTE_MD, DRAFT_MD]);
  await expect(page.getByRole('heading', { name: 'savair-notes', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'amber-draft', exact: true })).toBeVisible();
}

test('imported sources list with provenance, open for reading, and survive reload', async ({ page, projectId }) => {
  void projectId;
  await importSources(page);

  // Card provenance: type, classification, authority, extraction status.
  await expect(page.getByText('Markdown · notes · Authority unknown', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Indexed · \d+ characters/).first()).toBeVisible();

  // Open the reading view: real extracted text, never the raw binary.
  await page.getByRole('button', { name: /savair-notes Markdown/ }).click();
  await expect(page.getByRole('heading', { name: 'savair-notes', level: 3 })).toBeVisible();
  await expect(page.getByText('the crossing only opens at the new moon')).toBeVisible();
  await expect(page.getByText('File: savair-notes.md', { exact: true })).toBeVisible();

  // Metadata edit persists.
  await page.getByLabel('Display title', { exact: true }).fill('Savair Dossier');
  await page.getByRole('button', { name: 'Save title', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Savair Dossier', level: 3 })).toBeVisible();

  await page.reload();
  await openTool(page, 'Sources');
  await expect(page.getByRole('heading', { name: 'Savair Dossier', exact: true })).toBeVisible();
});

test('offline lexical search finds passages and opens the cited source', async ({ page, projectId }) => {
  void projectId;
  await importSources(page);
  await page.getByLabel('Search story material').fill('new moon crossing');
  await expect(page.getByText('the crossing only opens at the new moon')).toBeVisible();

  // The result names its source; opening it shows the highlighted passage.
  await page.getByRole('button', { name: 'Open source', exact: true }).first().click();
  await expect(page.getByText('the crossing only opens at the new moon')).toBeVisible();

  // Unmatchable queries say so honestly instead of inventing results.
  await page.getByRole('button', { name: '← All sources', exact: true }).click();
  await page.getByLabel('Search story material').fill('zzzqqx nothing matches this');
  await expect(page.getByText('No matching passages', { exact: false })).toBeVisible();
});

test('delete removes a source from the list', async ({ page, projectId }) => {
  void projectId;
  await importSources(page);
  // Deletion lives in the reading view's metadata editor, behind a confirm.
  await page.getByRole('button', { name: /amber-draft Markdown/ }).click();
  await page.getByRole('button', { name: 'Delete source amber-draft', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete source amber-draft', exact: true }).click();
  await page.getByRole('button', { name: '← All sources', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'amber-draft', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'savair-notes', exact: true })).toBeVisible();
});
