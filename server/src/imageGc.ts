import fs from 'node:fs/promises';
import { imageAssetPath, managedImageFileName } from './assets.js';
import { readCanon } from './canon.js';
import { readPlot } from './plot.js';
import { readReferences } from './references.js';
import type { StoryImage } from './types.js';

function fileNamesFrom(images: StoryImage[] | undefined): string[] {
  return (images ?? []).flatMap((image) => {
    const fileName = managedImageFileName(image.src);
    return fileName ? [fileName] : [];
  });
}

/** Every managed image file name still referenced by any store in the project. */
export async function collectManagedImageFileNames(projectDir: string): Promise<Set<string>> {
  const names = new Set<string>();
  const canon = await readCanon(projectDir);
  for (const entity of canon.entities) {
    fileNamesFrom(entity.character?.references.images).forEach((name) => names.add(name));
    fileNamesFrom(entity.world?.images).forEach((name) => names.add(name));
  }
  const plot = await readPlot(projectDir);
  for (const node of plot.nodes) fileNamesFrom(node.images).forEach((name) => names.add(name));
  const references = await readReferences(projectDir);
  for (const item of references.items) fileNamesFrom(item.images).forEach((name) => names.add(name));
  return names;
}

/** Deletes each candidate image file that no remaining store still points to. */
export async function deleteOrphanedImages(projectDir: string, candidateFileNames: string[]): Promise<void> {
  if (!candidateFileNames.length) return;
  const stillUsed = await collectManagedImageFileNames(projectDir);
  await Promise.all(
    candidateFileNames
      .filter((fileName) => !stillUsed.has(fileName))
      .map((fileName) => fs.rm(imageAssetPath(projectDir, fileName), { force: true })),
  );
}
