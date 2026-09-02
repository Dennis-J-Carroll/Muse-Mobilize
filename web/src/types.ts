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

export type SenseIndicator = 'strength' | 'limitation' | 'sensitivity' | 'preference' | 'neutral';

export interface CharacterSenseSubtag {
  id: string;
  label: string;
  value: string;
  indicator: SenseIndicator;
  status: CanonStatus;
  evidence: string[];
}

export interface CharacterSense {
  summary: string;
  subtags: CharacterSenseSubtag[];
}

export interface CharacterReferenceImage {
  id: string;
  src: string;
  caption: string;
  tags: string[];
}

export interface CharacterProfile {
  categories: string[];
  attributes: {
    role: string;
    pronouns: string;
    age: string;
    goals: string[];
    fears: string[];
  };
  physical: {
    description: string;
    distinguishingFeatures: string[];
    clothing: string[];
  };
  senses: {
    vision: CharacterSense;
    audio: CharacterSense;
    proximity: CharacterSense;
  };
  references: { images: CharacterReferenceImage[] };
}

export interface WorldProfile {
  categories: string[];
  attributes: {
    era: string;
    atmosphere: string;
    significance: string;
  };
  canvas: {
    x: number;
    y: number;
  };
  referenceDocumentId?: string;
}

export interface CanonEntity {
  id: string;
  type: CanonEntityType;
  name: string;
  aliases: string[];
  summary?: string;
  character?: CharacterProfile;
  world?: WorldProfile;
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

export type PlotNodeKind = 'beat' | 'turn' | 'reveal' | 'climax' | 'resolution';
export type PlotEdgeRelation = 'sequence' | 'branch' | 'merge' | 'cause';
export type PlotWorldRole = 'setting' | 'constraint' | 'catalyst' | 'affected';

export interface PlotWorldRef {
  entityId: string;
  role: PlotWorldRole;
}

export interface PlotNode {
  id: string;
  title: string;
  summary: string;
  kind: PlotNodeKind;
  section: string;
  position: { x: number; y: number };
  details: { goal: string; conflict: string; stakes: string; outcome: string; notes: string };
  documentId?: string;
  worldRefs: PlotWorldRef[];
  createdAt: string;
  updatedAt: string;
}

export interface PlotEdge {
  id: string;
  from: string;
  to: string;
  relation: PlotEdgeRelation;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlotGraph {
  version: 1;
  nodes: PlotNode[];
  edges: PlotEdge[];
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

export type PaneType = 'editor' | 'agent' | 'notes' | 'events' | 'review' | 'outline' | 'canon' | 'characters' | 'world' | 'plot';
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
  featured: boolean;
  kind: 'hosted' | 'local' | 'offline';
  note: string;
  credentialSource: 'settings' | 'environment' | null;
  setup?: {
    keyField: string;
    modelField: string;
    keyPlaceholder: string;
    keyUrl: string;
    envKeys: string[];
  };
}

export type ProviderCheckResult =
  | { ok: true; provider: string; model: string; ms: number }
  | { ok: false; provider: string; error: string };

export interface SettingsView {
  workspaceRoot: string;
  anthropicModel?: string;
  anthropicKeySet: boolean;
  openaiModel?: string;
  openaiKeySet: boolean;
  googleModel?: string;
  googleKeySet: boolean;
  xaiModel?: string;
  xaiKeySet: boolean;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  defaultProvider?: string;
}
