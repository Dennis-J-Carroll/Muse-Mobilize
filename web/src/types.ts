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
}

export interface CharacterSense {
  summary: string;
  subtags: CharacterSenseSubtag[];
}

export interface StoryImage {
  id: string;
  src: string;
  caption: string;
  tags: string[];
}

export type CharacterReferenceImage = StoryImage;

export interface WorldMap {
  version: 1;
  image: StoryImage | null;
  opacity: number;
  visible: boolean;
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
  images: StoryImage[];
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
  images: StoryImage[];
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

export type SceneStatus = 'planned' | 'drafting' | 'revised' | 'locked';
export type SceneAssetKind = 'character' | 'theme' | 'location' | 'plot';
export type DialogueVoiceStatus = 'unchecked' | 'in_voice' | 'review';
export type ThemeOccurrence = 'appears' | 'echoes' | 'fades' | 'resolves';

export interface SceneTheme {
  id: string;
  name: string;
  description: string;
  question?: string;
  motif?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SceneAssetRef {
  kind: SceneAssetKind;
  refId: string;
  role: string;
}

export interface SceneBeat {
  id: string;
  title: string;
  summary: string;
  order: number;
}

export interface DialogueLine {
  id: string;
  speakerId: string;
  text: string;
  subtext: string;
  knowledgeState: string;
  voiceStatus: DialogueVoiceStatus;
  voiceNote: string;
  order: number;
}

export interface Scene {
  id: string;
  title: string;
  summary: string;
  section: string;
  purpose: string;
  status: SceneStatus;
  order: number;
  documentId?: string;
  assets: SceneAssetRef[];
  beats: SceneBeat[];
  dialogue: DialogueLine[];
  createdAt: string;
  updatedAt: string;
}

export interface SceneBoard {
  version: 1;
  themes: SceneTheme[];
  scenes: Scene[];
}

export type StoryEntityKind = 'canon' | 'plot' | 'scene' | 'theme' | 'document';

export interface StoryEntityRef {
  kind: StoryEntityKind;
  refId: string;
}

export type StoryReferenceKind = 'image' | 'quote' | 'link';

export interface StoryReference {
  id: string;
  kind: StoryReferenceKind;
  title: string;
  images: StoryImage[];
  quote: string;
  url: string;
  attribution: string;
  sourceUrl: string;
  notes: string;
  entityRefs: StoryEntityRef[];
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceStore {
  version: 1;
  items: StoryReference[];
}

export interface SessionTarget {
  wordTarget: number;
  minutesTarget: number;
  focus: string;
}

export type GoalMilestoneStatus = 'not_started' | 'in_progress' | 'completed';

export interface GoalMilestone {
  id: string;
  title: string;
  description: string;
  status: GoalMilestoneStatus;
  targetWords?: number;
  dueDate?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalStore {
  version: 1;
  sessionTarget: SessionTarget;
  milestones: GoalMilestone[];
}

export interface ProgressPoint {
  ts: string;
  documentId: string;
  words: number;
  delta: number;
  totalWords: number;
}

export interface UnresolvedRevision {
  patchId: string;
  documentId?: string;
  reason?: string;
  actor?: string;
  beforeText?: string;
  afterText?: string;
  proposedAt: string;
}

export interface ProgressProjection {
  currentWords: number;
  wordFlow: ProgressPoint[];
  scenes: {
    total: number;
    completed: number;
    byStatus: Record<SceneStatus, number>;
  };
  unresolvedRevisions: UnresolvedRevision[];
}

export interface AgentDef {
  access?: import('../../shared/project-tools').AgentAccess;
  instructions: { system_prompt: string; goals?: string[] };
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
  contextReceipt?: { policyRevision?: string; records: { kind: string; id: string; sha256: string; trimmed: boolean }[]; sharedExcerpt?: boolean };
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
  sourceCitations?: import('./sources').SourceCitation[];
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

export type PaneType = 'editor' | 'agent' | 'notes' | 'events' | 'review' | 'outline' | 'canon' | 'characters' | 'world' | 'plot' | 'scenes' | 'dialogue' | 'themes' | 'references' | 'goals' | 'progress' | 'sources';
export type Region = 'main' | 'right' | 'bottom';

export interface Pane {
  id: string;
  type: PaneType;
  title: string;
  region: Region;
  binding?: { type: 'document' | 'agent'; id: string };
  sizeMode: 'normal' | 'minimized' | 'maximized';
  size?: { width: number; height: number };
  floating?: { x: number; y: number; width: number; height: number; layer: number };
}

export interface FloatingPanel {
  id: string;
  paneType: PaneType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  docked: boolean;
  slot: number | null;
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
  localModels?: LocalModelOption[];
  setup?: {
    keyField: string;
    modelField: string;
    keyPlaceholder: string;
    keyUrl: string;
    envKeys: string[];
  };
}

export interface LocalModelOption {
  id: string;
  model: string;
  label: string;
  size: string;
  ram: string;
  role: string;
  note: string;
  recommended?: boolean;
  heavyweight?: boolean;
  installed: boolean;
  active: boolean;
}

export interface LocalModelProgress {
  status: string;
  percent?: number;
}

export interface LocalModelInstallResult {
  id: string;
  model: string;
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
