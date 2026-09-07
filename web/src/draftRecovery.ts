export interface DraftScope {
  projectId: string;
  tool: string;
  entityId: string;
}

export interface DraftEntry<T = unknown> {
  version: 1;
  scope: DraftScope;
  revision: string;
  updatedAt: string;
  base: T;
  value: T;
  savedEntityId?: string;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const draftKey = (scope: DraftScope) => `muse:draft:v1:${JSON.stringify([scope.projectId, scope.tool, scope.entityId])}`;
export const documentDraftScope = (projectId: string, docId: string): DraftScope => ({ projectId, tool: 'manuscript', entityId: docId });
export const sameDraft = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const revision = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const hasInlineImage = (value: unknown): boolean => {
  if (typeof value === 'string') return /^data:image\//i.test(value);
  if (Array.isArray(value)) return value.some(hasInlineImage);
  return Boolean(value && typeof value === 'object' && Object.values(value).some(hasInlineImage));
};

/** One atomic storage item per draft: a quota failure leaves the previous item intact. */
export class DraftJournal {
  private issues = new Map<string, string>();
  private listeners = new Set<() => void>();
  private issueSnapshot: readonly string[] = [];
  constructor(private storage: () => DraftStorage = () => globalThis.localStorage) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getIssues = () => this.issueSnapshot;
  hasScopeIssue = (scope: DraftScope) => this.issues.has(draftKey(scope));
  hasProjectIssues = (projectId: string) => [...this.issues.keys()].some((key) => JSON.parse(key.slice('muse:draft:v1:'.length))[0] === projectId);

  private report(scope: DraftScope, message?: string) {
    const key = draftKey(scope);
    if (message) this.issues.set(key, `${scope.tool} / ${scope.entityId}: ${message}`);
    else this.issues.delete(key);
    const next = [...this.issues.values()];
    if (sameDraft(next, this.issueSnapshot)) return;
    this.issueSnapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  read<T>(scope: DraftScope): DraftEntry<T> | null {
    try {
      const raw = this.storage().getItem(draftKey(scope));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (entry?.version !== 1 || !sameDraft(entry.scope, scope) || typeof entry.revision !== 'string'
        || typeof entry.updatedAt !== 'string' || !('base' in entry) || !('value' in entry)) {
        this.report(scope, 'This recovery copy could not be read. Its stored data has been preserved.');
        return null;
      }
      return entry as DraftEntry<T>;
    } catch {
      this.report(scope, 'Browser recovery storage could not be read. Keep this page open until your work saves.');
      return null;
    }
  }

  write<T>(scope: DraftScope, base: T, value: T, savedEntityId?: string): DraftEntry<T> {
    const entry: DraftEntry<T> = { version: 1, scope, revision: revision(), updatedAt: new Date().toISOString(), base, value, ...(savedEntityId ? { savedEntityId } : {}) };
    try {
      if (hasInlineImage(value)) throw new Error('Inline image');
      this.storage().setItem(draftKey(scope), JSON.stringify(entry));
      this.report(scope);
    } catch {
      this.report(scope, 'The latest edits could not be stored for recovery. Browser storage may be full or unavailable. The previous recovery copy is preserved; keep this page open and save or copy your work.');
    }
    return entry;
  }

  clear(scope: DraftScope, expectedRevision: string): boolean {
    try {
      const current = this.read(scope);
      if (current && current.revision !== expectedRevision) return false;
      this.storage().removeItem(draftKey(scope));
      this.report(scope);
      return true;
    } catch {
      this.report(scope, 'The recovery copy could not be cleared. It may appear again when you reopen this form or page.');
      return false;
    }
  }

  rebase<T>(scope: DraftScope, expectedRevision: string, base: T, savedEntityId?: string) {
    const current = this.read<T>(scope);
    if (!current || current.revision !== expectedRevision) return;
    try {
      this.storage().setItem(draftKey(scope), JSON.stringify({ ...current, base, ...(savedEntityId ? { savedEntityId } : {}) }));
    } catch {
      this.report(scope, 'The latest recovery baseline could not be stored. Keep this page open until your work saves.');
    }
  }
}

export const draftJournal = new DraftJournal();

function compatible(value: unknown, template: unknown): boolean {
  if (template === null) return value === null;
  if (Array.isArray(template)) return Array.isArray(value) && (!template.length || value.every((item) => compatible(item, template[0])));
  if (typeof template !== 'object') return typeof value === typeof template;
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(template).every(([key, expected]) => compatible((value as Record<string, unknown>)[key], expected)));
}

export interface DraftCheckpoint<T> {
  value: T;
  revision: string;
  durableRevision?: string;
}

/** The non-React owner of a form draft. Updates journal before returning to the input handler. */
export class RecoverableDraft<T> {
  value: T;
  restored: boolean;
  conflict: boolean;
  recordId?: string;
  private base: T;
  private revision: string = revision();
  private durableRevision?: string;
  get dirty() { return !sameDraft(this.value, this.base); }
  constructor(private journal: DraftJournal, readonly scope: DraftScope, baseline: T) {
    const entry = journal.read<T>(scope);
    const recovered = entry && compatible(entry.value, baseline) && compatible(entry.base, baseline) ? entry : null;
    this.base = baseline;
    this.value = recovered?.value ?? baseline;
    this.restored = Boolean(recovered && !sameDraft(recovered.value, baseline));
    this.conflict = Boolean(this.restored && !sameDraft(recovered?.base, baseline));
    if (recovered) {
      this.revision = recovered.revision;
      this.durableRevision = recovered.revision;
      this.recordId = typeof recovered.savedEntityId === 'string' ? recovered.savedEntityId : undefined;
    }
  }

  update(value: T | ((current: T) => T)): T {
    this.value = typeof value === 'function' ? (value as (current: T) => T)(this.value) : value;
    const entry = this.journal.write(this.scope, this.base, this.value, this.recordId);
    this.revision = entry.revision;
    this.durableRevision = this.journal.read(this.scope)?.revision;
    return this.value;
  }

  checkpoint(): DraftCheckpoint<T> {
    return { value: this.value, revision: this.revision, durableRevision: this.durableRevision };
  }

  rememberRecord(id: string) {
    this.recordId = id;
    this.journal.rebase(this.scope, this.revision, this.base, id);
  }

  completeSave(checkpoint: DraftCheckpoint<T>, canonicalValue: T = checkpoint.value): boolean {
    this.base = canonicalValue;
    this.restored = false;
    this.conflict = false;
    if (this.revision !== checkpoint.revision) {
      this.journal.rebase(this.scope, this.revision, canonicalValue);
      return false;
    }
    const cleared = this.journal.clear(this.scope, checkpoint.durableRevision ?? checkpoint.revision);
    this.value = canonicalValue;
    return cleared;
  }

  discard() {
    // A stale window must not discard another window's newer recovery copy.
    if (this.durableRevision) this.journal.clear(this.scope, this.durableRevision);
    this.value = this.base;
    this.restored = false;
    this.conflict = false;
  }
}
