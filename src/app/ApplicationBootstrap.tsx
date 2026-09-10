import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { useAuth } from '../contexts/AuthContext';
import { buildPath, routes } from './routes';
import { PORTALINK_SPLASH_EXIT_EVENT } from './splashLifecycle';

const SHARED_VIEWER_PROFILE_KEY = 'portalink.sharedViewerProfileId';
const MINIMUM_SPLASH_MS = 420;

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
 * A short branded first frame prevents a flash while session restoration runs.
 * The application mounts behind it as soon as authentication is ready, and the
 * splash then crossfades away instead of adding a fixed one-second delay.
 */
export function ApplicationBootstrap() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [hasMinimumSplashTimeElapsed, setHasMinimumSplashTimeElapsed] = useState(false);
  const routeSharedProfileId = sharedProfileIdFromPath(pathname);
  const sessionSharedProfileId = readSharedViewerProfileId();
  // A newly opened public URL is authoritative, even after visiting another creator.
  const lockedSharedProfileId = auth.isAuthenticated ? null : routeSharedProfileId ?? sessionSharedProfileId;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasMinimumSplashTimeElapsed(true);
    }, MINIMUM_SPLASH_MS);

    return () => window.clearTimeout(timeoutId);
  }, []);

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

  if (!auth.isInitializing && auth.pendingView !== 'resetPassword' && lockedSharedProfileId && routeSharedProfileId !== lockedSharedProfileId) {
    return <Navigate replace to={buildPath('sharedProfile', { profileId: lockedSharedProfileId })} />;
  }

  const shouldShowSplash = auth.isInitializing || !hasMinimumSplashTimeElapsed;

  return <>
      {!auth.isInitializing ? <App /> : null}
      <AnimatePresence onExitComplete={() => {
        // The World view deliberately waits for this handoff before painting
        // its expensive cartography and blur layers. That keeps the full-screen
        // splash fade on the compositor instead of competing with globe work.
        window.dispatchEvent(new Event(PORTALINK_SPLASH_EXIT_EVENT));
      }}>
        {shouldShowSplash ? <PortalinkSplashLoader key="portalink-splash" /> : null}
      </AnimatePresence>
    </>;
}
