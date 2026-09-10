import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { useAuth } from '../contexts/AuthContext';
import { buildPath, routes } from './routes';
import { PORTALINK_SPLASH_EXIT_EVENT } from './splashLifecycle';

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
 * The short startup clip and session restoration run together. The application
 * mounts as soon as authentication is ready, then the splash crossfades once.
 */
export function ApplicationBootstrap() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [hasSplashMediaCompleted, setHasSplashMediaCompleted] = useState(false);
  const [hasStartupCompleted, setHasStartupCompleted] = useState(false);
  const completeSplashMedia = useCallback(() => setHasSplashMediaCompleted(true), []);
  const routeSharedProfileId = sharedProfileIdFromPath(pathname);
  const sessionSharedProfileId = readSharedViewerProfileId();
  // A newly opened public URL is authoritative, even after visiting another creator.
  const lockedSharedProfileId = auth.isAuthenticated ? null : routeSharedProfileId ?? sessionSharedProfileId;

  useEffect(() => {
    if (!auth.isInitializing && hasSplashMediaCompleted) setHasStartupCompleted(true);
  }, [auth.isInitializing, hasSplashMediaCompleted]);

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
        {!hasStartupCompleted || auth.isInitializing ? <PortalinkSplashLoader key="portalink-splash" onComplete={completeSplashMedia} stillOnly={hasStartupCompleted} /> : null}
      </AnimatePresence>
    </>;
}
