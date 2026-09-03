// Core domain objects (handoff §33). Kept deliberately small for MVP;
// every field here is something the golden path (§30) actually reads.

export type DocumentKind = 'manuscript' | 'notes' | 'outline' | 'canon';

export interface DocumentMeta {
  id: string;
  title: string;
  kind: DocumentKind;
  path: string; // relative to project root
  order: number;
}

export interface ProjectManifest {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  documents: DocumentMeta[];
}

export type AgentState = 'live' | 'idle' | 'frozen';
export type Activation = 'manual' | 'on_request' | 'watcher';
export type Authority = 'read' | 'suggest' | 'patch' | 'write' | 'direct';

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

export interface StoryImage {
  id: string;
  src: string;
  caption: string;
  tags: string[];
}

export type CharacterReferenceImage = StoryImage;

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
  details: {
    goal: string;
    conflict: string;
    stakes: string;
    outcome: string;
    notes: string;
  };
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

export interface SceneTheme {
  id: string;
  name: string;
  description: string;
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

// Context scope tokens the ContextEngine understands (§11).
export type ScopeToken =
  | 'selection'
  | 'current_scene'
  | 'current_document'
  | 'manuscript'
  | 'notes'
  | 'canon'
  | 'outline';

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  blurb?: string;
  accent?: string;
  instructions: {
    system_prompt: string;
    goals?: string[];
  };
  model: { provider: string; model?: string };
  state: { mode: AgentState };
  activation: { type: Activation };
  authority: Record<string, Authority>;
  context: { scope: ScopeToken[]; forbidden?: string[] };
  communication: { may_contact?: string[]; may_be_contacted_by?: string[] };
  budget: { max_steps: number; max_tokens: number };
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
  anchored: boolean; // false => we could not locate beforeText in the document
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

export interface ModelRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  model?: string;
}

export interface ModelResult {
  text: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelProvider {
  id: string;
  label: string;
  available(): Promise<boolean>;
  models(): Promise<string[]>;
  complete(req: ModelRequest): Promise<ModelResult>;
}

export interface Settings {
  workspaceRoot: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  googleApiKey?: string;
  googleModel?: string;
  xaiApiKey?: string;
  xaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  defaultProvider?: string;
}
