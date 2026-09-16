/** Versioned, portable data shared by the runtime and project tools. */
export const RESOURCE_LABELS = {
  document: 'Documents', character: 'Characters', world: 'World', fact: 'Canon facts',
  plot: 'Plot', scene: 'Scenes and dialogue', theme: 'Themes', reference: 'References',
  source: 'Sources', goal: 'Goals', 'world-map': 'World map', connection: 'Connections',
  agent: 'Agent definitions', activity: 'Activity log',
} as const;
export type ResourceKind = keyof typeof RESOURCE_LABELS;
export interface ResourceRef { kind: ResourceKind; id: string }
export interface ResourceInfo extends ResourceRef { title: string; detail?: string }
export type ResourceSelection = { mode: 'all' } | { mode: 'selected'; ids: string[] };
export interface ResourceRule { kind: ResourceKind; selection: ResourceSelection }
export interface AgentAccess {
  version: 1;
  revision: string;
  allow: ResourceRule[];
  deny: ResourceRule[];
  selection: boolean;
  proposeEdits: boolean;
}
export interface BinderSection extends ResourceRule { id: string; title: string }
export interface BinderRecipe {
  format: 'muse-project-binder'; version: 1; title: string; introduction: string;
  sections: BinderSection[];
  pageSize: 'letter' | 'a4'; includeImages: boolean;
}
export const resourceKey = (ref: ResourceRef) => `${ref.kind}:${ref.id}`;
export const object = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
export function textField(x: unknown, label: string, max = 200, empty = false): string {
  if (typeof x !== 'string' || (!empty && !x.trim()) || x.length > max) throw new Error(`${label} must be ${empty ? '0' : '1'}–${max} characters.`);
  return x;
}
function keys(x: Record<string, any>, allowed: string[]) {
  if (Object.keys(x).some((key) => !allowed.includes(key))) throw new Error('Unsupported configuration field.');
}
export function parseRule(x: unknown): ResourceRule {
  if (!object(x) || !Object.hasOwn(RESOURCE_LABELS, x.kind) || !object(x.selection)) throw new Error('Invalid resource selection.');
  keys(x, ['kind', 'selection']);
  const s = x.selection;
  if (s.mode === 'all') { keys(s, ['mode']); return { kind: x.kind, selection: { mode: 'all' } }; }
  if (s.mode !== 'selected' || !Array.isArray(s.ids) || s.ids.length > 10000) throw new Error('Expected All or Selected records.');
  keys(s, ['mode', 'ids']);
  const ids = s.ids.map((id: unknown) => textField(id, 'Record ID', 300));
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate record IDs.');
  return { kind: x.kind, selection: { mode: 'selected', ids } };
}
export function parseAccess(x: unknown): AgentAccess {
  if (!object(x) || x.version !== 1 || !Array.isArray(x.allow) || !Array.isArray(x.deny)
    || x.allow.length > 100 || x.deny.length > 100 || typeof x.selection !== 'boolean' || typeof x.proposeEdits !== 'boolean') throw new Error('Invalid agent access policy.');
  keys(x, ['version', 'revision', 'allow', 'deny', 'selection', 'proposeEdits']);
  for (const rules of [x.allow, x.deny]) {
    const parsed = rules.map(parseRule);
    if (new Set(parsed.map((rule) => rule.kind)).size !== parsed.length) throw new Error('Use one assignment per resource category.');
  }
  return { version: 1, revision: textField(x.revision, 'Policy revision', 100), allow: x.allow.map(parseRule), deny: x.deny.map(parseRule), selection: x.selection, proposeEdits: x.proposeEdits };
}
export function permits(policy: AgentAccess, ref: ResourceRef): boolean {
  const matches = (rule: ResourceRule) => rule.kind === ref.kind && (rule.selection.mode === 'all' || rule.selection.ids.includes(ref.id));
  return policy.allow.some(matches) && !policy.deny.some(matches);
}
export function parseRecipe(x: unknown): BinderRecipe {
  if (!object(x) || x.format !== 'muse-project-binder' || x.version !== 1 || !Array.isArray(x.sections) || x.sections.length > 60
    || !['letter', 'a4'].includes(x.pageSize) || typeof x.includeImages !== 'boolean') throw new Error('Expected a version 1 Muse project binder recipe.');
  keys(x, ['format', 'version', 'title', 'introduction', 'sections', 'pageSize', 'includeImages']);
  const sections = x.sections.map((s: unknown): BinderSection => {
    if (!object(s)) throw new Error('Invalid binder section.');
    keys(s, ['id', 'title', 'kind', 'selection']);
    return { ...parseRule({ kind: s.kind, selection: s.selection }), id: textField(s.id, 'Section ID', 100), title: textField(s.title, 'Section title') };
  });
  if (new Set(sections.map((s) => s.id)).size !== sections.length) throw new Error('Duplicate section IDs.');
  return { format: 'muse-project-binder', version: 1, title: textField(x.title, 'Binder title'), introduction: textField(x.introduction, 'Introduction', 20000, true), sections, pageSize: x.pageSize, includeImages: x.includeImages };
}
