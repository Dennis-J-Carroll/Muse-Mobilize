import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseRecipe, resourceKey, type BinderRecipe } from '../../shared/project-tools.js';
import { projectResources, resourceContent } from './project-resources.js';
import { projectDir } from './projects.js';
import { safeJoin } from './paths.js';
import { atomicJson } from './agent-config.js';
import { exportProjectBackup, type ProjectBackup } from './backups.js';
import { buildZip, markdownToHtml } from './export.js';

const escape = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const snapshotHash = (backup: ProjectBackup) => createHash('sha256').update(JSON.stringify(backup.files.map((f) => [f.path, f.sha256]).sort((a, b) => a[0].localeCompare(b[0])))).digest('hex');
export interface BinderPreview {
  html: string; warnings: string[]; included: number; omitted: number;
  receipt: { renderer: 'muse-binder-1'; capturedAt: string; snapshotHash: string; recipeHash: string; records: { key: string; sha256: string }[] };
}
export async function readBinder(projectId: string): Promise<BinderRecipe | null> {
  try { return parseRecipe(JSON.parse(await fs.readFile(safeJoin(await projectDir(projectId), 'binder/recipe.json'), 'utf8'))); }
  catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveBinder(projectId: string, value: unknown): Promise<BinderRecipe> {
  const recipe = parseRecipe(value);
  await atomicJson(safeJoin(await projectDir(projectId), 'binder/recipe.json'), recipe);
  return recipe;
}
export async function verifyBinderSnapshot(projectId: string, expected: unknown): Promise<void> {
  if (typeof expected !== 'string' || snapshotHash(await exportProjectBackup(projectId)) !== expected) throw new Error('Saved project changed. Refresh the binder preview before downloading.');
}

export async function previewBinder(projectId: string, input: unknown, expected?: string): Promise<BinderPreview> {
  const recipe = parseRecipe(input);
  const backup = await exportProjectBackup(projectId);
  const snapshot = snapshotHash(backup);
  if (expected !== undefined && expected !== snapshot) throw new Error('Saved project changed. Refresh the binder preview.');
  const catalog = await projectResources(projectId);
  const warnings = new Set<string>();
  const selected = recipe.sections.map((section) => {
    const { selection } = section;
    if (selection.mode === 'all') return catalog.filter((r) => r.kind === section.kind);
    return selection.ids.flatMap((id) => { const record = catalog.find((r) => r.kind === section.kind && r.id === id); if (!record) warnings.add(`${section.title}: missing record ${id}.`); return record ? [record] : []; });
  });
  const keys = new Set(selected.flat().map(resourceKey));
  const records: BinderPreview['receipt']['records'] = [];
  let included = 0;
  let totalBytes = 0;
  const anchor = (key: string) => `record-${createHash('sha256').update(key).digest('hex').slice(0, 20)}`;
  const seen = new Set<string>();
  const sectionHtml: string[] = [];
  for (const [index, section] of recipe.sections.entries()) {
    const body: string[] = [];
    for (const record of selected[index]) {
      const content = await resourceContent(projectId, record, keys, catalog);
      for (const warning of content.warnings) warnings.add(`${record.title}: ${warning}`);
      if (!content.text && !content.images.length) continue;
      const key = resourceKey(record);
      records.push({ key, sha256: createHash('sha256').update(content.text).digest('hex') });
      included++;
      const images: string[] = [];
      if (recipe.includeImages) {
        for (const img of content.images) {
          const prefix = `/api/projects/${projectId}/assets/images/`;
          const name = img.src?.startsWith(prefix) ? img.src.slice(prefix.length) : '';
          if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|avif)$/.test(name)) { warnings.add(`${record.title}: external or unsupported image omitted (${img.caption || 'uncaptioned image'}).`); continue; }
          const file = backup.files.find((f) => f.path === `assets/images/${name}`);
          if (!file) { warnings.add(`${record.title}: missing local image.`); continue; }
          const extension = name.split('.').pop();
          images.push(`<figure><img src="data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${file.data}" alt="${escape(img.caption || record.title)}"><figcaption>${escape(img.caption || '')}</figcaption></figure>`);
        }
      }
      const links = (record.required ?? []).filter((ref) => keys.has(resourceKey(ref))).map((ref) => {
        const title = catalog.find((r) => resourceKey(r) === resourceKey(ref))?.title ?? ref.id;
        return `<a href="#${anchor(resourceKey(ref))}">${escape(title)}</a>`;
      });
      const id = seen.has(key) ? `${anchor(key)}-${index}` : anchor(key); seen.add(key);
      const article = `<article id="${id}"><p class="kind">${escape(record.detail ?? record.kind)}</p><h3>${escape(record.title)}</h3>${record.kind === 'document' ? markdownToHtml(content.text) : `<div class="card-text">${escape(content.text)}</div>`}${images.join('')}${links.length ? `<p class="related">Related: ${links.join(' · ')}</p>` : ''}</article>`;
      totalBytes += Buffer.byteLength(article);
      if (totalBytes > 65 * 1024 * 1024) throw new Error('Rendered binder exceeds 65 MiB. Select fewer sections or omit images.');
      body.push(article);
    }
    sectionHtml.push(`<section id="section-${index}"><h2>${escape(section.title)}</h2>${body.length ? body.join('\n') : '<p class="empty">No selected material in this section.</p>'}</section>`);
  }
  if (snapshotHash(await exportProjectBackup(projectId)) !== snapshot) throw new Error('Project changed during preview. Save changes and retry.');
  const receipt: BinderPreview['receipt'] = { renderer: 'muse-binder-1', capturedAt: backup.capturedAt, snapshotHash: snapshot, recipeHash: createHash('sha256').update(JSON.stringify(recipe)).digest('hex'), records };
  const omitted = catalog.filter((r) => !seen.has(resourceKey(r))).length;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(recipe.title)}</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:#263733;background:#f1efe7;font:17px/1.7 Georgia,serif;overflow-wrap:anywhere}main{max-width:900px;margin:auto;padding:60px 64px;background:#fffdf7}header{border-bottom:2px solid #6d806f;padding-bottom:36px}h1{font-size:clamp(2rem,6vw,3.7rem);line-height:1.1;font-weight:500}h2{font-size:2rem;border-bottom:1px solid #bbc6b9;padding-bottom:12px}h3{font-size:1.5rem;margin-top:0}h4,h5,h6{font-size:1.1rem}nav{padding:28px 0}nav a{display:block;padding:8px 0;color:#365d4c}section{margin:50px 0}article{margin:28px 0;padding:24px 0;border-bottom:1px solid #e2e3d8}.kind,.receipt,figcaption{font:12px/1.5 system-ui,sans-serif;color:#54665d}.kind{text-transform:uppercase;letter-spacing:.12em}.card-text{white-space:pre-wrap;font-size:15px}img{display:block;max-width:100%;max-height:650px;height:auto;margin:auto}figure{margin:24px 0}figcaption{text-align:center;margin-top:8px}blockquote{border-left:3px solid #a6b5a7;padding-left:20px}a{color:#365d4c}.receipt{margin-top:50px;border-top:1px solid #abb8ac;padding-top:18px}.empty{font-style:italic;color:#64756b}@media(max-width:600px){main{padding:28px 20px}}@page{size:${recipe.pageSize === 'a4' ? 'A4' : 'letter'};margin:20mm}@media print{body,main{background:white}main{max-width:none;padding:0}nav a{padding:2px 0}section{break-before:page}h2,h3,h4{break-after:avoid}figure{break-inside:avoid}p{orphans:3;widows:3}a{text-decoration:none}html{scroll-behavior:auto}}
