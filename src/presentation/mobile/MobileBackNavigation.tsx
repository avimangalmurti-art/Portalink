import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { usePresentation } from '../usePresentation';
import { useMobileBackSwipe } from './useMobileBackSwipe';

type BackAction = () => void;
type BackNavigation = {
  back: BackAction;
  register: (action: BackAction) => () => void;
  registerSwipe: (action: BackAction) => () => void;
};
const BackContext = createContext<BackNavigation | null>(null);
const ScreenContext = createContext({ active: true, enabled: false });

export function useMobileScreenActive() { return useContext(ScreenContext).active; }

/** One dispatcher for the mobile sidebar; WEB continues using its page controls. */
export function MobileBackProvider({ onBack, children }: { onBack: BackAction; children: React.ReactNode }) {
  const isMobile = usePresentation() === 'mobile';
  const current = useRef<{ action: BackAction } | null>(null);
  const swipeActions = useRef<Array<{ action: BackAction }>>([]);
  const register = useCallback((action: BackAction) => {
    const entry = { action };
    current.current = entry;
    return () => { if (current.current === entry) current.current = null; };
  }, []);
  const registerSwipe = useCallback((action: BackAction) => {
    const entry = { action };
    swipeActions.current.push(entry);
    return () => { swipeActions.current = swipeActions.current.filter(item => item !== entry); };
  }, []);
  const back = useCallback(() => (current.current?.action ?? onBack)(), [onBack]);
  const swipeBack = useCallback(() => (swipeActions.current.at(-1)?.action ?? onBack)(), [onBack]);
  useMobileBackSwipe(isMobile, swipeBack);
  const navigation = useMemo(() => ({ back, register, registerSwipe }), [back, register, registerSwipe]);
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
    if (!navigation || !isMobile || !active || !action) return;
    const releaseSwipe = navigation.registerSwipe(action);
    const releaseBack = delegated ? navigation.register(action) : undefined;
    return () => { releaseSwipe(); releaseBack?.(); };
  }, [action, active, delegated, isMobile, navigation]);
  return delegated && !visibleOnMobile ? null : <>{children}</>;
}
