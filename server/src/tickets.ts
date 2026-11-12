import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import { readSource } from './sources.js';
import { TICKET_LIMITS as L, TICKET_STATUSES, type Ticket, type TicketDraft, type TicketExchange, type TicketReturn, type TicketSourceRef, type TicketStatus } from '../../shared/tickets.js';

const ticketsPath = (projectDir: string) => path.join(projectDir, 'tickets', 'tickets.json');
const text = (value: unknown, max: number) => (value === undefined || value === null ? '' : String(value)).trim().slice(0, max);
const date = (value: unknown, fallback: string) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
const items = (value: unknown, max = L.items) => (Array.isArray(value) ? value : []).map((item) => text(item, L.item)).filter(Boolean).slice(0, max);
const status = (value: unknown, fallback: TicketStatus = 'open'): TicketStatus => TICKET_STATUSES.includes(value as TicketStatus) ? value as TicketStatus : fallback;

function refs(value: unknown): TicketSourceRef[] {
  return (Array.isArray(value) ? value : []).flatMap((ref) => {
    const quote = text(ref?.quote, L.quote);
    if (!quote) return [];
    const sourceId = text(ref?.sourceId, 120);
    const section = text(ref?.section, L.item);
    return [{ ...(sourceId ? { sourceId } : {}), title: text(ref?.title, L.title) || 'Source', ...(section ? { section } : {}), quote }];
  }).slice(0, L.refs);
}

/** Everything arriving here is untrusted (request bodies, hand-edited files). */
export function normalizeTicket(input: any, now = new Date().toISOString()): Ticket | null {
  const title = text(input?.title, L.title);
  if (!title) return null;
  const created = date(input?.createdAt, now);
  return {
    id: text(input?.id, 80) || randomUUID(),
    title,
    wants: text(input?.wants, L.wants),
    threads: items(input?.threads),
    sourceRefs: refs(input?.sourceRefs),
    questions: items(input?.questions),
    status: status(input?.status),
    origin: input?.origin === 'muse' ? 'muse' : 'writer',
    returns: (Array.isArray(input?.returns) ? input.returns : []).flatMap((r: any): TicketReturn[] => {
      const sourceId = text(r?.sourceId, 120);
      return sourceId ? [{ sourceId, title: text(r?.title, L.title) || 'Returned file', attachedAt: date(r?.attachedAt, now) }] : [];
    }).slice(0, L.returns),
    log: (Array.isArray(input?.log) ? input.log : []).flatMap((e: any): TicketExchange[] => {
      const answer = text(e?.answer, L.logAnswer);
      return answer ? [{ question: text(e?.question, L.logQuestion), answer, at: date(e?.at, now) }] : [];
    }).slice(-L.log),
    createdAt: created,
    updatedAt: date(input?.updatedAt, created),
  };
}

export async function readTickets(projectDir: string): Promise<Ticket[]> {
  const file = ticketsPath(projectDir);
  if (!(await exists(file))) return [];
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const seen = new Set<string>();
  return (Array.isArray(raw?.tickets) ? raw.tickets : []).flatMap((t: unknown) => {
    const ticket = normalizeTicket(t);
    if (!ticket || seen.has(ticket.id)) return [];
    seen.add(ticket.id);
    return [ticket];
  }).slice(0, L.tickets);
}

// One writer at a time per project directory; reads stay lock-free.
const queues = new Map<string, Promise<unknown>>();
function serialize<T>(projectDir: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(projectDir) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  queues.set(projectDir, next);
  return next.finally(() => { if (queues.get(projectDir) === next) queues.delete(projectDir); });
}

