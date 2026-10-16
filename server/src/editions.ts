import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJson } from './agent-config.js';
import { projectDir } from './projects.js';
import { parseEditionRecipe, parseEditionStore, type EditionRecipe, type EditionStore } from '../../shared/story-edition.js';
import type { ProjectManifest } from './types.js';

export async function readEditionsAt(directory: string): Promise<EditionStore> {
  try { return parseEditionStore(JSON.parse(await fs.readFile(path.join(directory, 'editions/recipes.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, recipes: [] }; throw error; }
}
export async function readEditions(projectId: string) { return readEditionsAt(await projectDir(projectId)); }
/** Call under the existing project edit lock; the route records the editions undo scope. */
export async function saveEditionAt(directory: string, editionId: string, input: unknown): Promise<EditionRecipe> {
  const recipe = parseEditionRecipe(input);
  if (recipe.id !== editionId) throw new Error('Edition ID must match the selected recipe.');
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'project.json'), 'utf8')) as ProjectManifest;
  for (const id of recipe.documentIds) {
    if (!manifest.documents.some(doc => doc.id === id && doc.kind === 'manuscript')) throw new Error(`Select a saved manuscript document: ${id}. Scene cards and summaries cannot substitute for prose.`);
  }
  const store = await readEditionsAt(directory);
  const index = store.recipes.findIndex(entry => entry.id === recipe.id);
  if (index < 0) store.recipes.push(recipe); else store.recipes[index] = recipe;
  await atomicJson(path.join(directory, 'editions/recipes.json'), parseEditionStore(store));
  return recipe;
}
export async function saveEdition(projectId: string, editionId: string, input: unknown) {
  return saveEditionAt(await projectDir(projectId), editionId, input);
}
