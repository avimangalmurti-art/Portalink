function copyWithDocumentFallback(value: string) {
  const textArea = document.createElement('textarea');
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.setAttribute('aria-hidden', 'true');
  Object.assign(textArea.style, {
    position: 'fixed',
    inset: '0 auto auto -9999px',
    opacity: '0',
    pointerEvents: 'none',
  });
  // Keep the selection inside the active modal's focus boundary. Otherwise its
  // focus trap can steal selection before execCommand copies it.
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const host = activeElement?.closest<HTMLElement>('[role="dialog"]') ?? dialogs[dialogs.length - 1] ?? document.body;
  host.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, value.length);

  const didCopy = document.execCommand('copy');
  textArea.remove();

  if (selection && selectedRange) {
    selection.removeAllRanges();
    selection.addRange(selectedRange);
  }
  activeElement?.focus({ preventScroll: true });

  if (!didCopy) throw new Error('Clipboard copy was unavailable.');
}

export async function copyPublicLink(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some embedded browsers expose the API but reject permission at runtime.
    }
  }

  copyWithDocumentFallback(value);
}
