import { useRef } from 'react';
import type { TimelineOrder } from '../citations/journeyCitations';

export type TimelineProjectSource = { order: TimelineOrder; anchor?: HTMLElement };
export type TimelineReturn = {
  order: TimelineOrder;
  anchor: string | undefined;
  anchorTop: number | undefined;
  top: number;
  left: number;
};

export function useDesktopTimelineReturn(scope: string, entryKey: string, enabled: boolean) {
  const memory = useRef({ scope, entries: new Map<string, TimelineReturn>() });
  if (memory.current.scope !== scope) memory.current = { scope, entries: new Map() };
  const { entries } = memory.current;
  return {
    origin: enabled ? entries.get(entryKey) : undefined,
    forget() { entries.delete(entryKey); },
    remember(source: TimelineProjectSource, main: HTMLElement | null) {
      if (!enabled || !main) return;
      const opener = source.anchor;
      const anchor = opener?.dataset.timelineProject;
      const anchorTop = opener && anchor ? opener.getBoundingClientRect().top - main.getBoundingClientRect().top : undefined;
      entries.delete(entryKey);
      entries.set(entryKey, { order: source.order, anchor, anchorTop, top: main.scrollTop, left: main.scrollLeft });
      const oldest = entries.keys().next().value;
      if (entries.size > 16 && oldest !== undefined) entries.delete(oldest);
    },
  };
}

/** Restore inside the active desktop viewport after its Timeline content has rendered. */
export function restoreDesktopTimeline(origin: TimelineReturn, root: HTMLElement) {
  const main = root.closest<HTMLElement>('.app-screen-layer > main');
  if (!main) return;
  const inputs = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
  let frame = 0, attempts = 0, stable = 0, stopped = false;
  const cancel = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    for (const input of inputs) window.removeEventListener(input, cancel, true);
  };
  const restore = () => {
    if (stopped || !root.isConnected) { cancel(); return; }
    if (!root.closest('[hidden], [inert], [aria-hidden="true"]')) {
      const opener = origin.anchor ? [...root.querySelectorAll<HTMLElement>('[data-timeline-project]')]
        .find(element => element.dataset.timelineProject === origin.anchor) : undefined;
      const target = opener && origin.anchorTop !== undefined
        ? main.scrollTop + opener.getBoundingClientRect().top - main.getBoundingClientRect().top - origin.anchorTop
        : origin.top;
      const top = Math.max(0, Math.min(target, main.scrollHeight - main.clientHeight));
      stable = Math.abs(main.scrollTop - top) < 1 ? stable + 1 : 0;
      main.scrollTo({ top, left: origin.left, behavior: 'instant' });
      if (stable >= 3) {
        (opener ?? main).focus({ preventScroll: true });
        cancel();
        return;
      }
    }
    if (++attempts >= 36) cancel();
    else frame = requestAnimationFrame(restore);
  };
  for (const input of inputs) window.addEventListener(input, cancel, { capture: true, passive: true });
  frame = requestAnimationFrame(restore);
  return cancel;
}
