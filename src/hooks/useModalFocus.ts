import { useEffect, useRef, type RefObject } from 'react';

const layers: HTMLElement[] = [];
const dismissals = new WeakMap<HTMLElement, () => void>();
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** System Back uses the same topmost dismissal policy as Escape and Close. */
export function dismissTopModal(): Promise<unknown> | false {
  const dialog = [...layers].reverse().find(element => element.isConnected && element.getClientRects().length > 0 &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden');
  const dismiss = dialog && dismissals.get(dialog);
  return dismiss ? Promise.resolve(dismiss()) : false;
}

/** Shared keyboard lifecycle; dismissal policy still belongs to each editor. */
export function containModalFocus(dialog: HTMLElement, onEscape: () => void, preventScroll = false): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  layers.push(dialog);
  dismissals.set(dialog, onEscape);
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
