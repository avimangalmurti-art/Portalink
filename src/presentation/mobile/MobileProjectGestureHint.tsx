import React, { useState } from 'react';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useMobileScreenActive } from './MobileBackNavigation';

const storageKey = 'portalink:mobile-project-gestures:v1';

/** Teach the existing image/PDF gestures once; buttons remain the primary path. */
export function MobileProjectGestureHint() {
  const active = useMobileScreenActive();
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem(storageKey) === 'dismissed'; } catch { return false; }
  });
  if (dismissed || !active) return null;
  return <ModalPortal><aside className="mobile-project-gesture-hint shape-squircle fixed z-[90] flex min-h-[240px] flex-col justify-center gap-5 border border-[var(--hairline)] bg-[var(--surface-raised)] p-6 text-[14px] leading-relaxed text-[var(--text-primary)] shadow-[var(--shadow-pop)]"
    style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(320px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }} aria-label="Project gestures" data-project-reading-control="">
    <p className="min-w-0">Spread two fingers on an image or PDF page to focus and zoom. Tap once to show or hide controls.</p>
    <button type="button" className="min-h-[44px] shrink-0 rounded-[10px] px-3 text-[var(--accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" onClick={() => {
      setDismissed(true);
      try { window.localStorage.setItem(storageKey, 'dismissed'); } catch { /* Dismissal still works for this view. */ }
    }}>Got it</button>
  </aside></ModalPortal>;
}
