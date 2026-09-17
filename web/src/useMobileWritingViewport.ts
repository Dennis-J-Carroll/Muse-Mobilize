import { useLayoutEffect, type RefObject } from 'react';

/** Mobile keyboards resize the visible viewport without necessarily changing
 * 100dvh. Keep the writing surface inside that space, including Safari's pan. */
export function useMobileWritingViewport(ref: RefObject<HTMLElement>, active: boolean) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const mobile = window.matchMedia('(max-width: 700px)');
    const viewport = window.visualViewport;
    const clear = () => {
      element.style.removeProperty('--writing-viewport-height');
      element.style.removeProperty('--writing-viewport-top');
    };
    const sync = () => {
      if (!mobile.matches || (viewport && viewport.scale !== 1)) { clear(); return; }
      element.style.setProperty('--writing-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      element.style.setProperty('--writing-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    sync();
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    mobile.addEventListener('change', sync);
    return () => {
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      mobile.removeEventListener('change', sync);
      clear();
    };
  }, [ref, active]);
}
