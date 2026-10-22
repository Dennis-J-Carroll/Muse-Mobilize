import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MEASURE_MAX, MEASURE_MIN, useWritingView, WIDTH_PRESETS, WRITING_FONTS, type WritingFont } from '../writingView';
import * as Icon from './icons';

/** Appearance lives off the page; a portal keeps the controls clear of pane clipping. */
export function PagePopover({ paneId, available }: { paneId: string; available: boolean }) {
  const measure = useWritingView((s) => s.measure);
  const guard = useWritingView((s) => s.guardSelection);
  const surface = useWritingView((s) => s.surface);
  const fontId = useWritingView((s) => s.font);
  const weight = useWritingView((s) => s.weight);
  const font = WRITING_FONTS.find((item) => item.id === fontId) ?? WRITING_FONTS[0];
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 600 });
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const bookmark = useRef<{ editor: HTMLTextAreaElement; start: number; end: number; fraction: number } | null>(null);
  const visible = open && available;
  const restoreScroll = () => {
    const saved = bookmark.current;
    if (saved?.editor.isConnected) saved.editor.scrollTop = saved.fraction * saved.editor.scrollHeight;
  };
  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) {
      const saved = bookmark.current;
      if (saved?.editor.isConnected) saved.editor.setSelectionRange(saved.start, saved.end);
      trigger.current?.focus({ preventScroll: true });
      restoreScroll();
    }
  };
  useEffect(() => { if (!available) setOpen(false); }, [available]);
  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      const popup = panel.current;
      if (!box || !popup) return;
      const viewport = window.visualViewport;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
      const height = Math.min(popup.scrollHeight, bottomEdge - topEdge);
      const below = box.bottom + 6;
      const top = below + height <= bottomEdge ? below : Math.max(topEdge, box.top - height - 6);
      setPosition({ left: Math.max(leftEdge, Math.min(box.left, rightEdge - popup.offsetWidth)), top, maxHeight: bottomEdge - top });
    };
    place();
    panel.current?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [visible]);
  useLayoutEffect(() => { if (visible) restoreScroll(); }, [visible, fontId, weight, measure, surface]);
  useEffect(() => {
    if (!visible) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [visible]);
  const value = typeof measure === 'number' ? measure : 72;
  return <div className="page-popover-root">
    <button ref={trigger} type="button" aria-label="Page settings" aria-expanded={visible} aria-haspopup="dialog" aria-controls={visible ? panelId : undefined}
      onPointerDown={(event) => event.preventDefault()} onClick={() => {
        if (visible) { close(true); return; }
        const editor = document.getElementById(`workspace-${paneId}`)?.querySelector<HTMLTextAreaElement>('textarea.draft');
        bookmark.current = editor ? { editor, start: editor.selectionStart, end: editor.selectionEnd, fraction: editor.scrollHeight ? editor.scrollTop / editor.scrollHeight : 0 } : null;
        setOpen(true);
      }}>Page</button>
    {visible && createPortal(<div ref={panel} id={panelId} className="page-popover" role="dialog" aria-label="Page settings" tabIndex={-1} style={position}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab') {
          const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)') ?? []);
          if ((event.shiftKey && (document.activeElement === controls[0] || document.activeElement === panel.current)) || (!event.shiftKey && document.activeElement === controls.at(-1))) {
            event.preventDefault(); close(true);
          }
        }
      }}>
      <header><h2>Page settings</h2><button type="button" aria-label="Close page settings" onClick={() => close(true)}><Icon.Close size={16} /></button></header>
      <div className="page-setting-grid">
        <label>Surface<select aria-label="Page surface" value={surface} onChange={(event) => useWritingView.getState().setSurface(event.target.value as 'glass' | 'paper')}>
          <option value="glass">Glass</option><option value="paper">Paper</option>
        </select></label>
        <label>Weight<select aria-label="Writing weight" value={font.variable ? weight : '400'} disabled={!font.variable} title={font.variable ? 'Writing weight' : 'This font has one regular weight'} onChange={(event) => useWritingView.getState().setWeight(event.target.value as '350' | '400')}>
          <option value="350">Light</option><option value="400">Regular</option>
        </select></label>
        <label className="page-setting-wide">Font<select aria-label="Writing font" value={font.id} onChange={(event) => useWritingView.getState().setFont(event.target.value as WritingFont)}>
          {WRITING_FONTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
      </div>
      {font.id === 'times' && <p className="page-popover-note">Uses installed Times New Roman; otherwise a serif fallback.</p>}
      <div className="page-width-settings">
        <label>Reading width<select aria-label="Page width" value={measure === null ? 'default' : measure === 'full' ? 'full' : WIDTH_PRESETS.some((p) => p.value === measure) ? String(measure) : 'custom'} onChange={(event) => {
          const next = event.target.value;
          if (next !== 'custom') useWritingView.getState().setMeasure(next === 'default' ? null : next === 'full' ? 'full' : Number(next));
        }}>
          <option value="default">Default width</option>
          {WIDTH_PRESETS.map((preset) => <option key={preset.value} value={String(preset.value)}>{preset.label} ({preset.value})</option>)}
          <option value="full">Full</option>
          {typeof measure === 'number' && !WIDTH_PRESETS.some((p) => p.value === measure) && <option value="custom">Custom ({measure})</option>}
        </select></label>
        <label>Fine-tune <output>{measure === 'full' ? 'Full' : measure === null ? 'Default' : `${value} characters`}</output>
          <input type="range" aria-label="Page width in characters" min={MEASURE_MIN} max={MEASURE_MAX} step={1} value={value} onChange={(event) => useWritingView.getState().setMeasure(Number(event.target.value))} /></label>
        <button type="button" className="page-width-reset" onClick={() => useWritingView.getState().setMeasure(null)}>Reset width</button>
        <p className="page-popover-note">Applies on wider screens; phones and narrow cards keep their own margins.</p>
      </div>
      <label className="page-popover-check"><input type="checkbox" checked={guard} onChange={(event) => useWritingView.getState().setGuardSelection(event.target.checked)} />Protect selections from Space and Enter</label>
    </div>, document.body)}
  </div>;
}
