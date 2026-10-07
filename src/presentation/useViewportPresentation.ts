import { useEffect, useState } from 'react';
import type { Presentation } from './usePresentation';

// Preserve the existing compact-navigation boundary, not a device-brand policy.
export const MOBILE_PRESENTATION_QUERY = '(max-width: 639px)';

function mediaQuery(): MediaQueryList | undefined {
  return typeof window === 'undefined' ? undefined : window.matchMedia?.(MOBILE_PRESENTATION_QUERY);
}

/** Canonical query for the app host and pre-shell startup; app descendants use context. */
export function useViewportPresentation(): Presentation {
  const [presentation, setPresentation] = useState<Presentation>(() => mediaQuery()?.matches ? 'mobile' : 'web');
  useEffect(() => {
    const query = mediaQuery();
    if (!query) return;
    const sync = () => setPresentation(query.matches ? 'mobile' : 'web');
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return presentation;
}
