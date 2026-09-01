export type AgentState = 'live' | 'idle' | 'frozen';

export interface DocumentMeta {
  id: string;
  title: string;
  kind: 'manuscript' | 'notes' | 'outline' | 'canon';
  path: string;
  order: number;
}

export interface ProjectManifest {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  documents: DocumentMeta[];
}

export type CanonStatus = 'idea' | 'proposed' | 'established' | 'canonical' | 'retconned' | 'deprecated';
export type CanonEntityType = 'character' | 'location' | 'organization' | 'object' | 'event' | 'rule' | 'lore';

export interface CanonEvidence {
  documentId: string;
  quote?: string;
  start?: number;
  end?: number;
}

export interface CanonEntity {
  id: string;
  type: CanonEntityType;
  name: string;
  aliases: string[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanonFact {
  id: string;
  subject: string;
  subjectId?: string;
  predicate: string;
  value: string | number | boolean;
  status: CanonStatus;
  evidence: CanonEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface CanonStore {
  version: 1;
  entities: CanonEntity[];
  facts: CanonFact[];
}

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  blurb?: string;
  accent?: string;
  state: { mode: AgentState };
  activation: { type: string };
  authority: Record<string, string>;
  context: { scope: string[]; forbidden?: string[] };
  communication: { may_contact?: string[]; may_be_contacted_by?: string[] };
  budget: { max_steps: number; max_tokens: number };
  model: { provider: string; model?: string };
}

export interface Patch {
  id: string;
  documentId: string;
  start: number;
  end: number;
  beforeText: string;
  afterText: string;
  reason: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'stale';
  anchored: boolean;
}

export interface Consultation {
  id: string;
  from: string;
  to: string;
  question: string;
  answer: string;
  ms: number;
  error?: string;
}

export interface AgentRun {
  runId: string;
  agentId: string;
  agentName: string;
  question: string;
  text: string;
  consultations: Consultation[];
  patches: Patch[];
  provider: string;
  model: string;
  startedAt: string;
  ms: number;
  contextSummary: string[];
  error?: string;
}

export interface MuseEvent {
  id: string;
  ts: string;
  type: string;
  actor?: string;
  payload?: Record<string, unknown>;
}

export interface Selection {
  documentId: string;
  start: number;
  end: number;
  text: string;
}

export type PaneType = 'editor' | 'agent' | 'notes' | 'events' | 'review' | 'outline' | 'canon';
export type Region = 'main' | 'right' | 'bottom';

export interface Pane {
  id: string;
  type: PaneType;
  title: string;
  region: Region;
  binding?: { type: 'document' | 'agent'; id: string };
  sizeMode: 'normal' | 'minimized' | 'maximized';
}

export interface WorkspaceDef {
  id: string;
  name: string;
  panes: {
    id: string;
    type: PaneType;
    region: Region;
    binding?: { type: 'document' | 'agent'; id: string };
  }[];
}

export interface ProviderStatus {
  id: string;
  label: string;
  available: boolean;
  models: string[];
}

export interface SettingsView {
  workspaceRoot: string;
  anthropicModel?: string;
  anthropicKeySet: boolean;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  defaultProvider?: string;
}
