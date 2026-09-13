import { randomUUID } from 'node:crypto';
import { readAgent, readAgents, readDocument, projectDir } from './projects.js';
import { buildContext, renderContext } from './context.js';
import { resolveProvider } from './providers/index.js';
import { parseAgentOutput, anchorPatch } from './protocol.js';
import { emit } from './events.js';
import type { AgentDef, AgentRun, Consultation, Patch, Selection } from './types.js';

/**
 * Agent runtime (§4, §14). Agents talk to each other through explicit,
 * logged messages — never shared memory — so every recommendation carries
 * visible provenance (§34.11).
 */

const PRIMARY_PROTOCOL = `
--- HOW TO REPLY ---
Write for a working novelist. Be specific about this passage; never give generic writing advice.

You may embed these blocks anywhere in your reply:

1. To ask another agent a question you cannot answer yourself:
<consult agent="AGENT_ID">your question</consult>

2. To propose a concrete edit to the manuscript:
<patch>
<before>text copied EXACTLY from the manuscript, character for character</before>
<after>your replacement</after>
<reason>one sentence, in craft terms</reason>
</patch>

Rules:
- <before> must be an exact substring of the text you were given, or the patch is discarded.
- Keep patches small: one to three sentences. Propose several small patches rather than one large one.
- Never rewrite the whole passage. The draft belongs to the writer.
- If you have nothing worth changing, propose no patch and say so.
`;

const CONSULT_PROTOCOL = `
--- HOW TO REPLY ---
You are being consulted by another agent. Answer the question directly and briefly.
Cite the text you were given. If the text does not settle the question, say that plainly
instead of inventing an answer. Do not propose patches and do not consult anyone else.
`;

function systemFor(agent: AgentDef, protocol: string): string {
  const goals = agent.instructions.goals?.length
    ? `\nYour goals:\n${agent.instructions.goals.map((g) => `- ${g}`).join('\n')}\n`
    : '';
  return `<agent-name>${agent.name}</agent-name>\n<agent-role>${agent.role}</agent-role>\n\n${agent.instructions.system_prompt.trim()}\n${goals}${protocol}`;
}

/** Permissions are checked in both directions before any agent-to-agent contact. */
function mayContact(from: AgentDef, to: AgentDef): boolean {
  const out = from.communication?.may_contact ?? [];
  const inbound = to.communication?.may_be_contacted_by ?? [];
  if (!out.includes(to.id)) return false;
  if (inbound.length && !inbound.includes(from.id)) return false;
  return true;
}

async function consultOne(
  projectId: string,
  from: AgentDef,
  targetId: string,
  question: string,
  opts: { documentId?: string; selection?: Selection | null },
): Promise<Consultation> {
  const started = Date.now();
  const base: Consultation = { id: randomUUID(), from: from.id, to: targetId, question, answer: '', ms: 0 };
  const dir = await projectDir(projectId);

  let target: AgentDef;
  try {
    target = await readAgent(projectId, targetId);
  } catch {
    return { ...base, ms: Date.now() - started, error: `No agent named "${targetId}" in this project.` };
  }
  if (!mayContact(from, target)) {
    await emit(dir, 'agent.contact.refused', { from: from.id, to: target.id });
    return { ...base, to: target.id, ms: Date.now() - started, error: `${from.name} is not permitted to contact ${target.name}.` };
  }
  if (target.state?.mode === 'frozen') {
    // Frozen agents still answer — from locked context, which is the point (§12).
  }

  await emit(dir, 'agent.contact.requested', { from: from.id, to: target.id, question }, from.id);

  try {
    const bundle = await buildContext(projectId, target, opts);
    const provider = await resolveProvider(target.model?.provider ?? 'default');
    const result = await provider.complete({
      system: systemFor(target, CONSULT_PROTOCOL),
      messages: [
        {
          role: 'user',
          content: `${renderContext(bundle)}\n\n<consultation-request from="${from.name}">\n${question}\n</consultation-request>`,
        },
      ],
      maxTokens: target.budget?.max_tokens ?? 1200,
      model: target.model?.model,
    });
    // A consulted agent's own blocks are stripped: only its prose comes back.
    const parsed = parseAgentOutput(result.text);
    await emit(dir, 'agent.contact.completed', { from: from.id, to: target.id }, target.id);
    return { ...base, to: target.id, answer: parsed.prose || result.text, ms: Date.now() - started };
  } catch (err: any) {
    await emit(dir, 'agent.request.failed', { agentId: target.id, error: String(err?.message ?? err) }, target.id);
    return { ...base, to: target.id, ms: Date.now() - started, error: String(err?.message ?? err) };
  }
}

