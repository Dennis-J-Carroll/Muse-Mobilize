import { useStore } from '../store';
import * as Icon from './icons';

export function StatusBar() {
  const project = useStore((s) => s.project);
  const agents = useStore((s) => s.agents);
  const chapters = project?.documents.filter((d) => d.kind === 'manuscript').length ?? 0;
  const live = agents.filter((a) => a.state?.mode === 'live').length;

  return (
    <footer className="statusbar">
      <span><Icon.Book size={16} /> <b>Chapters</b> {chapters}</span>
      <span><Icon.Spark size={16} /> <b>Live agents</b> {live} of {agents.length}</span>
    </footer>
  );
}
