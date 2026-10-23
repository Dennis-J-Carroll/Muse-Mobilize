import type { RecordKind } from '../../shared/record-proposals';

const pending = new Set<string>();
const key = (projectId: string, group: string, id: string) => JSON.stringify([projectId, group, id]);
export const recordGroup = (kind: RecordKind) => kind === 'characters' || kind === 'world' ? 'canon' : kind;
export const recordWriteBlocked = (projectId: string, group: string, id: string) => pending.has(key(projectId, group, id));
export function lockRecordProposal(projectId: string, kind: RecordKind, id: string) {
  const token = key(projectId, recordGroup(kind), id);
  if (pending.has(token)) throw new Error('Wait for this record’s current proposal to finish.');
  pending.add(token);
  return () => { pending.delete(token); };
}
