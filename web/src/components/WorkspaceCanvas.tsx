import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { EditorPane } from '../panes/EditorPane';
import { AgentPane } from '../panes/AgentPane';
import { EventsPane } from '../panes/EventsPane';
import { ReviewPane } from '../panes/ReviewPane';
import type { Pane } from '../types';
import * as Icon from './icons';

/**
 * The Workspace Canvas. Panes are views, not agents (§34.3): the same shell
 * hosts a manuscript, a conversation, or an activity log, and any of them can
 * be resized, minimized, maximized or dismissed without touching the draft.
 */

function PaneBody({ pane }: { pane: Pane }) {
  switch (pane.type) {
    case 'editor':
    case 'notes':
    case 'outline':
      return <EditorPane pane={pane} />;
    case 'agent':
      return <AgentPane pane={pane} />;
    case 'events':
      return <EventsPane />;
    case 'review':
      return <ReviewPane />;
    default:
      return <div className="pane-body">Unknown pane type.</div>;
  }
}

function PaneFrame({ pane }: { pane: Pane }) {
  const setPaneSize = useStore((s) => s.setPaneSize);
  const closePane = useStore((s) => s.closePane);
  const doc = useStore((s) => (pane.binding?.type === 'document' ? s.docs[pane.binding.id] : undefined));
  const minimized = pane.sizeMode === 'minimized';

  return (
    <section className={`pane pane-${pane.type} ${minimized ? 'is-min' : ''}`}>
      <header className="pane-head">
        <span className="pane-title">{pane.title}</span>
        {doc?.dirty && <span className="pane-dirty" title="unsaved">•</span>}
        <span className="pane-tools">
          <button title="Minimize" onClick={() => setPaneSize(pane.id, minimized ? 'normal' : 'minimized')}>
            <Icon.Minus />
          </button>
          <button title="Maximize" onClick={() => setPaneSize(pane.id, pane.sizeMode === 'maximized' ? 'normal' : 'maximized')}>
            <Icon.Expand />
          </button>
          <button title="Close" onClick={() => closePane(pane.id)}>
            <Icon.Close />
          </button>
        </span>
      </header>
      {!minimized && <div className="pane-body">{<PaneBody pane={pane} />}</div>}
    </section>
  );
}

function useDrag(onMove: (dx: number, dy: number) => void) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const down = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    origin.current = { x: e.clientX, y: e.clientY };
    document.body.classList.add('is-dragging');
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!origin.current) return;
      onMove(e.clientX - origin.current.x, e.clientY - origin.current.y);
      origin.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      origin.current = null;
      document.body.classList.remove('is-dragging');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [onMove]);

  return down;
}

export function WorkspaceCanvas() {
  const panes = useStore((s) => s.panes);
  const rightWidth = useStore((s) => s.rightWidth);
  const bottomHeight = useStore((s) => s.bottomHeight);
  const setRightWidth = useStore((s) => s.setRightWidth);
  const setBottomHeight = useStore((s) => s.setBottomHeight);

  const onDragV = useDrag((dx) => setRightWidth(useStore.getState().rightWidth - dx));
  const onDragH = useDrag((_dx, dy) => setBottomHeight(useStore.getState().bottomHeight - dy));

  const maximized = panes.find((p) => p.sizeMode === 'maximized');
  const main = panes.filter((p) => p.region === 'main');
  const right = panes.filter((p) => p.region === 'right');
  const bottom = panes.filter((p) => p.region === 'bottom');

  if (!panes.length) {
    return (
      <div className="canvas canvas-empty">
        <Icon.Feather size={56} />
        <p className="empty-title">Start writing your story…</p>
        <p className="empty-sub">Use the cards on the left to bring your ideas to life.</p>
      </div>
    );
  }

  if (maximized) {
    return (
      <div className="canvas canvas-single">
        <PaneFrame pane={maximized} />
      </div>
    );
  }

  const rw = right.length ? rightWidth : 0;
  const bh = bottom.length ? bottomHeight : 0;

  return (
    <div
      className="canvas"
      style={{
        gridTemplateColumns: `minmax(0,1fr) ${rw ? '7px' : '0px'} ${rw}px`,
        gridTemplateRows: `minmax(0,1fr) ${bh ? '7px' : '0px'} ${bh}px`,
      }}
    >
      <div className="region region-main">
        {main.map((p) => (
          <PaneFrame key={p.id} pane={p} />
        ))}
      </div>

      {rw > 0 && <div className="split split-v" onMouseDown={onDragV} title="Drag to resize" />}
      {rw > 0 && (
        <div className="region region-right">
          {right.map((p) => (
            <PaneFrame key={p.id} pane={p} />
          ))}
        </div>
      )}

      {bh > 0 && <div className="split split-h" onMouseDown={onDragH} title="Drag to resize" />}
      {bh > 0 && (
        <div className="region region-bottom">
          {bottom.map((p) => (
            <PaneFrame key={p.id} pane={p} />
          ))}
        </div>
      )}
    </div>
  );
}
