import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DeferredDialog } from '../components/ui/DeferredDialog';
import { SessionStatusBanner } from '../features/auth/SessionStatusBanner';
import { useDeviceAppearance } from '../hooks/useDeviceAppearance';
import { AppPresentation } from '../presentation/AppPresentation';
import { usePresentation } from '../presentation/usePresentation';
import { resolveAccentTokens } from '../utils/accentTokens';
import { resolveMacTokens } from '../utils/macTokens';
import { resolveNavButtonTokens } from '../data/navButtonTokens';
import { describeRoute, useAppRoute } from './useAppRoute';

const AuthDialog = React.lazy(() => import('../features/auth/AuthDialog').then(module => ({ default: module.AuthDialog })));

/** Account forms can open without mounting feeds, directories or the app shell. */
function AccountEntryHost() {
  const auth = useAuth();
  const presentation = usePresentation();
  const { theme, accentColor, systemGray, highContrast, reduceTranslucency, chooseAppearance } = useDeviceAppearance(presentation);
  useEffect(() => {
    document.documentElement.dataset.appearance = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('high-contrast', highContrast);
    document.body.classList.toggle('reduce-translucency', reduceTranslucency);
  }, [theme, highContrast, reduceTranslucency]);
  return <AppPresentation data-account-entry-only="" showFloatingActions={false}
    className={`app-shell codex-shell min-h-[100dvh] bg-[var(--surface-canvas)] text-[var(--text-primary)] theme-${theme}${highContrast ? ' high-contrast' : ''}${reduceTranslucency ? ' reduce-translucency' : ''}`}
    style={{ ...resolveAccentTokens(accentColor, theme), ...resolveNavButtonTokens(theme, accentColor, highContrast, reduceTranslucency, systemGray), ...resolveMacTokens(accentColor, theme) }}>
    <SessionStatusBanner onCreateProfile={() => auth.requestAuth('signUp')} />
    <DeferredDialog active={Boolean(auth.pendingView)} onClose={auth.closeAuth}>
      <AuthDialog theme={theme} systemGray={systemGray} onSystemGrayChange={value => chooseAppearance({ systemGray: value })}
        accentColor={accentColor} onAccentColorChange={value => chooseAppearance({ accentColor: value })}
        highContrast={highContrast} onHighContrastChange={value => chooseAppearance({ highContrast: value })}
        reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={value => chooseAppearance({ reduceTranslucency: value })} />
    </DeferredDialog>
  </AppPresentation>;
}

export function AccountEntryBoundary({ children }: { children: (interactiveSignIn: boolean) => React.ReactNode }) {
  const auth = useAuth();
  const route = useAppRoute();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const wasAuthenticated = useRef(auth.isAuthenticated);
  const interactiveSignIn = useRef(false);
  if (auth.phase === 'authenticating') interactiveSignIn.current = true;
  const publicRoute = route.kind === 'sharedProfile' || route.kind === 'sharedCategory' || route.kind === 'sharedProject'
    || route.kind === 'sharedCollaboration' || route.kind === 'controlCenter';
  const blocked = !auth.isAuthenticated && !publicRoute;
  const recovery = auth.pendingView === 'resetPassword' || Boolean(auth.session?.isPasswordRecovery);
  const signingOut = blocked && wasAuthenticated.current && auth.phase !== 'authenticating';
  useEffect(() => {
    if (!auth.isAuthenticated && !auth.pendingView && auth.phase !== 'authenticating') interactiveSignIn.current = false;
  }, [auth.isAuthenticated, auth.pendingView, auth.phase]);
  useEffect(() => {
    if (signingOut) {
      wasAuthenticated.current = false;
      interactiveSignIn.current = false;
      navigate('/', { replace: true });
      return;
    }
    if (auth.isAuthenticated) { wasAuthenticated.current = true; interactiveSignIn.current = false; return; }
    if (!blocked || route.kind === 'home' || auth.isInitializing || auth.isSessionUnavailable || recovery
      || auth.pendingView || auth.phase === 'authenticating' || auth.phase === 'signing-out') return;
    auth.requestAuthenticatedDestination({ kind: 'route', path: pathname + search + hash, label: describeRoute(route) });
    // Ask once for a requested destination. Cancelling returns to account entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, pathname, search, hash, auth.isAuthenticated, auth.isInitializing, auth.isSessionUnavailable, auth.phase, recovery, signingOut, navigate]);
  return blocked ? <AccountEntryHost /> : children(interactiveSignIn.current);
}
