import { useCallback, useEffect, useRef } from 'react';

export function useDrag(onMove: (dx: number, dy: number) => void) {
  const origin = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const latestMove = useRef(onMove);
  latestMove.current = onMove;
  const down = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    document.body.classList.add('is-dragging');
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!origin.current || e.pointerId !== origin.current.pointerId) return;
      latestMove.current(e.clientX - origin.current.x, e.clientY - origin.current.y);
      origin.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    };
    const up = () => {
      if (!origin.current) return;
      origin.current = null;
      document.body.classList.remove('is-dragging');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      up();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, []);

  return down;
}
