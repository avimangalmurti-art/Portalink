import { useLayoutEffect, useState, type RefObject } from 'react';

const editableSelector = 'input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="hidden"]):not([readonly]):not(:disabled), textarea:not([readonly]):not(:disabled), [contenteditable="true"]';

/** Detect the recipient keyboard from screen contraction, not input focus. */
export function useRecipientKeyboard(enabled: boolean, panelRef: RefObject<HTMLElement>): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) {
      setKeyboardOpen(false);
      return;
    }

    // Layout effects run before NewChatPanel's passive autofocus. Also inspect
    // activeElement below, because the input may already have been focused.
    let baseline = viewport.height;
    let width = window.innerWidth;
    let open = false;
    const editing = () => {
      const active = document.activeElement;
      return Boolean(active && panelRef.current?.contains(active) && active.matches(editableSelector));
    };
    const update = () => {
      // Pinch zoom contracts VisualViewport without opening a keyboard.
      if (Math.abs((viewport.scale ?? 1) - 1) > 0.01) return;
      const height = viewport.height;
      if (!Number.isFinite(height) || height <= 0) return;
      // Small browser/keyboard width adjustments are not an orientation change;
      // preserve the pre-keyboard height when innerHeight contracts with them.
      if (Math.abs(width - window.innerWidth) > 80) {
        width = window.innerWidth;
        baseline = Math.max(height, window.innerHeight);
      }
      baseline = Math.max(baseline, height);
      const focused = editing();
      const contraction = baseline - height;
      const threshold = open ? Math.max(100, baseline * 0.15) : Math.max(140, baseline * 0.2);
      // Keep an open keyboard latched through blur until its viewport recovers.
      // Conversely, recovery restores actions even if Safari keeps input focus.
      const next = (focused || open) && contraction >= threshold;
      if (next !== open) {
        open = next;
        setKeyboardOpen(next);
      }
      if (!focused && !open) baseline = height;
    };
    setKeyboardOpen(false);
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [enabled, panelRef]);
  return enabled && keyboardOpen;
}
