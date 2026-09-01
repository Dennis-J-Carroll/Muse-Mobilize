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
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  defaultProvider?: string;
}
