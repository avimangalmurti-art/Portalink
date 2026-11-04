import { useEffect, useRef, type RefObject } from 'react';

const layers: HTMLElement[] = [];
const dismissals = new WeakMap<HTMLElement, () => void>();
const modalSelector = ':is([role="dialog"], [role="alertdialog"], dialog[open])[aria-modal="true"]';
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function visibleLayer(layer: HTMLElement) {
  return layer.isConnected && layer.getClientRects().length > 0 &&
    !layer.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(layer).visibility !== 'hidden';
}

/** System Back uses the same topmost dismissal policy as Escape and Close. */
export function dismissTopModal(): Promise<unknown> | false {
  const dialog = [...layers].reverse().find(visibleLayer);
  const dismiss = dialog && dismissals.get(dialog);
  return dismiss ? Promise.resolve(dismiss()) : false;
}

/** Some mobile browsers still chain gestures past a locked document root. */
function containMobileModalScroll(dialog: HTMLElement): (() => void) | undefined {
  const modal = dialog.closest<HTMLElement>(modalSelector);
  const shell = modal?.closest<HTMLElement>('.codex-shell');
  if (!modal || !shell) return;

  let touch: { x: number; y: number } | null = null;
  const stopAtBoundary = (event: Event, delta: number) => {
    if (!event.cancelable || !shell.matches('[data-presentation="mobile"]')) return;
    const topLayer = [...layers].reverse().find(layer =>
      layer.closest(modalSelector) && visibleLayer(layer) && !layer.closest('.screen-exit'));
    if (topLayer !== dialog) return;

    for (const element of event.composedPath()) {
      if (!(element instanceof HTMLElement)) continue;
      if (!modal.contains(element)) break;
      const maxScroll = element.scrollHeight - element.clientHeight;
      if (maxScroll > 0 && /^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY) &&
        (delta < 0 ? element.scrollTop > 0 : element.scrollTop < maxScroll - 0.5)) return;
    }
    event.preventDefault();
  };
  const start = (event: TouchEvent) => {
    touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  };
  const move = (event: TouchEvent) => {
    const previous = touch;
    start(event);
    if (!previous || !touch || (window.visualViewport?.scale ?? 1) > 1.01) return;
    const delta = previous.y - touch.y;
    if (Math.abs(delta) > Math.abs(previous.x - touch.x)) stopAtBoundary(event, delta);
  };
  const end = () => { touch = null; };
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) stopAtBoundary(event, event.deltaY);
  };
  document.addEventListener('touchstart', start, { capture: true, passive: true });
  document.addEventListener('touchmove', move, { capture: true, passive: false });
  document.addEventListener('touchend', end, true);
  document.addEventListener('touchcancel', end, true);
  document.addEventListener('wheel', wheel, { capture: true, passive: false });
  return () => {
    document.removeEventListener('touchstart', start, true);
    document.removeEventListener('touchmove', move, true);
    document.removeEventListener('touchend', end, true);
    document.removeEventListener('touchcancel', end, true);
    document.removeEventListener('wheel', wheel, true);
  };
}

/** Shared keyboard lifecycle; dismissal policy still belongs to each editor. */
export function containModalFocus(dialog: HTMLElement, onEscape: () => void, preventScroll = false): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  layers.push(dialog);
  dismissals.set(dialog, onEscape);
  const releaseScroll = containMobileModalScroll(dialog);
  const isTop = () => layers[layers.length - 1] === dialog;
  const available = (element: HTMLElement) => !element.matches(':disabled') &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
  const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.tabIndex >= 0 && available(element));
  let lastFocus: HTMLElement = dialog;
  const focusInside = () => {
    if (!isTop()) return;
    const target = lastFocus.isConnected && dialog.contains(lastFocus) && available(lastFocus) ? lastFocus : controls()[0] ?? dialog;
    target.focus({ preventScroll });
  };
  const onFocus = (event: FocusEvent) => {
    if (!isTop() || !(event.target instanceof HTMLElement)) return;
    if (dialog.contains(event.target)) {
      lastFocus = event.target;
    } else {
      const otherDialog = event.target.closest<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
      // A new child may autofocus during commit, before its effect registers.
      // Registered parent dialogs must remain outside the active child's focus.
      if (!otherDialog || layers.includes(otherDialog)) focusInside();
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (!isTop() || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      // An expanded combobox consumes the first Escape to close its results.
      if (event.target instanceof HTMLElement && event.target.closest('[role="combobox"][aria-expanded="true"]')) return;
      // Let the active sortable's document listener cancel before dismissing its dialog.
      const sorting = event.target instanceof HTMLElement && event.target.closest('[data-mobile-reorder-activator][aria-pressed="true"]');
      if (sorting && dialog.contains(sorting)) return;
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    } else if (event.key === 'Tab') {
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !dialog.contains(active) || active === dialog || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last ?? dialog : first ?? dialog).focus({ preventScroll });
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocus);
  if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll });
  return () => {
    const wasTop = isTop();
    const index = layers.indexOf(dialog);
    if (index >= 0) layers.splice(index, 1);
    if (dismissals.get(dialog) === onEscape) dismissals.delete(dialog);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocus);
    releaseScroll?.();
    if (wasTop && opener?.isConnected) opener.focus({ preventScroll });
  };
}

export function useModalFocus(open: boolean, dialogRef: RefObject<HTMLElement>, onEscape: () => void, preventScroll = false): void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    return containModalFocus(dialogRef.current, () => escapeRef.current(), preventScroll);
  }, [open, dialogRef, preventScroll]);
}
