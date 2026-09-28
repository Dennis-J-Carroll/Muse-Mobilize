import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import type { ConstraintItem, ConstraintSlot, ConstraintStore } from './types.js';

export const CONSTRAINT_TEXT_MAX = 200;
export const CONSTRAINT_SLOTS: ConstraintSlot[] = ['pov', 'place', 'anchor', 'restriction', 'pressure'];

const constraintsPath = (projectDir: string) => path.join(projectDir, 'constraints', 'constraints.json');
const unpinned = (): ConstraintStore => ({ version: 1, pinned: null });

/** Everything arriving here is untrusted (request bodies, hand-edited files). */
export function normalizeConstraints(input: Partial<ConstraintStore> | null | undefined): ConstraintStore {
  const pinned = input && typeof input === 'object' ? input.pinned : null;
  if (!pinned || typeof pinned !== 'object' || !Array.isArray(pinned.items)) return unpinned();
  const bySlot = new Map<ConstraintSlot, ConstraintItem>();
  for (const raw of pinned.items) {
    const slot = raw?.slot as ConstraintSlot;
    if (!CONSTRAINT_SLOTS.includes(slot) || bySlot.has(slot)) continue;
    const text = String(raw?.text ?? '').trim().slice(0, CONSTRAINT_TEXT_MAX);
    if (!text) continue;
    const entityId = typeof raw?.entityId === 'string' && raw.entityId.trim() && raw.entityId.length <= 80 ? raw.entityId.trim() : undefined;
    bySlot.set(slot, { slot, text, done: Boolean(raw?.done), ...(entityId ? { entityId } : {}) });
  }
  const items = CONSTRAINT_SLOTS.flatMap((slot) => bySlot.get(slot) ?? []);
  if (!items.length) return unpinned();
  const id = typeof pinned.id === 'string' && pinned.id.trim() ? pinned.id.trim().slice(0, 80) : randomUUID();
  const pinnedAt = typeof pinned.pinnedAt === 'string' && !Number.isNaN(Date.parse(pinned.pinnedAt)) ? pinned.pinnedAt : new Date().toISOString();
  return { version: 1, pinned: { id, pinnedAt, items } };
}

export async function readConstraints(projectDir: string): Promise<ConstraintStore> {
  const file = constraintsPath(projectDir);
  if (!(await exists(file))) return unpinned();
  return normalizeConstraints(JSON.parse(await fs.readFile(file, 'utf8')));
}

export async function writeConstraints(projectDir: string, input: Partial<ConstraintStore>): Promise<ConstraintStore> {
  const constraints = normalizeConstraints(input);
  const file = constraintsPath(projectDir);
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(constraints, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return constraints;
}
