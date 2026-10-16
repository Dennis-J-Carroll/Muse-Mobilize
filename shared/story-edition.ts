/** Portable publication selection. This is separate from the full-project backup. */
export interface EditionImage {
  id: string;
  documentId: string;
  filename: string;
  caption: string;
  alt: string;
}
export interface EditionRecipe {
  version: 1;
  id: string;
  title: string;
  author: string;
  documentIds: string[];
  images: EditionImage[];
}
export interface EditionStore { version: 1; recipes: EditionRecipe[] }
export interface InlineMark { start: number; end: number; kind: 'bold' | 'italic' }
export interface StudioBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'divider';
  text: string;
  marks: InlineMark[];
  level?: number;
  condition: null;
}
export const EDITION_MAX_BYTES = 64 * 1024 * 1024;
export const EDITION_IMAGE_NAME = /^[a-f0-9-]{36}\.(png|jpg|webp|gif|avif)$/;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Edition must be an object.');
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Edition contains unsupported fields.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, maximum: number, required = false): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) throw new Error(`Invalid edition ${label}.`);
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error('Invalid edition record ID.');
  return value;
}
export function parseEditionRecipe(input: unknown): EditionRecipe {
  const value = object(input, ['version', 'id', 'title', 'author', 'documentIds', 'images']);
  if (value.version !== 1) throw new Error('Unsupported edition recipe version.');
  if (!Array.isArray(value.documentIds) || !value.documentIds.length || value.documentIds.length > 10_000) throw new Error('Select 1 to 10,000 manuscript documents.');
  const documentIds = value.documentIds.map(id);
  if (new Set(documentIds).size !== documentIds.length) throw new Error('A manuscript document can appear only once in an edition.');
  if (!Array.isArray(value.images) || value.images.length > 10_000) throw new Error('Invalid edition image selection.');
  const images = value.images.map(input => {
    const image = object(input, ['id', 'documentId', 'filename', 'caption', 'alt']);
    const documentId = id(image.documentId);
    if (!documentIds.includes(documentId)) throw new Error('Image placement must belong to a selected manuscript document.');
    if (typeof image.filename !== 'string' || !EDITION_IMAGE_NAME.test(image.filename)) throw new Error('Choose a managed local image; remote URLs and paths are not supported.');
    return { id: id(image.id), documentId, filename: image.filename, caption: text(image.caption, 'image caption', 4000), alt: text(image.alt, 'image alternative text', 2000) };
  });
  if (new Set(images.map(image => image.id)).size !== images.length) throw new Error('Duplicate image placement ID.');
  return { version: 1, id: id(value.id), title: text(value.title, 'title', 500, true), author: text(value.author, 'author', 500), documentIds, images };
}
export function parseEditionStore(input: unknown): EditionStore {
  const value = object(input, ['version', 'recipes']);
  if (value.version !== 1 || !Array.isArray(value.recipes) || value.recipes.length > 1000) throw new Error('Malformed edition recipe store.');
  const recipes = value.recipes.map(parseEditionRecipe);
  if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) throw new Error('Duplicate edition recipe ID.');
  return { version: 1, recipes };
}

export interface EditionWarning { documentId: string; title: string; message: string }
export interface EditionPreview {
  snapshotHash: string;
  recipeHash: string;
  capturedAt: string;
  encodedBytes: number;
  warnings: EditionWarning[];
  scenes: { id: string; documentId: string; title: string; blocks: StudioBlock[]; images: (EditionImage & { src: string; size: number })[] }[];
}
export interface EditionCatalog {
  documents: { id: string; title: string }[];
  images: { filename: string; src: string; size: number }[];
}
