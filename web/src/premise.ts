import type { PremiseSlots, PremiseStore, PremiseVariantSource } from './types';

/** Kept import-free (types only) so it unit-tests under plain node. */
export const emptyPremise = (): PremiseStore => ({
  version: 1, working: '', slots: { protagonist: '', want: '', obstacle: '', stakes: '', twist: '' }, variants: [],
});

type Stamp = () => { id: string; createdAt: string };
const defaultStamp: Stamp = () => ({ id: crypto.randomUUID(), createdAt: new Date().toISOString() });
const clean = (value: string) => value.trim().replace(/[.!?]+$/, '').trim();

/** "When {protagonist} wants {want}, {obstacle} stands in the way. If they fail, {stakes}. But {twist}." — empty slots drop out. */
export function composeLogline(slots: PremiseSlots): string {
  const [who, want, obstacle, stakes, twist] = [slots.protagonist, slots.want, slots.obstacle, slots.stakes, slots.twist].map(clean);
  const opening = who && want ? `When ${who} wants ${want}` : want ? `When someone wants ${want}` : who;
  const sentences: string[] = [];
  if (opening && obstacle) sentences.push(`${opening}, ${obstacle} stands in the way.`);
  else if (opening) sentences.push(`${opening}.`);
  else if (obstacle) sentences.push(`${obstacle} stands in the way.`);
  if (stakes) sentences.push(`If they fail, ${stakes}.`);
  if (twist) sentences.push(`But ${twist}.`);
  return sentences.join(' ');
}

/** Save text as a variant (newest first). Blank or duplicate text returns the store unchanged. */
export function keepVariant(store: PremiseStore, text: string, source: PremiseVariantSource, stamp: Stamp = defaultStamp): PremiseStore {
  const body = text.trim();
  if (!body || store.variants.some((variant) => variant.text === body)) return store;
  return { ...store, variants: [{ ...stamp(), text: body, source }, ...store.variants] };
}

export function removeVariant(store: PremiseStore, id: string): PremiseStore {
  return { ...store, variants: store.variants.filter((variant) => variant.id !== id) };
}

/** Make text the working premise. The previous working premise is kept as a variant, so promoting never loses text. */
export function promote(store: PremiseStore, text: string, stamp: Stamp = defaultStamp): PremiseStore {
  const body = text.trim();
  const previous = store.working.trim();
  let next: PremiseStore = { ...store, working: body, variants: store.variants.filter((variant) => variant.text !== body) };
  if (previous && previous !== body) next = keepVariant(next, previous, 'manual', stamp);
  return next;
}
