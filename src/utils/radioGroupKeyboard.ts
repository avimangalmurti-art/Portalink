import type { KeyboardEvent } from 'react';

/** Native-like keyboard selection for the existing custom visual radio controls. */
export function handleRadioGroupKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  const group = event.currentTarget;
  const items = Array.from(group.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)'))
    .filter(item => item.closest('[role="radiogroup"]') === group && item.getAttribute('aria-disabled') !== 'true' && !item.closest('[hidden],[inert],[aria-hidden="true"]'));
  const index = items.findIndex(item => item === document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const rtl = getComputedStyle(group).direction === 'rtl';
  const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : (rtl ? -1 : 1);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + delta + items.length) % items.length;
  items[next].focus({ preventScroll: true });
  items[next].click();
}
