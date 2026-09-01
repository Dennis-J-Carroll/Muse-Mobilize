import { useStore } from '../store';
import * as Icon from './icons';

export function StatusBar() {
  const project = useStore((s) => s.project);
  const docs = useStore((s) => s.docs);
  const panes = useStore((s) => s.panes);
  const agents = useStore((s) => s.agents);

  const activeDocId = panes.find((p) => p.type === 'editor')?.binding?.id;
  const active = activeDocId ? docs[activeDocId] : undefined;
  const words = active ? active.content.split(/\s+/).filter(Boolean).length : 0;
  const chapters = project?.documents.filter((d) => d.kind === 'manuscript').length ?? 0;
  const live = agents.filter((a) => a.state?.mode === 'live').length;

  return (
    <footer className="statusbar">
      <span><Icon.Bars size={16} /> <b>Words</b> {words.toLocaleString()}</span>
      <span><Icon.Book size={16} /> <b>Chapters</b> {chapters}</span>
      <span><Icon.Clock size={16} /> <b>Saved</b> {active?.dirty ? 'unsaved…' : active?.savedAt ? new Date(active.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
      <span><Icon.Spark size={16} /> <b>Live agents</b> {live} of {agents.length}</span>
    </footer>
  );
}
