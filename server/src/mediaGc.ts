import fs from 'node:fs/promises';
import { mediaAssetPath, managedMediaFileName } from './mediaAssets.js';
import { readMediaCanvas } from './media.js';

/** Every managed audio/video file name still referenced by the project's media canvas. */
export async function collectManagedMediaFileNames(projectDir: string): Promise<Set<string>> {
  const names = new Set<string>();
  const canvas = await readMediaCanvas(projectDir);
  for (const node of canvas.nodes) {
    if (node.kind !== 'audio' && node.kind !== 'video') continue;
    const fileName = managedMediaFileName(node.assetSrc);
    if (fileName) names.add(fileName);
  }
  return names;
}

/** Deletes each candidate media file that no remaining canvas node still points to. */
export async function deleteOrphanedMedia(projectDir: string, candidateFileNames: string[]): Promise<void> {
  if (!candidateFileNames.length) return;
  const stillUsed = await collectManagedMediaFileNames(projectDir);
  await Promise.all(
    candidateFileNames
      .filter((fileName) => !stillUsed.has(fileName))
      .map(async (fileName) => {
        // A candidate that doesn't parse as a managed media asset name (e.g.
        // not UUID-shaped) was never something GC could have written, so
        // there's nothing to delete: skip it rather than letting
        // mediaAssetPath's strict validation throw mid-collection.
        let target: string;
        try { target = mediaAssetPath(projectDir, fileName); }
        catch { return; }
        await fs.rm(target, { force: true });
      }),
  );
}
