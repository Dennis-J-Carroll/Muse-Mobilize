import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import type { PremiseSlots, PremiseStore, PremiseVariant } from './types.js';

export const PREMISE_WORKING_MAX = 1200;
export const PREMISE_VARIANT_MAX = 600;
export const PREMISE_VARIANTS_MAX = 50;
const SLOT_KEYS: (keyof PremiseSlots)[] = ['protagonist', 'want', 'obstacle', 'stakes', 'twist'];

const premisePath = (projectDir: string) => path.join(projectDir, 'premise', 'premise.json');
const text = (value: unknown, max: number) => (value === undefined || value === null ? '' : String(value)).trim().slice(0, max);
const emptySlots = (): PremiseSlots => ({ protagonist: '', want: '', obstacle: '', stakes: '', twist: '' });
export const emptyPremise = (): PremiseStore => ({ version: 1, working: '', slots: emptySlots(), variants: [] });

/** Everything arriving here is untrusted (request bodies, hand-edited files). */
export function normalizePremise(input: Partial<PremiseStore> | null | undefined): PremiseStore {
  const source = input && typeof input === 'object' ? input : {};
  const rawSlots = source.slots && typeof source.slots === 'object' ? source.slots : {};
  const slots = emptySlots();
  for (const key of SLOT_KEYS) slots[key] = text((rawSlots as Record<string, unknown>)[key], PREMISE_VARIANT_MAX);

  const seen = new Set<string>();
  const variants: PremiseVariant[] = [];
  for (const item of Array.isArray(source.variants) ? source.variants : []) {
    const body = text(item?.text, PREMISE_VARIANT_MAX);
    if (!body || seen.has(body)) continue;
    seen.add(body);
    const created = typeof item?.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString();
    variants.push({ id: text(item?.id, 80) || randomUUID(), text: body, source: item?.source === 'muse' ? 'muse' : 'manual', createdAt: created });
    if (variants.length === PREMISE_VARIANTS_MAX) break;
  }
  return { version: 1, working: text(source.working, PREMISE_WORKING_MAX), slots, variants };
}

export async function readPremise(projectDir: string): Promise<PremiseStore> {
  const file = premisePath(projectDir);
  if (!(await exists(file))) return emptyPremise();
  return normalizePremise(JSON.parse(await fs.readFile(file, 'utf8')));
}

export async function writePremise(projectDir: string, input: Partial<PremiseStore>): Promise<PremiseStore> {
  const premise = normalizePremise(input);
  const file = premisePath(projectDir);
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(premise, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return premise;
}
