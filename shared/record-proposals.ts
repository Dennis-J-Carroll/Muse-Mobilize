export type RecordKind = 'characters' | 'scenes' | 'plot' | 'world';
export type FieldValue = string | string[];
export interface ProposalField { id: string; label: string; list?: boolean }
export const PROPOSAL_TEXT_MAX = 12000;
export const RECORD_LABELS: Record<RecordKind, string> = { characters: 'Characters', scenes: 'Scenes', plot: 'Plot', world: 'World' };
export const RECORD_FIELDS: Record<RecordKind, readonly ProposalField[]> = {
  characters: [
    { id: 'summary', label: 'Story function' },
    { id: 'character.attributes.role', label: 'Role' },
    { id: 'character.attributes.goals', label: 'Goals', list: true },
    { id: 'character.attributes.fears', label: 'Fears', list: true },
    { id: 'character.physical.description', label: 'Physical description' },
    { id: 'character.senses.vision.summary', label: 'Vision' },
    { id: 'character.senses.audio.summary', label: 'Audio' },
    { id: 'character.senses.proximity.summary', label: 'Proximity' },
  ],
  scenes: [{ id: 'summary', label: 'What happens' }, { id: 'purpose', label: 'Why this scene exists' }],
  plot: [
    { id: 'summary', label: 'Summary' }, { id: 'details.goal', label: 'Goal' },
    { id: 'details.conflict', label: 'Conflict' }, { id: 'details.stakes', label: 'Stakes' },
    { id: 'details.outcome', label: 'Outcome' }, { id: 'details.notes', label: 'Notes' },
  ],
  world: [
    { id: 'summary', label: 'Summary' }, { id: 'world.attributes.era', label: 'Era' },
    { id: 'world.attributes.atmosphere', label: 'Atmosphere' }, { id: 'world.attributes.significance', label: 'Significance' },
  ],
};
export interface RecordProposalInput {
  kind: RecordKind; recordId: string; field: string; mode: 'append' | 'replace'; excerpt: string;
}
export interface RecordProposal extends RecordProposalInput {
  revision: string; title: string; fieldLabel: string; before: FieldValue; after: FieldValue;
}
export const isRecordKind = (value: unknown): value is RecordKind => typeof value === 'string' && Object.hasOwn(RECORD_FIELDS, value);
