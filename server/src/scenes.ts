import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import type {
  DialogueLine, DialogueVoiceStatus, Scene, SceneAssetKind, SceneAssetRef, SceneBeat, SceneBoard,
  SceneStatus, SceneTheme, ThemeOccurrence,
} from './types.js';

const SCENE_STATUSES: SceneStatus[] = ['planned', 'drafting', 'revised', 'locked'];
const ASSET_KINDS: SceneAssetKind[] = ['character', 'theme', 'location', 'plot'];
const VOICE_STATUSES: DialogueVoiceStatus[] = ['unchecked', 'in_voice', 'review'];
const THEME_OCCURRENCES: ThemeOccurrence[] = ['appears', 'echoes', 'fades', 'resolves'];
const scenePath = (projectDir: string) => path.join(projectDir, 'scenes', 'scenes.json');
const emptyBoard = (): SceneBoard => ({ version: 1, themes: [], scenes: [] });

const text = (value: unknown) => String(value ?? '').trim();
const order = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
};

function cleanAssets(value: SceneAssetRef[] | undefined): SceneAssetRef[] {
  const seen = new Set<string>();
  return (value ?? []).flatMap((asset) => {
    const kind = asset?.kind;
    const refId = text(asset?.refId);
    if (!ASSET_KINDS.includes(kind) || !refId || seen.has(`${kind}:${refId}`)) return [];
    const rawRole = text(asset.role);
    const role = kind === 'theme' && rawRole === 'pressure' ? 'appears' : rawRole;
    if (kind === 'theme' && !THEME_OCCURRENCES.includes(role as ThemeOccurrence)) {
      throw new Error(`theme occurrence must be one of: ${THEME_OCCURRENCES.join(' | ')}`);
    }
    seen.add(`${kind}:${refId}`);
    return [{ kind, refId, role } as SceneAssetRef];
  });
}

function cleanBeats(value: SceneBeat[] | undefined): SceneBeat[] {
  return (value ?? []).flatMap((beat, index) => {
    const title = text(beat?.title);
    if (!title) return [];
    return [{ id: text(beat.id) || randomUUID(), title, summary: text(beat.summary), order: order(beat.order, index) }];
  }).sort((a, b) => a.order - b.order).map((beat, index) => ({ ...beat, order: index }));
}

function cleanDialogue(value: DialogueLine[] | undefined): DialogueLine[] {
  return (value ?? []).flatMap((line, index) => {
    const lineText = text(line?.text);
    if (!lineText) return [];
    const voiceStatus = VOICE_STATUSES.includes(line.voiceStatus) ? line.voiceStatus : 'unchecked';
    return [{
      id: text(line.id) || randomUUID(),
      speakerId: text(line.speakerId),
      text: lineText,
      subtext: text(line.subtext),
      knowledgeState: text(line.knowledgeState),
      voiceStatus,
      voiceNote: text(line.voiceNote),
      order: order(line.order, index),
    }];
  }).sort((a, b) => a.order - b.order).map((line, index) => ({ ...line, order: index }));
}

export async function readScenes(projectDir: string): Promise<SceneBoard> {
  const file = scenePath(projectDir);
  if (!(await exists(file))) return emptyBoard();
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<SceneBoard>;
  return {
    version: 1,
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
  };
}

