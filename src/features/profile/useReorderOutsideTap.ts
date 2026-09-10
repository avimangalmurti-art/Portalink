import { useEffect, useRef, type RefObject } from 'react';

/** Only a fresh outside tap ends editing; a drag release or scroll never saves. */
export function useReorderOutsideTap(enabled: boolean, root: RefObject<HTMLElement>, onFinish: () => void) {
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    if (!enabled) return;
    let press: { x: number; y: number; eligible: boolean } | null = null;
    const excluded = (target: EventTarget | null) => !(target instanceof Element)
      || Boolean(target.closest('[data-project-preview-cell], [data-profile-reorder-controls], [role="dialog"]'));
    const down = (event: PointerEvent) => {
      press = { x: event.clientX, y: event.clientY, eligible: event.isPrimary && event.button === 0 && !excluded(event.target) };
    };
    const move = (event: PointerEvent) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.eligible = false;
    };
    const cancel = () => { press = null; };
    const click = (event: MouseEvent) => {
      const isTap = event.detail === 0 || press?.eligible;
      press = null;
      if (!isTap || excluded(event.target) || !root.current || root.current.closest('[inert], [aria-hidden="true"]')) return;
      // Consume this tap, including navigation links: saving finishes first.
      event.preventDefault();
      event.stopPropagation();
      finish.current();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('click', click, true);
    };
  }, [enabled, root]);
}