export async function runAgent(
  projectId: string,
  input: { agentId: string; documentId?: string; selection?: Selection | null; question: string; attachments?: string[] },
): Promise<AgentRun> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const dir = await projectDir(projectId);
  const agent = await readAgent(projectId, input.agentId);
  const provider = await resolveProvider(agent.model?.provider ?? 'default');

  await emit(dir, 'agent.request.started', { agentId: agent.id, question: input.question }, agent.id);

  const bundle = await buildContext(projectId, agent, {
    documentId: input.documentId,
    selection: input.selection,
    attachments: input.attachments,
    question: input.question,
  });

  const roster = (await readAgents(projectId))
    .filter((a) => a.id !== agent.id && mayContact(agent, a))
    .map((a) => `- ${a.id} (${a.name}): ${a.blurb ?? a.role}`)
    .join('\n');

  const rosterBlock = roster ? `\n<agents-you-may-consult>\n${roster}\n</agents-you-may-consult>\n` : '';
  const firstUser = `${renderContext(bundle)}${rosterBlock}\n<question>\n${input.question}\n</question>`;

  const run: AgentRun = {
    runId: randomUUID(),
    agentId: agent.id,
    agentName: agent.name,
    question: input.question,
    text: '',
    consultations: [],
    patches: [],
    provider: provider.id,
    model: '',
    startedAt,
    ms: 0,
    contextSummary: bundle.summary,
    sourceCitations: bundle.sourceCitations,
  };

  try {
    const messages: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: firstUser }];
    let result = await provider.complete({
      system: systemFor(agent, PRIMARY_PROTOCOL),
      messages,
      maxTokens: agent.budget?.max_tokens ?? 2000,
      model: agent.model?.model,
    });
    run.model = result.model;
    let parsed = parseAgentOutput(result.text);

    // Bounded consultation rounds. The budget is enforced HERE, not by asking
    // the model nicely: a small local model will happily keep consulting
    // forever, and `asked` stops it repeating a question it already had
    // answered (§15 max_rounds, §14 budgeting).
    const maxSteps = Math.max(1, agent.budget?.max_steps ?? 1);
    const asked = new Set<string>();
    let step = 1;
    while (parsed.consults.length && step < maxSteps) {
      const fresh = parsed.consults.filter((c) => !asked.has(`${c.agent}::${c.question}`)).slice(0, 3);
      if (!fresh.length) break;
      const answers: Consultation[] = [];
      for (const c of fresh) {
        asked.add(`${c.agent}::${c.question}`);
        const consultation = await consultOne(projectId, agent, c.agent, c.question, {
          documentId: input.documentId,
          selection: input.selection,
        });
        answers.push(consultation);
        run.consultations.push(consultation);
      }

      messages.push({ role: 'assistant', content: result.text });
      messages.push({
        role: 'user',
        content:
          answers
            .map(
              (a) =>
                `<consultation-response from="${a.to}">\n${a.error ? `[unavailable: ${a.error}]` : a.answer}\n</consultation-response>`,
            )
            .join('\n\n') +
          `\n\nNow give your final answer to the writer. Do not consult anyone else.`,
      });

      result = await provider.complete({
        system: systemFor(agent, PRIMARY_PROTOCOL),
        messages,
        maxTokens: agent.budget?.max_tokens ?? 2000,
        model: agent.model?.model,
      });
      parsed = parseAgentOutput(result.text);
      step++;
    }

    // Only the final answer's patches are kept: intermediate rounds restate
    // them, and the writer should review one set, not three.
    run.text = parsed.prose;
    run.patches = dedupe(toPatches(parsed.patches, input));

    // Anchor every patch against the live document, right now.
    if (input.documentId) {
      const { content } = await readDocument(projectId, input.documentId);
      for (const p of run.patches) {
        const a = anchorPatch(content, p.beforeText, input.selection ?? undefined);
        p.start = a.start;
        p.end = a.end;
        p.anchored = a.anchored;
      }
    }

    if (parsed.warnings.length) {
      await emit(dir, 'agent.output.warning', { agentId: agent.id, warnings: parsed.warnings }, agent.id);
    }
    for (const p of run.patches) {
      await emit(dir, 'patch.proposed', {
        patchId: p.id,
        documentId: p.documentId,
        anchored: p.anchored,
        reason: p.reason,
        beforeText: p.beforeText,
        afterText: p.afterText,
      }, agent.id);
    }
    await emit(dir, 'agent.request.completed', { agentId: agent.id, consultations: run.consultations.length, patches: run.patches.length }, agent.id);
  } catch (err: any) {
    run.error = String(err?.message ?? err);
    await emit(dir, 'agent.request.failed', { agentId: agent.id, error: run.error }, agent.id);
  }

  run.ms = Date.now() - t0;
  return run;
}

function dedupe(patches: Patch[]): Patch[] {
  const seen = new Set<string>();
  return patches.filter((p) => {
    const key = `${p.beforeText}=>${p.afterText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toPatches(raw: { beforeText: string; afterText: string; reason: string }[], input: { documentId?: string }): Patch[] {
  return raw.map((p) => ({
    id: randomUUID(),
    documentId: input.documentId ?? '',
    start: 0,
    end: 0,
    beforeText: p.beforeText,
    afterText: p.afterText,
    reason: p.reason,
    status: 'proposed' as const,
    anchored: false,
  }));
}
