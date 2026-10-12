import { handleFromPath } from '../features/sharing/shareModel';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { LoadingState } from '../components/ui/StateViews';
import { useAuth } from '../contexts/AuthContext';
import { buildPath, routes } from './routes';
import { PORTALINK_SPLASH_EXIT_EVENT } from './splashLifecycle';
import { useViewportPresentation } from '../presentation/useViewportPresentation';

const SHARED_VIEWER_PROFILE_KEY = 'portalink.sharedViewerProfileId';

function sharedProfileIdFromPath(pathname: string): string | null {
  const collaboration = matchPath(routes.sharedCollaboration.path, pathname);
  if (collaboration?.params.profileId) return collaboration.params.profileId;

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
 * The returning mobile intro has a fixed budget; a slow session then uses a
 * loading state rather than extending the video or bypassing authentication.
 */
export function ApplicationBootstrap() {
  const auth = useAuth();
  const { pathname, search = '', hash = '' } = useLocation();
  const isHandleView = Boolean(handleFromPath(pathname));
  const isSharedView = isHandleView || /^\/share(?:\/|$)/i.test(pathname);
  const presentation = useViewportPresentation();
  // MOBILE public links own their entry and design even when opened from the
  // platform router. The worker/dev server selects share.html on this request.
  const usePublicEntry = isHandleView || (presentation === 'mobile' && isSharedView);
  useEffect(() => { if (usePublicEntry) window.location.replace(pathname + search + hash); }, [usePublicEntry, pathname, search, hash]);
  const [openingPresentation] = useState(presentation);
  const isAuthCallback = /[?#&](?:auth|code|token|access_token|refresh_token|provider_token|provider_refresh_token|token_hash|type|error|error_code|error_description)=/i.test(search + hash);
  const isRecovery = auth.pendingView === 'resetPassword' || Boolean(auth.session?.isPasswordRecovery);
  const isWelcomeInvite = pathname === '/' && new URLSearchParams(search).get('welcome') === '1' && !isAuthCallback && !isRecovery;
  const invitePresented = useRef(false);
  useEffect(() => {
    if (!isWelcomeInvite || auth.isInitializing || auth.isAuthenticated || invitePresented.current) return;
    invitePresented.current = true;
    auth.requestAuth('signUp');
  }, [isWelcomeInvite, auth]);
  // Only the opening mobile visit is a landing. Rotation or later navigation
  // cannot introduce it over an existing session, recovery flow or content.
  const [landingPath] = useState(() => presentation === 'mobile'
    && !isAuthCallback && pathname === '/' ? '/' : null);
  const [hasLeftLanding, setHasLeftLanding] = useState(false);
  const [hasPresentedLanding, setHasPresentedLanding] = useState(false);
  const [hasStartupCompleted, setHasStartupCompleted] = useState(isSharedView);
  const [hasSplashCompleted, setHasSplashCompleted] = useState(false);
  const completeSplash = useCallback(() => setHasSplashCompleted(true), []);
  const routeSharedProfileId = sharedProfileIdFromPath(pathname);
  const sessionSharedProfileId = isWelcomeInvite ? null : readSharedViewerProfileId();
  // A newly opened public URL is authoritative, even after visiting another creator.
  const lockedSharedProfileId = auth.isAuthenticated ? null : routeSharedProfileId ?? sessionSharedProfileId;
  const holdLanding = Boolean(!isSharedView && landingPath && !hasLeftLanding && presentation === 'mobile' && !auth.isInitializing && !auth.isAuthenticated && !isRecovery);

  useEffect(() => {
    // Public links open directly. Later navigation must not replay an intro
    // that this visit deliberately skipped, including after session refresh.
    if (isSharedView) {
      setHasStartupCompleted(true);
      setHasLeftLanding(true);
    }
  }, [isSharedView]);

  useEffect(() => {
    if (holdLanding) setHasPresentedLanding(true);
  }, [holdLanding]);

  useEffect(() => {
    if (auth.isAuthenticated || isRecovery || presentation !== 'mobile') setHasLeftLanding(true);
  }, [auth.isAuthenticated, isRecovery, presentation]);

  useEffect(() => {
    if (!auth.isInitializing && (hasSplashCompleted || hasPresentedLanding) && !holdLanding) setHasStartupCompleted(true);
  }, [auth.isInitializing, hasSplashCompleted, hasPresentedLanding, holdLanding]);

  const startAccount = (view: 'signIn' | 'signUp' | 'forgotPassword') => {
    auth.requestAuth(view);
  };

  useEffect(() => {
    try {
      if (auth.isAuthenticated || (isWelcomeInvite && !auth.isInitializing)) {
        window.sessionStorage.removeItem(SHARED_VIEWER_PROFILE_KEY);
      } else if (routeSharedProfileId && routeSharedProfileId !== sessionSharedProfileId) {
        window.sessionStorage.setItem(SHARED_VIEWER_PROFILE_KEY, routeSharedProfileId);
      }
    } catch {
      // Storage can be unavailable in strict privacy modes. The shared route
      // remains read-only even when the extra same-tab boundary cannot persist.
    }
  }, [auth.isAuthenticated, auth.isInitializing, isWelcomeInvite, routeSharedProfileId, sessionSharedProfileId]);

  const settingsPath = pathname.replace(/\/+$/, '');
  const isPublicSettings = settingsPath === routes.controlCenter.path || settingsPath === '/appearance';
  const shouldRedirect = !isHandleView && !isPublicSettings && !auth.isInitializing && auth.pendingView !== 'resetPassword' && lockedSharedProfileId && routeSharedProfileId !== lockedSharedProfileId;
  const timedIntroEnded = openingPresentation === 'mobile' && hasSplashCompleted && !holdLanding && !hasPresentedLanding && !isRecovery;

  return <>
      {usePublicEntry ? null : shouldRedirect ? <Navigate replace to={buildPath('sharedProfile', { profileId: lockedSharedProfileId! })} /> : !auth.isInitializing ? <App /> : null}
      <AnimatePresence onExitComplete={() => {
        // The World view deliberately waits for this handoff before painting
        // its expensive cartography and blur layers. That keeps the full-screen
        // splash fade on the compositor instead of competing with globe work.
        window.dispatchEvent(new Event(PORTALINK_SPLASH_EXIT_EVENT));
      }}>
        {!isSharedView && (!hasStartupCompleted || auth.isInitializing) && !timedIntroEnded ? <PortalinkSplashLoader key="portalink-splash" onComplete={completeSplash} stillOnly={hasStartupCompleted}
          timedIntro={openingPresentation === 'mobile' && !hasStartupCompleted && !hasPresentedLanding && !isRecovery && (auth.isInitializing || auth.isAuthenticated)}
          welcomeHandoff={hasPresentedLanding && auth.isAuthenticated}
          hidden={Boolean(landingPath && ((!auth.isAuthenticated && auth.pendingView) || isRecovery || (presentation !== 'mobile' && hasPresentedLanding)))}
          landing={holdLanding ? {
            ready: !auth.isInitializing,
            onCreateAccount: () => startAccount('signUp'),
            onSignIn: () => startAccount('signIn'),
            onForgotPassword: () => startAccount('forgotPassword'),
            onContinue: () => { setHasLeftLanding(true); if (!auth.isInitializing) setHasStartupCompleted(true); },
            continueLabel: 'Continue as guest',
          } : undefined} /> : null}
      </AnimatePresence>
      {(isSharedView || timedIntroEnded) && auth.isInitializing && <div data-presentation={presentation} className="portalink-startup-wait fixed inset-0 grid min-h-[100dvh] place-items-center bg-[var(--surface-canvas)]"><LoadingState label={isSharedView ? 'Opening shared content…' : 'Opening Portalink…'} /></div>}
    </>;
}
