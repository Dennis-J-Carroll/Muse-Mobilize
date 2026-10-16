import fs from 'node:fs/promises';
import path from 'node:path';
import { previewBinder } from './binder.js';
import { writeVerifiedPackage } from './archive-package.js';
import type { BinderRecipe } from '../../shared/project-tools.js';
import { parentPort, workerData } from 'node:worker_threads';
import { captureSavedProject, writeBackupArchive, readBackupArchive, installSavedProject, validateSavedProject, type ArchiveManifest } from './backup-archive.js';

export interface ArchiveTask {
  operation: 'export' | 'validate' | 'restore';
  work: string; source?: string; sourceId?: string;
  workspace?: string; targetId?: string; jobId: string;
  manifest?: ArchiveManifest; binder?: { recipe: BinderRecipe; snapshotHash: string };
}
const task = workerData as ArchiveTask;
const controller = new AbortController();
parentPort!.on('message', message => { if (message === 'cancel') controller.abort(); });
let lastProgress = 0;
const options = { signal: controller.signal, progress(phase: string, bytes: number, total: number) {
  if (Date.now() - lastProgress < 200 && bytes !== total) return;
  lastProgress = Date.now(); parentPort!.postMessage({ type: 'progress', phase, bytes, total });
} };
try {
  let result: unknown;
  const snapshot = path.join(task.work, 'snapshot');
  const archive = path.join(task.work, 'backup.muse-backup.zip');
  if (task.operation === 'export') {
    const manifest = await captureSavedProject(task.source!, task.sourceId!, snapshot, options);
    parentPort!.postMessage({ type: 'progress', phase: 'building', bytes: 0, total: 0 });
    const partial = archive + '.partial';
    await writeBackupArchive(snapshot, manifest, partial, options);
    await readBackupArchive(partial, undefined, options);
    await fs.rename(partial, archive);
    const project = await validateSavedProject(snapshot, manifest);
    let artifact = archive;
    if (task.binder) {
      const preview = await previewBinder(task.sourceId!, task.binder.recipe, task.binder.snapshotHash, snapshot);
      const files = [
        { name: 'binder.html', data: preview.html },
        { name: 'binder-recipe.json', data: JSON.stringify(task.binder.recipe, null, 2) },
        { name: 'receipt.json', data: JSON.stringify({ ...preview.receipt, backupSnapshotHash: manifest.snapshotHash }, null, 2) },
        { name: 'README.txt', data: 'Open binder.html to read or print. To restore, extract backup.muse-backup.zip and choose Backups > Restore as new project. This private archive includes saved material omitted from the readable binder. Browser drafts, Saved Desks and provider/account settings are excluded.\n' },
      ];
      for (const file of files) await fs.writeFile(path.join(task.work, file.name), file.data, { flag: 'wx', mode: 0o600 });
      artifact = path.join(task.work, 'project-package.zip');
      await writeVerifiedPackage([...files.map(file => ({ name: file.name, path: path.join(task.work, file.name) })), { name: 'backup.muse-backup.zip', path: archive }], artifact + '.partial', controller.signal);
      await fs.rename(artifact + '.partial', artifact);
      for (const file of files) await fs.unlink(path.join(task.work, file.name));
      await fs.unlink(archive);
    }
    await fs.rm(snapshot, { recursive: true });
    result = { manifest, project, artifactBytes: (await fs.stat(artifact)).size };
  } else if (task.operation === 'validate') {
    const manifest = await readBackupArchive(path.join(task.work, 'upload'), snapshot, options);
    const project = await validateSavedProject(snapshot, manifest);
    await fs.unlink(path.join(task.work, 'upload'));
    result = { manifest, project };
  } else {
    result = { project: await installSavedProject(snapshot, task.manifest!, task.workspace!, task.targetId!, {
      ...options, installation: { jobId: task.jobId, staging: path.join(task.workspace!, `.muse-restore-${task.jobId}`) },
    }) };
  }
  parentPort!.postMessage({ type: 'result', result });
} catch (error: any) {
  parentPort!.postMessage({ type: 'failure', error: { code: error.code ?? 'ARCHIVE_FAILED', status: error.status ?? 400, message: error.message ?? String(error) } });
} finally { parentPort!.close(); }
