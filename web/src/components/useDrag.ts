import { useCallback, useEffect, useRef } from 'react';

export function useDrag(onMove: (dx: number, dy: number) => void) {
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
