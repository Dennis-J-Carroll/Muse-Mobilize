import { useEffect } from 'react';
import { useStore } from '../store';

const LABEL: Record<string, string> = {
  'project.created': 'project created',
  'document.saved': 'draft saved',
  'document.created': 'document created',
  'agent.request.started': 'agent asked',
  'agent.request.completed': 'agent replied',
  'agent.request.failed': 'agent failed',
  'agent.contact.requested': 'consultation sent',
  'agent.contact.completed': 'consultation answered',
  'agent.contact.refused': 'consultation refused',
  'agent.activated': 'agent set live',
  'agent.idled': 'agent set idle',
  'agent.frozen': 'agent frozen',
  'patch.proposed': 'patch proposed',
  'patch.accepted': 'patch accepted',
  'patch.rejected': 'patch rejected',
  'snapshot.created': 'snapshot taken',
  'workspace.pane.opened': 'pane opened',
  'workspace.pane.closed': 'pane closed',
  'workspace.layout.saved': 'workspace saved',
};

/** Append-only creative history (§26) — the record of what changed and why. */
export function EventsPane() {
  const events = useStore((s) => s.events);
  const refresh = useStore((s) => s.refreshEvents);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="events">
      {events.length === 0 && <div className="agent-empty">Nothing has happened yet.</div>}
      {events.map((e) => (
        <div key={e.id} className={`event ev-${e.type.split('.')[0]}`}>
          <span className="ev-time">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <span className="ev-type">{LABEL[e.type] ?? e.type}</span>
          <span className="ev-payload">
            {e.actor ? `${e.actor} ` : ''}
            {summarize(e.payload)}
          </span>
        </div>
      ))}
    </div>
  );
}

function summarize(payload?: Record<string, unknown>): string {
  if (!payload) return '';
  const bits: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    bits.push(`${k}: ${s.length > 60 ? s.slice(0, 60) + '…' : s}`);
  }
  return bits.join('  ');
}
