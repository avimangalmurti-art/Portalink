import React, { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { readSharedReturnPath } from '../../features/auth/registration';
import './shared-sign-in-bar.css';

/** Public reading stays available; authentication starts only when requested. */
const DISMISSED_KEY = 'portalink.sharedSignInDismissed';

export function SharedSignInBar({ name }: { name?: string }) {
  const auth = useAuth();
  const { pathname, search } = useLocation();
  const barRef = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return window.sessionStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  });
  const returnPath = readSharedReturnPath(pathname + search);
  const visible = Boolean(returnPath && name && !dismissed && !auth.isInitializing && !auth.isAuthenticated);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const shell = bar?.closest<HTMLElement>('.codex-shell');
    if (!visible || !bar || !shell) return;
    const measure = () => shell.style.setProperty('--shared-sign-in-height', `${bar.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => { observer.disconnect(); shell.style.removeProperty('--shared-sign-in-height'); };
  }, [visible]);
  if (!visible || !returnPath) return null;
  const requestAccount = (view: 'signIn' | 'signUp') => auth.requestAuthenticatedDestination(view === 'signIn' ? { kind: 'my-profile' } : { kind: 'route', path: returnPath, label: 'return to this shared view' }, view);
  const dismiss = () => {
    try { window.sessionStorage.setItem(DISMISSED_KEY, '1'); } catch { /* Still dismiss for this mounted visit. */ }
    setDismissed(true);
    document.querySelector<HTMLElement>('#app-viewport .app-screen-layer:not([aria-hidden="true"]) > main')?.focus({ preventScroll: true });
  };
  return <aside ref={barRef} className="shared-sign-in-bar" data-shared-sign-in-bar="" aria-label="Catalogue account options">
    <span className="shared-sign-in-identity">Viewing {name}'s catalogue</span>
    <span className="shared-sign-in-actions">
      <span aria-hidden="true">·</span>
      <button type="button" disabled={auth.phase === 'authenticating'} onClick={() => requestAccount('signIn')}>Sign in</button>
      <span aria-hidden="true">·</span>
      <button type="button" disabled={auth.phase === 'authenticating'} onClick={() => requestAccount('signUp')}>Create account</button>
    </span>
    <button type="button" className="shared-sign-in-dismiss" aria-label="Dismiss sign-in bar" onClick={dismiss}><span aria-hidden="true">×</span></button>
  </aside>;
}