</style></head><body><main><header><p class="kind">Muse · Project Binder</p><h1>${escape(recipe.title)}</h1><div class="card-text">${escape(recipe.introduction)}</div></header><nav aria-label="Contents"><h2>Contents</h2>${recipe.sections.map((s, i) => `<a href="#section-${i}">${escape(s.title)}</a>`).join('')}</nav>${sectionHtml.join('\n')}<footer class="receipt">Saved material captured ${escape(backup.capturedAt)} · ${included} records rendered · ${omitted} records omitted.<br>Renderer: muse-binder-1 · Snapshot: ${snapshot}<br>${[...warnings].map(escape).join('<br>')}</footer></main></body></html>`;
  return { html, warnings: [...warnings], included, omitted, receipt };
}

export async function packageBinder(projectId: string, input: unknown, expected: string): Promise<Buffer> {
  const recipe = parseRecipe(input);
  const preview = await previewBinder(projectId, recipe, expected);
  const backup = await exportProjectBackup(projectId);
  if (snapshotHash(backup) !== preview.receipt.snapshotHash) throw new Error('Project changed. Refresh the preview.');
  const files = [
    { name: 'binder.html', data: Buffer.from(preview.html) },
    { name: 'binder-recipe.json', data: Buffer.from(JSON.stringify(recipe, null, 2)) },
    { name: 'project-backup.json', data: Buffer.from(JSON.stringify(backup)) },
    { name: 'receipt.json', data: Buffer.from(JSON.stringify(preview.receipt, null, 2)) },
    { name: 'README.txt', data: Buffer.from('Muse Project Package\n\nOpen binder.html in a browser to read or print to PDF.\nEdit binder-recipe.json or import it through Project Binder.\nTo restore the saved project, extract project-backup.json and choose Backups > Restore as new project in Muse.\n\nPRIVATE ARCHIVE: project-backup.json includes supported saved project data even when omitted from the binder. Unsaved drafts, browser Saved Desks, and provider/account settings are excluded.\n') },
  ];
  if (files.reduce((size, file) => size + file.data.length, 0) > 120 * 1024 * 1024) throw new Error('Package exceeds 120 MiB. Download the binder and backup separately.');
  return buildZip(files);
}
