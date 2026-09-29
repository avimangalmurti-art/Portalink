import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { usePresentation } from '../usePresentation';

type BackAction = () => void;
type BackNavigation = {
  back: BackAction;
  register: (action: BackAction) => () => void;
};
const BackContext = createContext<BackNavigation | null>(null);
const ScreenContext = createContext({ active: false, enabled: false });

/** One dispatcher for the mobile sidebar; WEB continues using its page controls. */
export function MobileBackProvider({ onBack, children }: { onBack: BackAction; children: React.ReactNode }) {
  const current = useRef<{ action: BackAction } | null>(null);
  const register = useCallback((action: BackAction) => {
    const entry = { action };
    current.current = entry;
    return () => { if (current.current === entry) current.current = null; };
  }, []);
  const back = useCallback(() => (current.current?.action ?? onBack)(), [onBack]);
  const navigation = useMemo(() => ({ back, register }), [back, register]);
  return <BackContext.Provider value={navigation}>{children}</BackContext.Provider>;
}

/** Outgoing transition snapshots and public websites cannot own sidebar Back. */
export function MobileBackScope({ active, enabled, children }: { active: boolean; enabled: boolean; children: React.ReactNode }) {
  const scope = useMemo(() => ({ active, enabled }), [active, enabled]);
  return <ScreenContext.Provider value={scope}>{children}</ScreenContext.Provider>;
}

export function useMobileBack(fallback: BackAction): BackAction {
  return useContext(BackContext)?.back ?? fallback;
}

/** Keep the original control outside the mobile app, delegate its action inside it. */
export function ScreenBack({ action, children, visibleOnMobile = false }: { action?: BackAction; children: React.ReactNode; visibleOnMobile?: boolean }) {
  const navigation = useContext(BackContext);
  const { active, enabled } = useContext(ScreenContext);
  const isMobile = usePresentation() === 'mobile';
  const delegated = Boolean(navigation && enabled && isMobile);
  useLayoutEffect(() => {
    if (delegated && active && action) return navigation?.register(action);
  }, [action, active, delegated, navigation]);
  return delegated && !visibleOnMobile ? null : <>{children}</>;
}
