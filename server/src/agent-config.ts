import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import yaml from 'js-yaml';
import { parseAccess, object, textField } from '../../shared/project-tools.js';
import { projectDir, readAgents, readAgent } from './projects.js';
import { safeJoin, ensureDir } from './paths.js';
import type { AgentDef } from './types.js';

export const agentFingerprint = (agent: AgentDef) => createHash('sha256').update(JSON.stringify(agent)).digest('hex');
export async function assertAgentUnchanged(projectId: string, agent: AgentDef): Promise<void> {
  if (agentFingerprint(await readAgent(projectId, agent.id)) !== agentFingerprint(agent)) throw new Error('Agent configuration changed during this run. Ask again with the new assignments.');
}

export function parseManagedAgent(value: unknown): AgentDef {
  if (!object(value) || !object(value.instructions) || !object(value.model) || !object(value.budget)) throw new Error('Invalid agent definition.');
  const id = textField(value.id, 'Agent ID', 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error('Invalid agent ID.');
  const provider = textField(value.model.provider, 'Provider', 60);
  if (!['default', 'mock', 'openai', 'anthropic', 'google', 'xai', 'ollama'].includes(provider)) throw new Error('Unsupported provider.');
  const maxTokens = value.budget.max_tokens;
  if (!Number.isInteger(maxTokens) || maxTokens < 100 || maxTokens > 16000) throw new Error('Token budget must be 100–16000.');
  const access = parseAccess(value.access);
  const goals = value.instructions.goals ?? [];
  if (!Array.isArray(goals) || goals.length > 100) throw new Error('Up to 100 instruction goals are allowed.');
  return {
    id, name: textField(value.name, 'Agent name', 100), role: textField(value.role, 'Role', 200),
    blurb: textField(value.blurb ?? '', 'Description', 500, true),
    instructions: { system_prompt: textField(value.instructions.system_prompt, 'Instructions', 20000), goals: goals.map((goal) => textField(goal, 'Goal', 1000, true)).filter((goal) => goal.trim()) },
    model: { provider, ...(value.model.model ? { model: textField(value.model.model, 'Model', 200) } : {}) },
    state: { mode: ['live', 'idle', 'frozen'].includes(value.state?.mode) ? value.state.mode : 'idle' },
    activation: { type: 'manual' }, authority: { manuscript: access.proposeEdits ? 'suggest' : 'read' },
    context: { scope: [] }, access,
    communication: { may_contact: [], may_be_contacted_by: [] },
    budget: { max_steps: 1, max_tokens: maxTokens },
  };
}

const queues = new Map<string, Promise<unknown>>();
export async function withAgentLock<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
  const prior = queues.get(projectId) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(operation);
  queues.set(projectId, next);
  try { return await next; } finally { if (queues.get(projectId) === next) queues.delete(projectId); }
}

export async function atomicJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function saveAgent(projectId: string, input: unknown, expectedRevision: unknown): Promise<AgentDef> {
  const parsed = parseManagedAgent(input);
  return withAgentLock(projectId, async () => {
    const dir = safeJoin(await projectDir(projectId), 'agents');
    await ensureDir(dir);
    const existing = (await readAgents(projectId)).find((a) => a.id === parsed.id);
    if (existing && (existing.access?.revision ?? 'legacy') !== expectedRevision) throw new Error('Agent changed since it was opened. Reload Agent Studio before saving.');
    if (!existing && expectedRevision !== null) throw new Error('Agent no longer exists. Save a new copy.');
    let file = safeJoin(dir, `${parsed.id}.yml`);
    if (existing) {
      for (const name of (await fs.readdir(dir)).filter((f) => /\.ya?ml$/.test(f))) {
        const candidate = safeJoin(dir, name);
        if ((yaml.load(await fs.readFile(candidate, 'utf8')) as any)?.id === parsed.id) { file = candidate; break; }
      }
    }
    parsed.access!.revision = randomUUID();
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, yaml.dump(parsed, { lineWidth: 100 }), { flag: 'wx' }); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
    return parsed;
  });
}

export interface AgentArrangement { id: string; name: string; agents: AgentDef[] }
export async function readArrangements(projectId: string): Promise<AgentArrangement[]> {
  let raw: string;
  try { raw = await fs.readFile(safeJoin(await projectDir(projectId), 'studio/arrangements.json'), 'utf8'); }
  catch (e: any) { if (e.code === 'ENOENT') return []; throw e; }
  const value = JSON.parse(raw);
  if (value.version !== 1 || !Array.isArray(value.arrangements)) throw new Error('Invalid saved arrangements.');
  return value.arrangements.map((a: any) => ({ id: textField(a.id, 'Arrangement ID'), name: textField(a.name, 'Arrangement name'), agents: a.agents.map(parseManagedAgent) }));
}
export async function saveArrangement(projectId: string, name: unknown, ids: unknown): Promise<AgentArrangement> {
  const title = textField(name, 'Arrangement name', 100);
  if (!Array.isArray(ids) || !ids.length || ids.length > 30 || new Set(ids).size !== ids.length) throw new Error('Select 1–30 distinct managed agents.');
  return withAgentLock(projectId, async () => {
    const roster = await readAgents(projectId);
    const agents = ids.map((id) => { const a = roster.find((v) => v.id === id); if (!a?.access) throw new Error('Save explicit assignments for every selected agent first.'); return parseManagedAgent(a); });
    const arrangements = await readArrangements(projectId);
    if (arrangements.length >= 100) throw new Error('Up to 100 arrangements can be saved.');
    const result = { id: randomUUID(), name: title, agents };
    await atomicJson(safeJoin(await projectDir(projectId), 'studio/arrangements.json'), { version: 1, arrangements: [...arrangements, result] });
    return result;
  });
}
export async function loadArrangement(projectId: string, id: string): Promise<AgentDef[]> {
  return withAgentLock(projectId, async () => {
    const arrangement = (await readArrangements(projectId)).find((a) => a.id === id);
    if (!arrangement) throw new Error('Arrangement not found.');
    const dir = safeJoin(await projectDir(projectId), 'agents');
    await ensureDir(dir);
    const written: string[] = [];
    try {
      const copies: AgentDef[] = [];
      for (const a of arrangement.agents) {
        const copy = parseManagedAgent({ ...a, id: `agent-${randomUUID()}` });
        copy.access!.revision = randomUUID();
        const file = safeJoin(dir, `${copy.id}.yml`);
        await fs.writeFile(file, yaml.dump(copy), { flag: 'wx' }); written.push(file); copies.push(copy);
      }
      return copies;
    } catch (e) { await Promise.all(written.map((file) => fs.rm(file, { force: true }))); throw e; }
  });
}
