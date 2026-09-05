import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { cleanStoryImages } from './assets.js';
import { ensureDir, exists } from './paths.js';
import type { WorldMap } from './types.js';

const mapPath = (projectDir: string) => path.join(projectDir, 'world', 'map.json');
const emptyMap = (): WorldMap => ({ version: 1, image: null, opacity: .55, visible: true });
const MANAGED_IMAGE = /^\/api\/projects\/[^/?#]+\/assets\/images\/[^/?#]+\.(png|jpe?g|webp|gif|avif)$/i;

function cleanMapImage(value: unknown): WorldMap['image'] {
  const [image] = cleanStoryImages(value === null || value === undefined ? [] : [value]);
  if (!image) return null;
  if (MANAGED_IMAGE.test(image.src)) return image;
  try {
    const parsed = new URL(image.src);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return image;
  } catch {
    // Falls through to the shared validation error below.
  }
  throw new Error('world map image must use a managed project image or http(s) URL');
}

function cleanOpacity(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : .55;
}

export async function readWorldMap(projectDir: string): Promise<WorldMap> {
  const file = mapPath(projectDir);
  if (!(await exists(file))) return emptyMap();
  return { ...emptyMap(), ...JSON.parse(await fs.readFile(file, 'utf8')), version: 1 };
}

export async function writeWorldMap(projectDir: string, patch: Partial<Omit<WorldMap, 'version'>>): Promise<WorldMap> {
  const current = await readWorldMap(projectDir);
  const map: WorldMap = {
    ...current,
    ...('image' in patch ? { image: cleanMapImage(patch.image) } : {}),
    ...('opacity' in patch ? { opacity: cleanOpacity(patch.opacity) } : {}),
    ...('visible' in patch ? { visible: Boolean(patch.visible) } : {}),
    version: 1,
  };
  const file = mapPath(projectDir);
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return map;
}
