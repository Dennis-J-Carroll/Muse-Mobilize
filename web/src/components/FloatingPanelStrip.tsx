import { useEffect } from 'react';
import { useStore } from '../store';

export function FloatingPanelStrip({ disabled = false }: { disabled?: boolean }) {
  // Keep the Zustand snapshot stable; filtering inside a selector loops in v5.
  const panels = useStore((state) => state.floatingPanels);
  useEffect(() => {
    if (disabled) return;
    const recall = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
      const slot = /^Digit[1-9]$/.test(event.code) ? Number(event.code.slice(-1)) : Number(event.key);
      const panel = useStore.getState().floatingPanels.find((item) => item.slot === slot && item.docked);
      if (!panel || slot < 1 || slot > 9) return;
      event.preventDefault();
      useStore.getState().undockFloatingPanel(panel.id);
    };
    window.addEventListener('keydown', recall);
    return () => window.removeEventListener('keydown', recall);
  }, [disabled]);
  const docked = panels.filter((panel) => panel.docked).sort((a, b) => (a.slot ?? 10) - (b.slot ?? 10));
  if (!docked.length) return null;
  return <nav className="floating-panel-strip" aria-label="Collapsed editors">
    {docked.map((panel) => <button key={panel.id} id={`floating-tab-${panel.id}`} type="button" className="floating-panel-tab"
      aria-label={`Recall ${panel.title}`} aria-keyshortcuts={panel.slot ? `Alt+${panel.slot}` : undefined}
      title={`${panel.title}${panel.slot ? ` (Alt+${panel.slot})` : ''}`}
      onClick={() => useStore.getState().undockFloatingPanel(panel.id)}>
      {panel.slot !== null && <em aria-hidden="true">{panel.slot}</em>}<span>{panel.title}</span>
    </button>)}
  </nav>;
}
