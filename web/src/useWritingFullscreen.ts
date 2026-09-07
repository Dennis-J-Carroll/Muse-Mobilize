import { useEffect, useRef, useState } from 'react';

/** Browser chrome is independent of Muse focus. Fullscreen the document so
 * body-portaled editors remain above the manuscript in the same fullscreen. */
export function useWritingFullscreen(active: boolean) {
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const ownsFullscreen = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const sync = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) ownsFullscreen.current = false;
    };
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      activeRef.current = false;
      if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!active && ownsFullscreen.current && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => setMessage('Use your browser fullscreen control to restore browser tabs.'));
    }
  }, [active]);

  const toggle = async () => {
    if (pending) return;
    setMessage('');
    setPending(true);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        ownsFullscreen.current = true;
        // A project/focus switch can happen while the browser is responding.
        if (!activeRef.current) await document.exitFullscreen();
      } else {
        setMessage('Browser fullscreen is unavailable here. Use your browser’s fullscreen menu; writing focus still works.');
      }
    } catch {
      setMessage('Browser fullscreen was blocked. Use your browser’s fullscreen menu; writing focus still works.');
    } finally {
      setPending(false);
    }
  };
  return { fullscreen, pending, message, toggle };
}
