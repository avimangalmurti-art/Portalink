import { useEffect, useRef, type RefObject } from 'react';

const layers: HTMLElement[] = [];
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Shared keyboard lifecycle; dismissal policy still belongs to each editor. */
export function containModalFocus(dialog: HTMLElement, onEscape: () => void): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  layers.push(dialog);
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
    target.focus();
  };
  const onFocus = (event: FocusEvent) => {
    if (!isTop() || !(event.target instanceof HTMLElement)) return;
    if (dialog.contains(event.target)) {
      lastFocus = event.target;
    } else {
      const otherDialog = event.target.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
      // A new child may autofocus during commit, before its effect registers.
      // Registered parent dialogs must remain outside the active child's focus.
      if (!otherDialog || layers.includes(otherDialog)) focusInside();
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (!isTop() || event.defaultPrevented) return;
    if (event.key === 'Escape') {
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
        (event.shiftKey ? last ?? dialog : first ?? dialog).focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocus);
  if (!dialog.contains(document.activeElement)) dialog.focus();
  return () => {
    const wasTop = isTop();
    const index = layers.indexOf(dialog);
    if (index >= 0) layers.splice(index, 1);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocus);
    if (wasTop && opener?.isConnected) opener.focus();
  };
}

export function useModalFocus(open: boolean, dialogRef: RefObject<HTMLElement>, onEscape: () => void): void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    return containModalFocus(dialogRef.current, () => escapeRef.current());
  }, [open, dialogRef]);
}
