import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import type { GoalMilestone, GoalMilestoneStatus, GoalStore, SessionTarget } from './types.js';

const MILESTONE_STATUSES: GoalMilestoneStatus[] = ['not_started', 'in_progress', 'completed'];
const goalPath = (projectDir: string) => path.join(projectDir, 'goals', 'goals.json');
const emptyGoals = (): GoalStore => ({
  version: 1,
  sessionTarget: { wordTarget: 0, minutesTarget: 0, focus: '' },
  milestones: [],
});
const text = (value: unknown) => String(value ?? '').trim();
const wholeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
};

export async function readGoals(projectDir: string): Promise<GoalStore> {
  const file = goalPath(projectDir);
  if (!(await exists(file))) return emptyGoals();
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<GoalStore>;
  return {
    version: 1,
    sessionTarget: parsed.sessionTarget ?? emptyGoals().sessionTarget,
    milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [],
  };
}

async function persistGoals(projectDir: string, goals: GoalStore): Promise<void> {
  const file = goalPath(projectDir);
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(goals, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function cleanSessionTarget(value: Partial<SessionTarget>, current: SessionTarget): SessionTarget {
  return {
    wordTarget: value.wordTarget === undefined ? current.wordTarget : wholeNumber(value.wordTarget),
    minutesTarget: value.minutesTarget === undefined ? current.minutesTarget : wholeNumber(value.minutesTarget),
    focus: value.focus === undefined ? current.focus : text(value.focus),
  };
}

type MilestoneInput = Partial<GoalMilestone> & { title: string };

function cleanMilestones(value: MilestoneInput[], current: GoalMilestone[]): GoalMilestone[] {
  const existing = new Map(current.map((milestone) => [milestone.id, milestone]));
  return value.map((item, index) => {
    const title = text(item.title);
    if (!title) throw new Error('milestone title is required');
    const status = item.status ?? 'not_started';
    if (!MILESTONE_STATUSES.includes(status)) {
      throw new Error(`milestone status must be one of: ${MILESTONE_STATUSES.join(' | ')}`);
    }
    const id = text(item.id) || randomUUID();
    const previous = existing.get(id);
    const now = new Date().toISOString();
    const targetWords = item.targetWords === undefined ? undefined : wholeNumber(item.targetWords);
    const dueDate = text(item.dueDate);
    return {
      id,
      title,
      description: text(item.description),
      status,
      ...(targetWords !== undefined ? { targetWords } : {}),
      ...(dueDate ? { dueDate } : {}),
      order: wholeNumber(item.order, index),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  }).sort((a, b) => a.order - b.order).map((milestone, order) => ({ ...milestone, order }));
}

export async function writeGoals(
  projectDir: string,
  patch: { sessionTarget?: Partial<SessionTarget>; milestones?: MilestoneInput[] },
): Promise<GoalStore> {
  const current = await readGoals(projectDir);
  const goals: GoalStore = {
    version: 1,
    sessionTarget: patch.sessionTarget === undefined
      ? current.sessionTarget
      : cleanSessionTarget(patch.sessionTarget, current.sessionTarget),
    milestones: patch.milestones === undefined
      ? current.milestones
      : cleanMilestones(patch.milestones, current.milestones),
  };
  await persistGoals(projectDir, goals);
  return goals;
}
