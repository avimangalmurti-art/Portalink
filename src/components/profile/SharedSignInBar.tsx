import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { readSharedReturnPath } from '../../features/auth/registration';
import './shared-sign-in-bar.css';

/** Public reading stays available; authentication starts only when requested. */
export function SharedSignInBar() {
  const auth = useAuth();
  const { pathname, search } = useLocation();
  const returnPath = readSharedReturnPath(pathname + search);
  if (!returnPath || auth.isInitializing || auth.isAuthenticated) return null;
  return <aside className="shared-sign-in-bar" data-shared-sign-in-bar="" aria-label="Portalink account">
    <span>You’re viewing shared work.</span>
    <button type="button" disabled={auth.phase === 'authenticating'} onClick={() => auth.requestAuthenticatedDestination({ kind: 'route', path: returnPath, label: 'return to this shared view' }, 'signIn')}>Sign in</button>
  </aside>;
}
