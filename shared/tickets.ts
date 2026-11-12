/**
 * Tickets carry one story thread across visits: an assignment the writer (or
 * a Muse suggestion the writer accepted) sets, the source lines it rests on,
 * and whatever the writer brings back. Shared by server and web.
 */

export type TicketStatus = 'open' | 'out' | 'returned' | 'closed';
export const TICKET_STATUSES: readonly TicketStatus[] = ['open', 'out', 'returned', 'closed'];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = { open: 'Open', out: 'Out', returned: 'Returned', closed: 'Closed' };

export interface TicketSourceRef { sourceId?: string; title: string; section?: string; quote: string }
export interface TicketReturn { sourceId: string; title: string; attachedAt: string }
export interface TicketExchange { question: string; answer: string; at: string }

export interface Ticket {
  id: string;
  title: string; // the assignment
  wants: string;
  threads: string[];
  sourceRefs: TicketSourceRef[];
  questions: string[];
  status: TicketStatus;
  origin: 'writer' | 'muse';
  returns: TicketReturn[];
  log: TicketExchange[];
  createdAt: string;
  updatedAt: string;
}

/** What the writer can set; ids, returns, log and timestamps are server-owned. */
export interface TicketDraft {
  title: string;
  wants?: string;
  threads?: string[];
  sourceRefs?: TicketSourceRef[];
  questions?: string[];
  status?: TicketStatus;
  origin?: 'writer' | 'muse';
}

/** A Muse proposal shown under a reply; nothing is stored until the writer accepts it. */
export interface TicketSuggestion {
  title: string;
  wants: string;
  threads: string[];
  questions: string[];
  quotes: { section?: string; quote: string }[];
}

export const TICKET_LIMITS = {
  title: 200, wants: 4000, item: 600, items: 20, quote: 1500, refs: 12,
  tickets: 500, returns: 20, log: 10, logAnswer: 4000, logQuestion: 2000,
} as const;

const list = (items: string[], heading: string, bullet = '- ') => items.length ? [`## ${heading}`, '', ...items.map((item) => `${bullet}${item}`), ''] : [];

export function ticketToMarkdown(ticket: Pick<Ticket, 'title' | 'wants' | 'threads' | 'sourceRefs' | 'questions' | 'status'> & { returns?: TicketReturn[] }): string {
  return [
    `# ${ticket.title}`,
    '',
    `Status: ${TICKET_STATUS_LABELS[ticket.status]}`,
    '',
    ...(ticket.wants.trim() ? ['## Current wants', '', ticket.wants.trim(), ''] : []),
    ...list(ticket.threads, 'Current threads'),
    ...(ticket.sourceRefs.length ? ['## From the source', '', ...ticket.sourceRefs.flatMap((ref) => [
      `**${ref.title}${ref.section ? ` — ${ref.section}` : ''}**`, '', ...ref.quote.split('\n').map((line) => `> ${line}`), '',
    ])] : []),
    ...list(ticket.questions, 'Questions to start from'),
    ...list((ticket.returns ?? []).map((r) => r.title), 'Returned work'),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function ticketFileName(title: string, extension: string) {
  return `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'ticket'}.${extension}`;
}
