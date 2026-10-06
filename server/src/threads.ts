import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConnectionTarget } from '../../shared/connections.js';
import { THREAD_TEXT_MAX, mergeThreadMessages, sameTarget } from '../../shared/threads.js';
import type { Thread, ThreadAuthor, ThreadMessage, ThreadStore } from '../../shared/threads.js';
import { connectionTarget, requireTarget } from './connections.js';
import { persistJson, serialized } from './json-store.js';

/** A write based on a stale `updatedAt`; the route maps this to HTTP 409. */
export class ThreadConflictError extends Error { readonly status = 409; }

const storePath = (dir: string) => path.join(dir, 'threads', 'threads.json');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value === value.trim();
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function validateStore(value: unknown): ThreadStore {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.threads)) throw new Error('Expected version 1 with a threads array');
  const threadIds = new Set<string>();
  for (const thread of value.threads) {
    if (!isObject(thread) || !isId(thread.id) || threadIds.has(thread.id) || !isTimestamp(thread.createdAt) || !isTimestamp(thread.updatedAt)) throw new Error('Malformed thread');
    threadIds.add(thread.id);
    connectionTarget(thread.target);
    if (thread.status !== 'open' && thread.status !== 'resolved') throw new Error('Malformed thread status');
    if (thread.trashedAt !== undefined && !isTimestamp(thread.trashedAt)) throw new Error('Malformed trashedAt');
    if (!Array.isArray(thread.messages)) throw new Error('Malformed messages');
    const messageIds = new Set<string>();
    for (const message of thread.messages) {
      if (!isObject(message) || !isId(message.id) || messageIds.has(message.id) || typeof message.text !== 'string' || !isTimestamp(message.createdAt)) throw new Error('Malformed message');
      messageIds.add(message.id);
      const author = message.author;
      if (!isObject(author) || (author.kind !== 'user' && !(author.kind === 'muse' && isId(author.agentId)))) throw new Error('Malformed message author');
      if (message.state !== undefined && message.state !== 'failed') throw new Error('Malformed message state');
    }
  }
  return value as unknown as ThreadStore;
}

export async function readThreads(dir: string): Promise<ThreadStore> {
  const file = storePath(dir);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, threads: [] };
    throw error;
  }
  try {
    return validateStore(JSON.parse(raw));
  } catch (error) {
    throw new Error(`Invalid threads store at ${file}: ${(error as Error).message}`, { cause: error });
  }
}

const mutate = <T>(dir: string, operation: (store: ThreadStore) => Promise<T> | T): Promise<T> =>
  serialized(`threads::${path.resolve(dir)}`, async () => {
    const store = await readThreads(dir);
    const result = await operation(store);
    await persistJson(storePath(dir), store);
    return result;
  });

function noteText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A note cannot be empty');
  if (value.trim().length > THREAD_TEXT_MAX) throw new Error(`A note can be at most ${THREAD_TEXT_MAX} characters`);
  return value.trim();
}

function findThread(store: ThreadStore, id: string): Thread {
  const thread = store.threads.find((item) => item.id === id);
  if (!thread) throw new Error(`No such thread: ${id}`);
  return thread;
}

function guard(thread: Thread, expected?: string) {
  if (expected !== undefined && expected !== thread.updatedAt) throw new ThreadConflictError('This note changed elsewhere. Reload and try again.');
}

/** `updatedAt` is the conflict token, so every write must change it even within one millisecond. */
const touch = (thread: Thread) => {
  thread.updatedAt = new Date(Math.max(Date.now(), Date.parse(thread.updatedAt) + 1)).toISOString();
};

export async function listThreads(dir: string, target?: ConnectionTarget): Promise<Thread[]> {
  const { threads } = await readThreads(dir);
  return target ? threads.filter((thread) => sameTarget(thread.target, target)) : threads;
}

export async function createThread(dir: string, input: { target: ConnectionTarget; text: string }): Promise<Thread> {
  const target = connectionTarget(input?.target);
  const text = noteText(input?.text);
  await requireTarget(dir, target);
  return mutate(dir, (store) => {
    const now = new Date().toISOString();
    const thread: Thread = {
      id: randomUUID(), target, status: 'open', createdAt: now, updatedAt: now,
      messages: [{ id: randomUUID(), author: { kind: 'user' }, text, createdAt: now }],
    };
    store.threads.push(thread);
    return thread;
  });
}

