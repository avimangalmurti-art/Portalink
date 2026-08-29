import React, { useEffect, useState } from 'react';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { useAuth } from '../contexts/AuthContext';
import { buildPath, routes } from './routes';

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
 * A full page load holds the splash for one second, then it leaves as soon as
 * that minimum and the existing readiness state have both settled.
 */
export function ApplicationBootstrap() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [hasMinimumSplashTimeElapsed, setHasMinimumSplashTimeElapsed] = useState(false);
  const routeSharedProfileId = sharedProfileIdFromPath(pathname);
  const sessionSharedProfileId = readSharedViewerProfileId();
  const lockedSharedProfileId = auth.isAuthenticated ? null : sessionSharedProfileId ?? routeSharedProfileId;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasMinimumSplashTimeElapsed(true);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    try {
      if (auth.isAuthenticated) {
        window.sessionStorage.removeItem(SHARED_VIEWER_PROFILE_KEY);
      } else if (routeSharedProfileId && !sessionSharedProfileId) {
        window.sessionStorage.setItem(SHARED_VIEWER_PROFILE_KEY, routeSharedProfileId);
      }
    } catch {
      // Storage can be unavailable in strict privacy modes. The shared route
      // remains read-only even when the extra same-tab boundary cannot persist.
    }
  }, [auth.isAuthenticated, routeSharedProfileId, sessionSharedProfileId]);

  if (!auth.isInitializing && lockedSharedProfileId && routeSharedProfileId !== lockedSharedProfileId) {
    return <Navigate replace to={buildPath('sharedProfile', { profileId: lockedSharedProfileId })} />;
  }

  return auth.isInitializing || !hasMinimumSplashTimeElapsed ? <PortalinkSplashLoader /> : <App />;
}
