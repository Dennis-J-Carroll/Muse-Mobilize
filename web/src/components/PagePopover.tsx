import { useEffect, useRef, useState } from 'react';
import { MEASURE_MAX, MEASURE_MIN, useWritingView } from '../writingView';

/** Fine-tune for the page. Room is left here for font size and line spacing later. */
export function PagePopover() {
  const measure = useWritingView((s) => s.measure);
  const guard = useWritingView((s) => s.guardSelection);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const value = typeof measure === 'number' ? measure : 72;
  return <div ref={root} className="page-popover-root" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-label="Page settings" aria-expanded={open} aria-haspopup="dialog"
      onPointerDown={(event) => event.preventDefault()} onClick={() => setOpen(!open)}>Page</button>
    {open && <div className="page-popover" role="group" aria-label="Page settings">
      <label>Width <output>{measure === 'full' ? 'Full' : measure === null ? 'Default' : `${value} characters`}</output>
        <input type="range" aria-label="Page width in characters" min={MEASURE_MIN} max={MEASURE_MAX} step={1} value={value}
          onChange={(event) => useWritingView.getState().setMeasure(Number(event.target.value))} /></label>
      <button type="button" className="linkish" onClick={() => useWritingView.getState().setMeasure(null)}>Reset to default</button>
      <p className="page-popover-note">Applies on wider screens; phones and narrow cards keep their own margins.</p>
      <label className="page-popover-check"><input type="checkbox" checked={guard}
        onChange={(event) => useWritingView.getState().setGuardSelection(event.target.checked)} />
        Protect selections from Space and Enter</label>
    </div>}
  </div>;
}