export async function addMessage(
  dir: string, threadId: string,
  input: { author: ThreadAuthor; text: string; expectedUpdatedAt?: string },
): Promise<{ thread: Thread; message: ThreadMessage }> {
  const text = input.author.kind === 'user' ? noteText(input.text) : String(input.text ?? '');
  return mutate(dir, (store) => {
    const thread = findThread(store, threadId);
    if (thread.trashedAt) throw new Error('Restore this note before replying');
    guard(thread, input.expectedUpdatedAt);
    const now = new Date().toISOString();
    const message: ThreadMessage = { id: randomUUID(), author: input.author, text, createdAt: now };
    thread.messages.push(message);
    touch(thread);
    return { thread, message };
  });
}

export function editMessage(dir: string, threadId: string, messageId: string, input: { text: string; expectedUpdatedAt?: string }): Promise<Thread> {
  const text = noteText(input?.text);
  return mutate(dir, (store) => {
    const thread = findThread(store, threadId);
    guard(thread, input.expectedUpdatedAt);
    const message = thread.messages.find((item) => item.id === messageId);
    if (!message) throw new Error(`No such message: ${messageId}`);
    if (message.author.kind !== 'user') throw new Error('Only your own notes can be edited');
    message.text = text;
    message.editedAt = new Date().toISOString();
    touch(thread);
    return thread;
  });
}

/** One atomic write for a Muse reply (or its failure); a failed reply being retried is replaced, never stacked. */
export function addMuseMessage(dir: string, threadId: string, input: { agentId: string; text: string; failed?: boolean; replacingMessageId?: string }): Promise<Thread> {
  return mutate(dir, (store) => {
    const thread = findThread(store, threadId);
    if (thread.trashedAt) throw new Error('Restore this note before replying');
    if (input.replacingMessageId !== undefined) {
      const index = thread.messages.findIndex((item) => item.id === input.replacingMessageId);
      if (index === -1 || thread.messages[index].state !== 'failed') throw new Error('Only a failed Muse reply can be replaced');
      thread.messages.splice(index, 1);
    }
    thread.messages.push({
      id: randomUUID(), author: { kind: 'muse', agentId: input.agentId }, text: input.text, createdAt: new Date().toISOString(),
      ...(input.failed ? { state: 'failed' as const } : {}),
    });
    touch(thread);
    return thread;
  });
}

export function setStatus(dir: string, threadId: string, status: 'open' | 'resolved', expectedUpdatedAt?: string): Promise<Thread> {
  if (status !== 'open' && status !== 'resolved') return Promise.reject(new Error('status must be open or resolved'));
  return mutate(dir, (store) => {
    const thread = findThread(store, threadId);
    guard(thread, expectedUpdatedAt);
    thread.status = status;
    touch(thread);
    return thread;
  });
}

export function setTrashed(dir: string, threadId: string, trashed: boolean, expectedUpdatedAt?: string): Promise<Thread> {
  return mutate(dir, (store) => {
    const thread = findThread(store, threadId);
    guard(thread, expectedUpdatedAt);
    if (trashed) thread.trashedAt = new Date().toISOString(); else delete thread.trashedAt;
    touch(thread);
    return thread;
  });
}

export function mergeThreads(dir: string, ids: string[]): Promise<Thread> {
  const unique = [...new Set(ids)];
  if (unique.length < 2) return Promise.reject(new Error('Combine needs at least two notes'));
  return mutate(dir, (store) => {
    const picked = unique.map((id) => findThread(store, id));
    if (picked.some((thread) => thread.trashedAt)) throw new Error('Restore trashed notes before combining');
    if (!picked.every((thread) => sameTarget(thread.target, picked[0].target))) throw new Error('Combine works within one card');
    picked.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const [primary, ...rest] = picked;
    primary.messages = mergeThreadMessages(picked);
    primary.status = picked.some((thread) => thread.status === 'open') ? 'open' : 'resolved';
    primary.mergedFrom = [...(primary.mergedFrom ?? []), ...rest.flatMap((thread) => [thread.id, ...(thread.mergedFrom ?? [])])];
    touch(primary);
    const gone = new Set(rest.map((thread) => thread.id));
    store.threads = store.threads.filter((thread) => !gone.has(thread.id));
    return primary;
  });
}

export function deleteForever(dir: string, threadId: string): Promise<void> {
  return mutate(dir, (store) => {
    const thread = findThread(store, threadId);
    if (!thread.trashedAt) throw new Error('Move the note to trash first');
    store.threads = store.threads.filter((item) => item.id !== threadId);
  });
}