async function writeTickets(projectDir: string, tickets: Ticket[]) {
  const file = ticketsPath(projectDir);
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify({ version: 1, tickets }, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function notFound(): never {
  throw Object.assign(new Error('Ticket not found.'), { status: 404 });
}

async function update(projectDir: string, ticketId: string, change: (ticket: Ticket) => Ticket): Promise<Ticket> {
  return serialize(projectDir, async () => {
    const tickets = await readTickets(projectDir);
    const index = tickets.findIndex((t) => t.id === ticketId);
    if (index === -1) notFound();
    const next = normalizeTicket({ ...change(tickets[index]), id: ticketId, createdAt: tickets[index].createdAt, updatedAt: new Date().toISOString() });
    if (!next) throw Object.assign(new Error('A ticket needs an assignment.'), { status: 400 });
    tickets[index] = next;
    await writeTickets(projectDir, tickets);
    return next;
  });
}

export async function readTicket(projectDir: string, ticketId: string): Promise<Ticket> {
  return (await readTickets(projectDir)).find((t) => t.id === ticketId) ?? notFound();
}

export async function createTicket(projectDir: string, draft: TicketDraft): Promise<Ticket> {
  return serialize(projectDir, async () => {
    const tickets = await readTickets(projectDir);
    if (tickets.length >= L.tickets) throw Object.assign(new Error(`A project can hold at most ${L.tickets} tickets.`), { status: 400 });
    const ticket = normalizeTicket({ ...draft, id: randomUUID(), returns: [], log: [], createdAt: undefined, updatedAt: undefined });
    if (!ticket) throw Object.assign(new Error('A ticket needs an assignment.'), { status: 400 });
    await writeTickets(projectDir, [...tickets, ticket]);
    return ticket;
  });
}

/** Writer edits: returns and the Muse log are never replaced from a request body. */
export function updateTicket(projectDir: string, ticketId: string, draft: Partial<TicketDraft>) {
  return update(projectDir, ticketId, (ticket) => ({
    ...ticket,
    ...Object.fromEntries((['title', 'wants', 'threads', 'sourceRefs', 'questions', 'status'] as const).filter((key) => draft[key] !== undefined).map((key) => [key, draft[key]])),
  }));
}

export function setTicketStatus(projectDir: string, ticketId: string, next: TicketStatus) {
  return update(projectDir, ticketId, (ticket) => ({ ...ticket, status: next }));
}

export async function deleteTicket(projectDir: string, ticketId: string): Promise<Ticket> {
  return serialize(projectDir, async () => {
    const tickets = await readTickets(projectDir);
    const ticket = tickets.find((t) => t.id === ticketId) ?? notFound();
    await writeTickets(projectDir, tickets.filter((t) => t.id !== ticketId));
    return ticket;
  });
}

/** The returned file was already imported as a Source; link it and mark the ticket returned. */
export async function attachTicketReturn(projectDir: string, ticketId: string, sourceId: string): Promise<Ticket> {
  const source = await readSource(projectDir, sourceId).catch(() => null);
  if (!source) throw Object.assign(new Error('That returned file is not in Sources.'), { status: 400 });
  if (source.extractionStatus === 'failed') throw Object.assign(new Error(`No text could be read from “${source.title}”, so it was not attached.`), { status: 400 });
  return update(projectDir, ticketId, (ticket) => {
    if (ticket.returns.length >= L.returns && !ticket.returns.some((r) => r.sourceId === sourceId)) {
      throw Object.assign(new Error(`A ticket can hold at most ${L.returns} returned files.`), { status: 400 });
    }
    return {
      ...ticket,
      status: 'returned',
      returns: [...ticket.returns.filter((r) => r.sourceId !== sourceId), { sourceId, title: source.title, attachedAt: new Date().toISOString() }],
    };
  });
}

export function detachTicketReturn(projectDir: string, ticketId: string, sourceId: string) {
  return update(projectDir, ticketId, (ticket) => ({ ...ticket, returns: ticket.returns.filter((r) => r.sourceId !== sourceId) }));
}

export function appendTicketExchange(projectDir: string, ticketId: string, exchange: Omit<TicketExchange, 'at'>) {
  return update(projectDir, ticketId, (ticket) => ({ ...ticket, log: [...ticket.log, { ...exchange, at: new Date().toISOString() }] }));
}