async function writeScenes(projectDir: string, board: SceneBoard): Promise<void> {
  const file = scenePath(projectDir);
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(board, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function createSceneTheme(
  projectDir: string,
  input: { name: string; description?: string; question?: string; motif?: string },
): Promise<SceneTheme> {
  const name = text(input.name);
  if (!name) throw new Error('theme name is required');
  const board = await readScenes(projectDir);
  if (board.themes.some((theme) => theme.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error(`Theme already exists: ${name}`);
  }
  const now = new Date().toISOString();
  const question = text(input.question);
  const motif = text(input.motif);
  const theme: SceneTheme = {
    id: randomUUID(),
    name,
    description: text(input.description),
    ...(question ? { question } : {}),
    ...(motif ? { motif } : {}),
    createdAt: now,
    updatedAt: now,
  };
  board.themes.push(theme);
  await writeScenes(projectDir, board);
  return theme;
}

export async function updateSceneTheme(
  projectDir: string,
  themeId: string,
  patch: Partial<Pick<SceneTheme, 'name' | 'description' | 'question' | 'motif'>>,
): Promise<SceneTheme> {
  const board = await readScenes(projectDir);
  const index = board.themes.findIndex((theme) => theme.id === themeId);
  if (index === -1) throw new Error(`No such theme: ${themeId}`);
  const current = board.themes[index];
  const updated: SceneTheme = {
    ...current,
    ...(patch.name !== undefined ? { name: text(patch.name) } : {}),
    ...(patch.description !== undefined ? { description: text(patch.description) } : {}),
    ...(patch.question !== undefined ? { question: text(patch.question) || undefined } : {}),
    ...(patch.motif !== undefined ? { motif: text(patch.motif) || undefined } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!updated.name) throw new Error('theme name is required');
  if (board.themes.some((theme, themeIndex) => themeIndex !== index && theme.name.toLocaleLowerCase() === updated.name.toLocaleLowerCase())) {
    throw new Error(`Theme already exists: ${updated.name}`);
  }
  board.themes[index] = updated;
  await writeScenes(projectDir, board);
  return updated;
}

export async function createScene(
  projectDir: string,
  input: {
    title: string;
    summary?: string;
    section?: string;
    purpose?: string;
    status?: SceneStatus;
    order?: number;
    documentId?: string;
    assets?: SceneAssetRef[];
    beats?: SceneBeat[];
    dialogue?: DialogueLine[];
  },
): Promise<Scene> {
  const title = text(input.title);
  if (!title) throw new Error('scene title is required');
  const status = input.status ?? 'planned';
  if (!SCENE_STATUSES.includes(status)) throw new Error(`scene status must be one of: ${SCENE_STATUSES.join(' | ')}`);
  const board = await readScenes(projectDir);
  const now = new Date().toISOString();
  const documentId = text(input.documentId);
  const scene: Scene = {
    id: randomUUID(),
    title,
    summary: text(input.summary),
    section: text(input.section) || 'Unsectioned',
    purpose: text(input.purpose),
    status,
    order: order(input.order, board.scenes.length),
    ...(documentId ? { documentId } : {}),
    assets: cleanAssets(input.assets),
    beats: cleanBeats(input.beats),
    dialogue: cleanDialogue(input.dialogue),
    createdAt: now,
    updatedAt: now,
  };
  board.scenes.push(scene);
  board.scenes.sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = index; });
  await writeScenes(projectDir, board);
  return scene;
}

export async function updateScene(
  projectDir: string,
  sceneId: string,
  patch: Partial<Pick<Scene, 'title' | 'summary' | 'section' | 'purpose' | 'status' | 'order' | 'documentId' | 'assets' | 'beats' | 'dialogue'>>,
): Promise<Scene> {
  const board = await readScenes(projectDir);
  const index = board.scenes.findIndex((scene) => scene.id === sceneId);
  if (index === -1) throw new Error(`No such scene: ${sceneId}`);
  if (patch.status !== undefined && !SCENE_STATUSES.includes(patch.status)) {
    throw new Error(`scene status must be one of: ${SCENE_STATUSES.join(' | ')}`);
  }
  const current = board.scenes[index];
  const documentId = patch.documentId === undefined ? current.documentId : text(patch.documentId) || undefined;
  const updated: Scene = {
    ...current,
    assets: cleanAssets(patch.assets ?? current.assets),
    ...(patch.title !== undefined ? { title: text(patch.title) } : {}),
    ...(patch.summary !== undefined ? { summary: text(patch.summary) } : {}),
    ...(patch.section !== undefined ? { section: text(patch.section) || 'Unsectioned' } : {}),
    ...(patch.purpose !== undefined ? { purpose: text(patch.purpose) } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.order !== undefined ? { order: order(patch.order, current.order) } : {}),
    ...(patch.documentId !== undefined ? { documentId } : {}),
    ...(patch.beats !== undefined ? { beats: cleanBeats(patch.beats) } : {}),
    ...(patch.dialogue !== undefined ? { dialogue: cleanDialogue(patch.dialogue) } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!updated.title) throw new Error('scene title is required');
  board.scenes[index] = updated;
  board.scenes.sort((a, b) => a.order - b.order).forEach((item, sceneOrder) => { item.order = sceneOrder; });
  await writeScenes(projectDir, board);
  return board.scenes.find((scene) => scene.id === sceneId)!;
}
