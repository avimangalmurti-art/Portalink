import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Compact rendering never overwrites the navigation choice for a roomy window. */
export function useCompactNavigation(preferredCollapsed: boolean, onChange: (collapsed: boolean) => void) {
  const { pathname, search } = useLocation();
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 639px)').matches));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [pathname, search]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const sync = () => { setCompact(query.matches); setExpanded(false); };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return {
    collapsed: compact ? !expanded : preferredCollapsed,
    toggle: () => compact ? setExpanded((current) => !current) : onChange(!preferredCollapsed),
    closeCompact: () => setExpanded(false),
  };
}
