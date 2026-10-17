import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useStore } from '../store';
import { consultationIsCurrent, finishCharacterConsultation, openFullCast, parkConsultationEditor, restoreConsultationReadingPosition, useCharacterConsultation } from '../characterConsultation';
import { trapLayerTab } from '../focusLayers';

export function CharacterConsultation({ writingRef, castRef }: { writingRef: RefObject<HTMLDivElement>; castRef: RefObject<HTMLDivElement> }) {
  const current = useCharacterConsultation(state => state.current);
  const panes = useStore(state => state.panes), project = useStore(state => state.project), workspace = useStore(state => state.activeWorkspace);
  const panels = useStore(state => state.floatingPanels);
  const root = useRef<HTMLDivElement>(null), sheet = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !current) return;
    const size = () => setNarrow(el.clientWidth < 1000);
    size(); const observer = new ResizeObserver(size); observer.observe(el);
    return () => observer.disconnect();
  }, [Boolean(current)]);
  useLayoutEffect(() => {
    if (writingRef.current) writingRef.current.inert = Boolean(current && narrow);
    return () => { if (writingRef.current) writingRef.current.inert = false; };
  }, [Boolean(current), narrow]);
  // Forms are React portals: trap at the DOM boundary, not the React parent boundary.
  useEffect(() => {
    const el = sheet.current;
    if (!el || !current || !narrow) return;
    const tab = (event: KeyboardEvent) => {
      if (!event.defaultPrevented) trapLayerTab({ key: event.key, shiftKey: event.shiftKey, currentTarget: el, preventDefault: () => event.preventDefault() });
    };
    el.addEventListener('keydown', tab);
    return () => el.removeEventListener('keydown', tab);
  }, [Boolean(current), narrow]);
  useEffect(() => {
    if (current && !consultationIsCurrent(current)) finishCharacterConsultation(false);
  }, [current, panes, project, workspace]);
  useEffect(() => {
    if (!current) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || document.fullscreenElement) return;
      const target = event.target instanceof Element ? event.target : null;
      if (sheet.current?.contains(target) || target?.closest('[role="dialog"], .modal-backdrop')) return;
      event.preventDefault();
      if (current.editorId) parkConsultationEditor(); else finishCharacterConsultation();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [current]);
  useEffect(() => {
    if (current?.editorId && !panels.some(panel => panel.id === current.editorId && !panel.docked)) {
      useCharacterConsultation.setState({ current: { ...current, editorId: undefined } });
    }
  }, [current, panels]);
  useLayoutEffect(() => {
    if (!current) return;
    const active = document.activeElement as HTMLElement | null;
    const keepField = active?.matches('input, textarea, select') && sheet.current?.contains(active);
    const frame = requestAnimationFrame(() => {
      restoreConsultationReadingPosition();
      if (keepField && active?.getClientRects().length) { active.focus({ preventScroll: true }); return; }
      const form = document.getElementById('consultation-editor');
      if (current.editorId && form?.contains(document.activeElement) && document.activeElement?.matches('input, textarea, select')) return;
      const target = current.editorId ? form?.querySelector<HTMLElement>('input:not([type="file"]), textarea')
        : castRef.current?.querySelector<HTMLElement>('.cast-person.is-selected, .cast-person, button');
      (target ?? sheet.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [Boolean(current), current?.editorId, narrow]);
  return <div ref={root} className={`character-consultation ${narrow ? 'is-narrow' : ''}`} hidden={!current}>
    <div ref={writingRef} className="consultation-writing" />
    <section ref={sheet} className="consultation-sheet" role={narrow ? 'dialog' : 'region'} aria-modal={narrow || undefined} aria-label="Character reference" tabIndex={-1}
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || document.fullscreenElement) return;
        if ((event.target as Element).closest('[role="dialog"]') !== sheet.current && (event.target as Element).closest('[role="dialog"]')) return;
        event.preventDefault(); event.stopPropagation();
        if (current?.editorId) parkConsultationEditor(); else finishCharacterConsultation();
      }}>
      <header><strong>Character reference</strong><div><button type="button" onClick={() => finishCharacterConsultation()}>Return to writing</button><button type="button" onClick={openFullCast}>Open full Cast</button></div></header>
      <div ref={castRef} className="consultation-cast" hidden={Boolean(current?.editorId)} />
      <div id="consultation-editor" hidden={!current?.editorId} />
    </section>
  </div>;
}
