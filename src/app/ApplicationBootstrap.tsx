import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { useAuth } from '../contexts/AuthContext';
import { buildPath, routes } from './routes';
import { PORTALINK_SPLASH_EXIT_EVENT } from './splashLifecycle';
import { useViewportPresentation } from '../presentation/useViewportPresentation';
import { readSharedReturnPath } from '../features/auth/registration';

const SHARED_VIEWER_PROFILE_KEY = 'portalink.sharedViewerProfileId';

function sharedProfileIdFromPath(pathname: string): string | null {
  const project = matchPath(routes.sharedProject.path, pathname);
  if (project?.params.profileId) return project.params.profileId;

  const category = matchPath(routes.sharedProfileCategory.path, pathname);
  if (category?.params.profileId) return category.params.profileId;

  const profile = matchPath(routes.sharedProfile.path, pathname);
  return profile?.params.profileId ?? null;
}

function readSharedViewerProfileId(): string | null {
  try {
    return window.sessionStorage.getItem(SHARED_VIEWER_PROFILE_KEY);
  } catch {
    return null;
  }
}

/**
 * Session restoration is the application's real startup readiness boundary.
 * Mount ready content beneath the short intro so its data loads in parallel.
 * The loader bounds playback and releases immediately to a still on failure;
 * media never overrides the verified-session boundary.
 */
export function ApplicationBootstrap() {
  const auth = useAuth();
  const { pathname, search = '', hash = '' } = useLocation();
  const presentation = useViewportPresentation();
  // Only the opening mobile visit is a landing. Rotation or later navigation
  // cannot introduce it over an existing session, recovery flow or content.
  const [landingPath] = useState(() => presentation === 'mobile' && !hash
    && !/[?&](?:auth|code|token|token_hash|type|error)=/i.test(search)
    ? readSharedReturnPath(pathname + search) ?? (pathname === '/' ? '/' : null) : null);
  const [hasLeftLanding, setHasLeftLanding] = useState(false);
  const [hasStartupCompleted, setHasStartupCompleted] = useState(false);
  const [hasSplashCompleted, setHasSplashCompleted] = useState(false);
  const completeSplash = useCallback(() => setHasSplashCompleted(true), []);
  const routeSharedProfileId = sharedProfileIdFromPath(pathname);
  const sessionSharedProfileId = readSharedViewerProfileId();
  // A newly opened public URL is authoritative, even after visiting another creator.
  const lockedSharedProfileId = auth.isAuthenticated ? null : routeSharedProfileId ?? sessionSharedProfileId;
  const isRecovery = auth.pendingView === 'resetPassword' || Boolean(auth.session?.isPasswordRecovery);
  const holdLanding = Boolean(landingPath && !hasLeftLanding && presentation === 'mobile' && !auth.isAuthenticated && !isRecovery);

  useEffect(() => {
    if (auth.isAuthenticated || isRecovery || presentation !== 'mobile') setHasLeftLanding(true);
  }, [auth.isAuthenticated, isRecovery, presentation]);

  useEffect(() => {
    if (!auth.isInitializing && hasSplashCompleted && !holdLanding) setHasStartupCompleted(true);
  }, [auth.isInitializing, hasSplashCompleted, holdLanding]);

  const startAccount = (view: 'signIn' | 'signUp') => {
    if (landingPath && landingPath !== '/') auth.requestAuthenticatedDestination({ kind: 'route', path: landingPath, label: 'view shared content' }, view);
    else auth.requestAuth(view);
  };

  useEffect(() => {
    try {
      if (auth.isAuthenticated) {
        window.sessionStorage.removeItem(SHARED_VIEWER_PROFILE_KEY);
      } else if (routeSharedProfileId && routeSharedProfileId !== sessionSharedProfileId) {
        window.sessionStorage.setItem(SHARED_VIEWER_PROFILE_KEY, routeSharedProfileId);
      }
    } catch {
      // Storage can be unavailable in strict privacy modes. The shared route
      // remains read-only even when the extra same-tab boundary cannot persist.
    }
  }, [auth.isAuthenticated, routeSharedProfileId, sessionSharedProfileId]);

  const shouldRedirect = !auth.isInitializing && auth.pendingView !== 'resetPassword' && lockedSharedProfileId && routeSharedProfileId !== lockedSharedProfileId;

  return <>
      {shouldRedirect ? <Navigate replace to={buildPath('sharedProfile', { profileId: lockedSharedProfileId! })} /> : !auth.isInitializing ? <App /> : null}
      <AnimatePresence onExitComplete={() => {
        // The World view deliberately waits for this handoff before painting
        // its expensive cartography and blur layers. That keeps the full-screen
        // splash fade on the compositor instead of competing with globe work.
        window.dispatchEvent(new Event(PORTALINK_SPLASH_EXIT_EVENT));
      }}>
        {!hasStartupCompleted || auth.isInitializing ? <PortalinkSplashLoader key="portalink-splash" onComplete={completeSplash} stillOnly={hasStartupCompleted}
          hidden={Boolean(landingPath && (auth.pendingView || auth.isAuthenticated || isRecovery || presentation !== 'mobile'))}
          landing={holdLanding ? {
            ready: hasSplashCompleted && !auth.isInitializing,
            onCreateAccount: () => startAccount('signUp'),
            onSignIn: () => startAccount('signIn'),
            onContinue: () => { setHasLeftLanding(true); if (!auth.isInitializing) setHasStartupCompleted(true); },
            continueLabel: landingPath === '/' ? 'Continue as guest' : 'View shared content',
          } : undefined} /> : null}
      </AnimatePresence>
    </>;
}
