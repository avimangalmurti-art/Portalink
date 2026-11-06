import { useEffect, useRef } from 'react';

/** Follow the visible screen, including mobile browser chrome and keyboards. */
export function useDialogViewport<T extends HTMLElement = HTMLDivElement>(enabled = true, trackAuthoringKeyboard = false) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    const overlay = ref.current;
    if (!overlay) return;
    const viewport = window.visualViewport;
    const update = () => {
      overlay.style.setProperty('--dialog-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      overlay.style.setProperty('--dialog-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      if (trackAuthoringKeyboard && viewport && Math.abs(viewport.scale - 1) <= 0.01) {
        // Toolbars can resize or pan the visible viewport without opening the keyboard.
        overlay.toggleAttribute('data-authoring-keyboard-open', window.innerHeight - viewport.height >= 100);
      }
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (trackAuthoringKeyboard) overlay.removeAttribute('data-authoring-keyboard-open');
    };
  }, [enabled, trackAuthoringKeyboard]);
  return ref;
}
