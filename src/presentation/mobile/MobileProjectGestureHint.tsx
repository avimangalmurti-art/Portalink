import React, { useState } from 'react';

const storageKey = 'portalink:mobile-project-gestures:v1';

/** Teach the existing image/PDF gestures once; buttons remain the primary path. */
export function MobileProjectGestureHint() {
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem(storageKey) === 'dismissed'; } catch { return false; }
  });
  if (dismissed) return null;
  return <aside className="mobile-project-gesture-hint absolute inset-x-3 z-30 flex items-center gap-3 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-3 text-[14px] text-[var(--text-primary)] shadow-lg"
    style={{ top: 'calc(60px + var(--mobile-content-safe-top, 0px))' }} aria-label="Project gestures" data-project-reading-control="">
    <p className="min-w-0 flex-1">Double-tap an image or PDF page to focus it. Tap once to show or hide controls.</p>
    <button type="button" className="min-h-[44px] shrink-0 rounded-[10px] px-3 text-[var(--accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" onClick={() => {
      setDismissed(true);
      try { window.localStorage.setItem(storageKey, 'dismissed'); } catch { /* Dismissal still works for this view. */ }
    }}>Got it</button>
  </aside>;
}
