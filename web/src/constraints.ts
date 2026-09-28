import type { CanonEntity, ConstraintItem, ConstraintSlot } from './types';

/** Kept import-free (types only) so it unit-tests under plain node. */
export const SLOT_ORDER: ConstraintSlot[] = ['pov', 'place', 'anchor', 'restriction', 'pressure'];
export const SLOT_LABELS: Record<ConstraintSlot, string> = {
  pov: 'Point of view', place: 'Place', anchor: 'Anchor', restriction: 'Restriction', pressure: 'Pressure',
};

/** Craft deck. Canon slots use their entries only when the project has no matching canon. */
export const DECK: Record<ConstraintSlot, string[]> = {
  pov: [
    'Tell it from the point of view of whoever has the most to lose.',
    'Tell it from the point of view of someone who wants to leave.',
    'Tell it through the eyes of the least powerful person present.',
    'Tell it from the point of view of the one keeping a secret.',
    'Tell it from the point of view of someone who arrives late.',
    'Tell it from the point of view of the antagonist.',
  ],
  place: [
    'Move the scene somewhere it has never been.',
    'Set it somewhere too small for everyone in it.',
    'Set it outdoors, in bad weather.',
    'Set it somewhere public, where they cannot speak freely.',
    'Set it in a place that means something to one character only.',
    'Set it somewhere in motion: a road, a boat, a march.',
  ],
  anchor: [
    'An object must change hands.',
    'Something is lost, broken, or taken.',
    'A letter, token, or keepsake must matter.',
    'A weapon is present but never used.',
    'Something is hidden in plain sight.',
    'A gift is given with the wrong meaning.',
  ],
  restriction: [
    'No dialogue tags.',
    'One room only.',
    'Under 300 words.',
    'Present tense.',
    'No adverbs.',
    'Only dialogue.',
    'A single paragraph.',
    'Never use the word "said".',
    'Start mid-action.',
    'No one says what they mean.',
    'Every line of dialogue is a question.',
    'No backstory or flashback.',
    'Use only three characters.',
    'Show one emotion without naming it.',
    'End in the middle of an action.',
    'Include one sound, one smell, and one texture.',
    'No sentence longer than twelve words.',
    'Let silence do the most important work.',
  ],
  pressure: [
    'Someone lies.',
    'A secret surfaces.',
    'End on an unanswered question.',
    'The weather turns.',
    'Someone leaves early.',
    'An object breaks.',
    'A promise is broken.',
    'Someone is interrupted at the worst moment.',
    'A clock is running out.',
    'An ally takes the other side.',
    'Someone overhears.',
    'The plan fails in the first minute.',
    'A debt is called in.',
    'Someone is not who they seem.',
    'A small kindness costs too much.',
    'Two characters want the same thing.',
    'The crowd turns.',
    'Someone must choose between two loyalties.',
  ],
};

export type Rng = () => number;
type Candidate = { text: string; entityId?: string };
const sentence = (text: string) => { const body = text.trim().replace(/[.!?]+$/, ''); return `${body.charAt(0).toUpperCase()}${body.slice(1)}.`; };
const OBJECT_TEMPLATES = ['{name} must change hands', '{name} is lost, broken, or taken', 'Someone lies about {name}'];

function candidates(slot: ConstraintSlot, entities: Pick<CanonEntity, 'id' | 'type' | 'name'>[]): Candidate[] {
  const of = (type: string) => entities.filter((entity) => entity.type === type && entity.name.trim());
  let found: Candidate[] = [];
  if (slot === 'pov') found = of('character').map((e) => ({ text: `Tell it from ${e.name.trim()}'s point of view.`, entityId: e.id }));
  if (slot === 'place') found = of('location').map((e) => ({ text: sentence(`Set it in ${e.name}`), entityId: e.id }));
  if (slot === 'anchor') {
    const objects = of('object');
    found = objects.length
      ? objects.flatMap((e) => OBJECT_TEMPLATES.map((template) => ({ text: sentence(template.replace('{name}', e.name.trim())), entityId: e.id })))
      : of('rule').map((e) => ({ text: sentence(`The scene must test a rule: ${e.name}`), entityId: e.id }));
  }
  return found.length ? found : DECK[slot].map((text) => ({ text }));
}

/** One fresh constraint for a slot; never repeats avoidText when another option exists. */
export function rollSlot(slot: ConstraintSlot, entities: Pick<CanonEntity, 'id' | 'type' | 'name'>[], avoidText?: string, rng: Rng = Math.random): ConstraintItem {
  const all = candidates(slot, entities);
  const fresh = all.filter((candidate) => candidate.text !== avoidText);
  const pool = fresh.length ? fresh : all;
  const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { slot, text: pick.text, done: false, ...(pick.entityId ? { entityId: pick.entityId } : {}) };
}

/** All five slots in order; locked slots are kept exactly as they are in current. */
export function rollAll(entities: Pick<CanonEntity, 'id' | 'type' | 'name'>[], current: ConstraintItem[] | null, locked: Set<ConstraintSlot>, rng: Rng = Math.random): ConstraintItem[] {
  return SLOT_ORDER.map((slot) => {
    const previous = current?.find((item) => item.slot === slot);
    return previous && locked.has(slot) ? previous : rollSlot(slot, entities, previous?.text, rng);
  });
}
