import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

type ProfileShareMenuProps = {
  shareUrl: string;
};

export function ProfileShareMenu({ shareUrl }: ProfileShareMenuProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimerRef = useRef<number | null>(null);

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
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
      scheduleReset(1800);
    } catch {
      setCopyState('failed');
      scheduleReset(2400);
    }
  }

  const label = copyState === 'copied' ? 'Link copied' : copyState === 'failed' ? 'Copy failed' : 'Copy public link';
  return <div>
      <button type="button" data-semantic-action="share" data-copy-state={copyState} onClick={() => void copyLink()} aria-label={label} className={`inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[11px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${copyState === 'copied' ? 'border-0 bg-transparent text-[var(--accent-text)] shadow-none hover:bg-transparent' : 'border border-[var(--hairline-strong)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)]'}`}>
        <InterfaceIcon icon={copyState === 'copied' ? CheckIcon : CopyIcon} size="sm" weight="medium" />
        <span aria-live="polite">{label}</span>
      </button>
    </div>;
}
