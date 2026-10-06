import { useEffect } from 'react';
import type { ConnectionTarget } from '../../../shared/connections';
import { useThreadPopover, useThreads } from '../threads';
import { openCount } from '../threadView';

export function ThreadButton({ target }: { target: ConnectionTarget }) {
  const threads = useThreads((state) => state.threads);
  useEffect(() => { void useThreads.getState().ensureLoaded(); }, []);
  const count = openCount(threads, target);
  return <button type="button" className="floating-drawer-dock thread-button" aria-label={count ? `Notes, ${count} open` : 'Notes'} title="Notes and Muse thread"
    onClick={() => useThreadPopover.getState().open(target)}>
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12v8H7l-3 3v-3H2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
    {count > 0 && <b className="thread-badge">{count}</b>}
  </button>;
}
