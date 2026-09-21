import { useEffect, useRef } from 'react';

/** Follow the visible screen, including mobile browser chrome and keyboards. */
export function useDialogViewport(enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const overlay = ref.current;
    if (!overlay) return;
    const viewport = window.visualViewport;
    const update = () => {
      overlay.style.setProperty('--dialog-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      overlay.style.setProperty('--dialog-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);
  return ref;
}
