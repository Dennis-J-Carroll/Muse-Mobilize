import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import type { MuseEvent } from './types.js';

/**
 * Append-only creative history (§26). JSONL rather than SQLite: no native
 * dependency, trivially greppable, and the file stays portable inside the
 * .muse project folder like everything else the writer owns.
 */
export function eventLogPath(projectDir: string): string {
  return path.join(projectDir, '.muse', 'events.jsonl');
}

export async function emit(
  projectDir: string,
  type: string,
  payload?: Record<string, unknown>,
  actor?: string,
): Promise<MuseEvent> {
  const event: MuseEvent = { id: randomUUID(), ts: new Date().toISOString(), type, actor, payload };
  const file = eventLogPath(projectDir);
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8');
  return event;
}

export async function readEvents(projectDir: string, limit = 200): Promise<MuseEvent[]> {
  const file = eventLogPath(projectDir);
  if (!(await exists(file))) return [];
  const raw = await fs.readFile(file, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const slice = lines.slice(-limit);
  const out: MuseEvent[] = [];
  for (const line of slice) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // A torn final line is not worth losing the log over.
    }
  }
  return out.reverse();
}
