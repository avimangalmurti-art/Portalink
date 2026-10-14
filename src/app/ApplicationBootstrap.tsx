import { handleFromPath } from '../features/sharing/shareModel';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { ErrorState, LoadingState } from '../components/ui/StateViews';
import { useAuth } from '../contexts/AuthContext';
import { buildPath, routes } from './routes';
import { PORTALINK_SPLASH_EXIT_EVENT } from './splashLifecycle';
import { useViewportPresentation } from '../presentation/useViewportPresentation';
import { warmScreenForPath } from './screenModules';
import { HOME_STARTUP_TIMEOUT_MS } from './homeStartup';

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
 * Restore the session before mounting account content beneath the full intro.
 * Opening Home also waits for its layout and visible artwork to be ready.
 * Other destinations retain their existing startup handoff.
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
  // Code has no account data: overlap the requested destination's download
  // with session restoration, while the normal auth gate still owns rendering.
  useEffect(() => { if (!usePublicEntry) void warmScreenForPath(pathname); }, [usePublicEntry, pathname]);
  useEffect(() => { if (usePublicEntry) window.location.replace(pathname + search + hash); }, [usePublicEntry, pathname, search, hash]);
  const [openingPresentation] = useState(presentation);
  const [openingPath] = useState(pathname);
  const isAuthCallback = /[?#&](?:auth|code|token|access_token|refresh_token|provider_token|provider_refresh_token|token_hash|type|error|error_code|error_description)=/i.test(search + hash);
  const isRecovery = auth.pendingView === 'resetPassword' || Boolean(auth.session?.isPasswordRecovery);
  const isWelcomeInvite = pathname === '/' && new URLSearchParams(search).get('welcome') === '1' && !isAuthCallback && !isRecovery;
  // Only the opening mobile visit is a landing. Rotation or later navigation
  // cannot introduce it over an existing session, recovery flow or content.
  const [landingPath] = useState(() => (presentation === 'mobile' || isWelcomeInvite)
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
  const holdLanding = Boolean(!isSharedView && landingPath && !hasLeftLanding && (presentation === 'mobile' || isWelcomeInvite) && !auth.isInitializing && !auth.isAuthenticated && !isRecovery);
  const [homeAttempt, setHomeAttempt] = useState(0);
  const homeScope = useMemo(() => ({ session: auth.session, account: auth.user?.id ?? null, attempt: homeAttempt }), [auth.session, auth.user?.id, homeAttempt]);
  const currentHomeScope = useRef(homeScope);
  currentHomeScope.current = homeScope;
  const [homeReadiness, setHomeReadiness] = useState<{ scope: typeof homeScope; content: boolean; shell: boolean } | null>(null);
  const [homeWaitExpired, setHomeWaitExpired] = useState<typeof homeScope | null>(null);
  const reportHomeReady = useCallback((part: 'content' | 'shell', ready: boolean) => {
    if (currentHomeScope.current !== homeScope) return;
    setHomeReadiness(previous => {
      if (previous?.scope === homeScope && previous[part] === ready) return previous;
      return { ...(previous?.scope === homeScope ? previous : { content: false, shell: false }), scope: homeScope, [part]: ready };
    });
  }, [homeScope]);
  const reportHomeContent = useCallback((ready: boolean) => reportHomeReady('content', ready), [reportHomeReady]);
  const reportHomeShell = useCallback((ready: boolean) => reportHomeReady('shell', ready), [reportHomeReady]);
  const homeReady = homeReadiness?.scope === homeScope && homeReadiness.content && homeReadiness.shell;
  const isPublicSettings = pathname.replace(/\/+$/, '') === routes.controlCenter.path || pathname.replace(/\/+$/, '') === '/appearance';
  const shouldRedirect = !isHandleView && !isPublicSettings && !auth.isInitializing && auth.pendingView !== 'resetPassword' && lockedSharedProfileId && routeSharedProfileId !== lockedSharedProfileId;
  const homeStartupTarget = openingPath === '/' && pathname === '/' && !isSharedView && !usePublicEntry && !shouldRedirect && !isRecovery && !auth.isSessionUnavailable;
  const waitingForHome = homeStartupTarget && !hasStartupCompleted && !homeReady;
  useEffect(() => {
    if (!waitingForHome || auth.isInitializing || holdLanding || auth.pendingView) return;
    const timer = window.setTimeout(() => {
      if (currentHomeScope.current === homeScope) setHomeWaitExpired(homeScope);
    }, HOME_STARTUP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForHome, auth.isInitializing, holdLanding, auth.pendingView, homeScope, homeAttempt]);
  const showHomeRetry = waitingForHome && homeWaitExpired === homeScope && !holdLanding && !auth.pendingView;
  const retryHome = () => {
    // Replace the reporting identity so a late completion from an older attempt cannot win.
    setHomeReadiness(null);
    setHomeWaitExpired(null);
    setHomeAttempt(attempt => attempt + 1);
  };

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
    if (auth.isAuthenticated || isRecovery || (presentation !== 'mobile' && !isWelcomeInvite)) setHasLeftLanding(true);
  }, [auth.isAuthenticated, isRecovery, presentation, isWelcomeInvite]);

  useEffect(() => {
    // Ready screens load beneath the splash while its complete intro plays.
    if (!auth.isInitializing && (hasSplashCompleted || hasPresentedLanding) && !holdLanding && (!homeStartupTarget || homeReady)) setHasStartupCompleted(true);
  }, [auth.isInitializing, hasSplashCompleted, hasPresentedLanding, holdLanding, homeStartupTarget, homeReady]);

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

  const timedIntroEnded = openingPresentation === 'mobile' && hasSplashCompleted && !holdLanding && !hasPresentedLanding && !isRecovery && !waitingForHome;

  return <>
      {usePublicEntry ? null : shouldRedirect ? <Navigate replace to={buildPath('sharedProfile', { profileId: lockedSharedProfileId! })} /> : !auth.isInitializing ? <App homeStartupPending={waitingForHome} homeStartupAttempt={homeAttempt} onHomeStartupReady={reportHomeContent} onHomeStartupShellReady={reportHomeShell} /> : null}
      <AnimatePresence onExitComplete={() => {
        // The World view deliberately waits for this handoff before painting
        // its expensive cartography and blur layers. That keeps the full-screen
        // splash fade on the compositor instead of competing with globe work.
        window.dispatchEvent(new Event(PORTALINK_SPLASH_EXIT_EVENT));
      }}>
        {!isSharedView && (!hasStartupCompleted || auth.isInitializing) && !timedIntroEnded && !showHomeRetry ? <PortalinkSplashLoader key="portalink-splash" onComplete={completeSplash} stillOnly={hasStartupCompleted || (hasSplashCompleted && homeAttempt > 0 && !hasPresentedLanding)}
          timedIntro={openingPresentation === 'mobile' && !hasStartupCompleted && !hasPresentedLanding && !isRecovery && (auth.isInitializing || auth.isAuthenticated)}
          welcomeHandoff={hasPresentedLanding && !holdLanding}
          hidden={Boolean(landingPath && ((!auth.isAuthenticated && auth.pendingView) || isRecovery || (presentation !== 'mobile' && !isWelcomeInvite && hasPresentedLanding)))}
          landing={holdLanding ? {
            ready: !auth.isInitializing,
            onCreateAccount: () => startAccount('signUp'),
            onSignIn: () => startAccount('signIn'),
            onForgotPassword: () => startAccount('forgotPassword'),
            onContinue: () => { setHasLeftLanding(true); if (!auth.isInitializing && (!homeStartupTarget || homeReady)) setHasStartupCompleted(true); },
            continueLabel: 'Continue as guest',
          } : undefined} /> : null}
      </AnimatePresence>
      {(isSharedView || timedIntroEnded) && auth.isInitializing && <div data-presentation={presentation} className="portalink-startup-wait fixed inset-0 grid min-h-[100dvh] place-items-center bg-[var(--surface-canvas)]"><LoadingState label={isSharedView ? 'Opening shared content…' : 'Opening Portalink…'} /></div>}
      {showHomeRetry && <div data-home-startup-retry="" data-presentation={presentation} className="portalink-startup-wait fixed inset-0 z-[1000] grid min-h-[100dvh] place-items-center bg-[var(--surface-canvas)]"><ErrorState title="Home could not finish loading" description="Check your connection and try again." onRetry={retryHome} /></div>}
    </>;
}
