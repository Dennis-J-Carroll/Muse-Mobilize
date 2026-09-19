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
      .map((fileName) => fs.rm(mediaAssetPath(projectDir, fileName), { force: true })),
  );
}
