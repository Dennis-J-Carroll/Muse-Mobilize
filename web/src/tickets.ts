import { create } from 'zustand';
import { api } from './api';
import { useStore } from './store';
import type { Ticket, TicketDraft, TicketSuggestion } from '../../shared/tickets';

/** Ticket list for the open project, shared by the Tickets pane and Muse replies. */
interface TicketState { projectId: string | null; tickets: Ticket[]; loading: boolean }
export const useTickets = create<TicketState>(() => ({ projectId: null, tickets: [], loading: false }));

const projectId = () => useStore.getState().project?.id ?? null;
const stillOpen = (id: string) => useStore.getState().project?.id === id;

function put(id: string, ticket: Ticket) {
  if (!stillOpen(id)) return;
  const current = useTickets.getState();
  const list = current.projectId === id ? current.tickets : [];
  useTickets.setState({ projectId: id, tickets: list.some((t) => t.id === ticket.id) ? list.map((t) => (t.id === ticket.id ? ticket : t)) : [...list, ticket] });
}

async function guard<T>(work: () => Promise<T>): Promise<T | null> {
  try { return await work(); } catch (err: any) { useStore.setState({ error: err.message }); return null; }
}

export async function loadTickets() {
  const id = projectId();
  if (!id) return;
  useTickets.setState({ loading: true });
  const result = await guard(() => api.tickets(id));
  if (stillOpen(id)) useTickets.setState({ projectId: id, tickets: result?.tickets ?? useTickets.getState().tickets, loading: false });
}

export async function createTicket(draft: TicketDraft) {
  const id = projectId();
  if (!id) return null;
  const result = await guard(() => api.createTicket(id, draft));
  if (result) put(id, result.ticket);
  return result?.ticket ?? null;
}

export async function updateTicket(ticketId: string, draft: Partial<TicketDraft>) {
  const id = projectId();
  if (!id) return null;
  const result = await guard(() => api.updateTicket(id, ticketId, draft));
  if (result) put(id, result.ticket);
  return result?.ticket ?? null;
}

export async function deleteTicket(ticketId: string) {
  const id = projectId();
  if (!id) return;
  const result = await guard(() => api.deleteTicket(id, ticketId));
  if (result && stillOpen(id)) useTickets.setState({ tickets: useTickets.getState().tickets.filter((t) => t.id !== ticketId) });
}

/** A Muse suggestion becomes a ticket only here, after the writer accepts it (edited or not). */
export function suggestionDraft(suggestion: TicketSuggestion, source?: { id: string; title: string } | null): TicketDraft {
  return {
    title: suggestion.title,
    wants: suggestion.wants,
    threads: suggestion.threads,
    questions: suggestion.questions,
    sourceRefs: suggestion.quotes.map((q) => ({ ...(source ? { sourceId: source.id } : {}), title: source?.title ?? 'Source', ...(q.section ? { section: q.section } : {}), quote: q.quote })),
    origin: 'muse',
  };
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const canShareFiles = () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
  && navigator.canShare({ files: [new File(['x'], 'probe.md', { type: 'text/markdown' })] });

/** Download, or hand to the system share sheet (LocalSend, Drive) where the device supports it. */
export async function exportTicket(ticket: Ticket, format: 'markdown' | 'txt' | 'docx', share = false) {
  const id = projectId();
  if (!id) return;
  const result = await guard(() => api.exportTicket(id, ticket.id, format));
  if (!result || !stillOpen(id)) return;
  if (share && canShareFiles()) {
    const file = new File([result.blob], result.fileName, { type: result.blob.type });
    try { await navigator.share({ files: [file], title: ticket.title }); }
    catch (err: any) { if (err?.name !== 'AbortError') save(result.blob, result.fileName); }
  } else {
    save(result.blob, result.fileName);
  }
  await loadTickets();
  useStore.getState().setNotice(`Ticket exported${ticket.status === 'open' ? ' and marked Out' : ''}.`);
}

/** A returned file goes through Sources (so it is searchable and backed up), then is linked to the ticket. */
export async function attachReturn(ticket: Ticket, file: File) {
  const id = projectId();
  if (!id) return;
  const imported = await guard(() => api.importSource(id, file, { classification: 'notes', authority: 'working' }));
  if (!imported || !stillOpen(id)) return;
  if (imported.source.extractionStatus === 'failed') {
    useStore.setState({ error: `No text could be read from “${file.name}”. It is in Sources but was not attached.` });
    return;
  }
  const result = await guard(() => api.attachTicketReturn(id, ticket.id, imported.source.id));
  if (!result) return;
  put(id, result.ticket);
  useStore.getState().setNotice(`${imported.duplicate ? 'Already in Sources — linked' : 'Attached'} “${imported.source.title}” to the ticket.${imported.source.extractionStatus === 'partial' ? ' Some of its text could not be read.' : ''}`);
}

export async function detachReturn(ticket: Ticket, sourceId: string) {
  const id = projectId();
  if (!id) return;
  const result = await guard(() => api.detachTicketReturn(id, ticket.id, sourceId));
  if (result) put(id, result.ticket);
}

useStore.subscribe((state, previous) => {
  if (state.project?.id !== previous.project?.id) useTickets.setState({ projectId: null, tickets: [], loading: false });
});
