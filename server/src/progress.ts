import fs from 'node:fs/promises';
import path from 'node:path';
import { readEvents } from './events.js';
import { safeJoin } from './paths.js';
import { readScenes } from './scenes.js';
import type {
  DocumentMeta,
  MuseEvent,
  ProgressProjection,
  ProgressWordPoint,
  SceneStatus,
  UnresolvedRevision,
} from './types.js';

const wordCount = (content: string) => content.split(/\s+/).filter(Boolean).length;
const text = (value: unknown) => String(value ?? '').trim();
const words = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

async function readManifestDocuments(projectDir: string): Promise<DocumentMeta[]> {
  const manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf8')) as { documents?: DocumentMeta[] };
  return Array.isArray(manifest.documents) ? manifest.documents : [];
}

async function currentManuscriptWords(projectDir: string, documents: DocumentMeta[]): Promise<number> {
  const counts = await Promise.all(documents.filter((document) => document.kind === 'manuscript').map(async (document) => {
    try {
      return wordCount(await fs.readFile(safeJoin(projectDir, document.path), 'utf8'));
    } catch (error: any) {
      if (error?.code === 'ENOENT') return 0;
      throw error;
    }
  }));
  return counts.reduce((total, count) => total + count, 0);
}

function projectWordFlow(events: MuseEvent[], manuscriptIds: Set<string>): ProgressWordPoint[] {
  const documentWords = new Map<string, number>();
  let totalWords = 0;
  const points: ProgressWordPoint[] = [];
  for (const event of events) {
    if (event.type !== 'document.saved') continue;
    const documentId = text(event.payload?.documentId);
    if (!documentId || !manuscriptIds.has(documentId)) continue;
    const nextWords = words(event.payload?.words);
    const previousWords = documentWords.get(documentId) ?? 0;
    const delta = nextWords - previousWords;
    totalWords += delta;
    documentWords.set(documentId, nextWords);
    points.push({ ts: event.ts, documentId, words: nextWords, delta, totalWords });
  }
  return points;
}

function projectUnresolvedRevisions(events: MuseEvent[]): UnresolvedRevision[] {
  const revisions = new Map<string, UnresolvedRevision>();
  for (const event of events) {
    const patchId = text(event.payload?.patchId);
    if (!patchId) continue;
    if (event.type === 'patch.proposed') {
      const documentId = text(event.payload?.documentId);
      const reason = text(event.payload?.reason);
      const beforeText = text(event.payload?.beforeText);
      const afterText = text(event.payload?.afterText);
      revisions.set(patchId, {
        patchId,
        ...(documentId ? { documentId } : {}),
        ...(reason ? { reason } : {}),
        ...(event.actor ? { actor: event.actor } : {}),
        ...(beforeText ? { beforeText, afterText } : {}),
        proposedAt: event.ts,
      });
    } else if (event.type === 'patch.accepted' || event.type === 'patch.rejected') {
      revisions.delete(patchId);
    }
  }
  return [...revisions.values()].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
}

export async function readProgress(projectDir: string): Promise<ProgressProjection> {
  const documents = await readManifestDocuments(projectDir);
  const [currentWords, board, newestFirstEvents] = await Promise.all([
    currentManuscriptWords(projectDir, documents),
    readScenes(projectDir),
    readEvents(projectDir, Number.MAX_SAFE_INTEGER),
  ]);
  const chronologicalEvents = [...newestFirstEvents].reverse();
  const byStatus: Record<SceneStatus, number> = { planned: 0, drafting: 0, revised: 0, locked: 0 };
  for (const scene of board.scenes) byStatus[scene.status]++;
  return {
    currentWords,
    wordFlow: projectWordFlow(
      chronologicalEvents,
      new Set(documents.filter((document) => document.kind === 'manuscript').map((document) => document.id)),
    ),
    scenes: {
      total: board.scenes.length,
      completed: byStatus.revised + byStatus.locked,
      byStatus,
    },
    unresolvedRevisions: projectUnresolvedRevisions(chronologicalEvents),
  };
}
