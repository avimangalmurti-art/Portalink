import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePresentation } from '../presentation/usePresentation';

/** Compact rendering never overwrites the navigation choice for a roomy window. */
export function useCompactNavigation(preferredCollapsed: boolean, onChange: (collapsed: boolean) => void) {
  const { pathname, search } = useLocation();
  const compact = usePresentation() === 'mobile';
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [pathname, search, compact]);
  return {
    collapsed: compact ? !expanded : preferredCollapsed,
    toggle: () => compact ? setExpanded((current) => !current) : onChange(!preferredCollapsed),
    closeCompact: () => setExpanded(false),
  };
}
