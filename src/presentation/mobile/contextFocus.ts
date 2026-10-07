/** The dock and reader can exchange buttons without retaining a hidden opener. */
export function focusMobileContextButton(): HTMLButtonElement | null {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-context-button'))
    .find(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden') ?? null;
  button?.focus({ preventScroll: true });
  return button;
}
