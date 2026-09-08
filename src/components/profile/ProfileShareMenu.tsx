import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

type ProfileShareMenuProps = {
  shareUrl: string;
  onBeforeCopy?: () => Promise<void>;
};

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
  document.body.appendChild(textArea);
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

async function copyPublicLink(value: string) {
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

export function ProfileShareMenu({ shareUrl, onBeforeCopy }: ProfileShareMenuProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimerRef = useRef<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  function scheduleReset(delay: number) {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setCopyState('idle');
    }, delay);
  }

  async function copyLink() {
    if (isPreparing) return;
    setIsPreparing(true);
    setError(null);
    try {
      await onBeforeCopy?.();
      await copyPublicLink(shareUrl);
      setCopyState('copied');
      scheduleReset(1800);
    } catch (failure) {
      setCopyState('failed');
      setError(failure instanceof Error ? failure.message : 'The public link could not be copied. Please try again.');
      scheduleReset(2400);
    } finally {
      setIsPreparing(false);
    }
  }

  const label = isPreparing ? 'Preparing link…' : copyState === 'copied' ? 'Link copied' : copyState === 'failed' ? 'Copy failed' : 'Copy public link';
  return <div>
      <button type="button" data-semantic-action="share" data-copy-state={copyState} disabled={isPreparing} aria-busy={isPreparing} onClick={() => void copyLink()} aria-label={label} className={`side-panel-primary-control side-panel-control-row px-3 text-[11px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${copyState === 'copied' ? 'border-0 bg-transparent text-[var(--accent-text)] shadow-none hover:bg-transparent' : 'border border-[var(--hairline-strong)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)]'}`}>
        <InterfaceIcon icon={copyState === 'copied' ? CheckIcon : CopyIcon} size="sm" weight="medium" />
        <span aria-live="polite">{label}</span>
      </button>
      {error ? <p role="alert" className="mt-1 text-small text-[var(--text-secondary)]">{error}</p> : null}
    </div>;
}
