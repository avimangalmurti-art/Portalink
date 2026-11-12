import { handleFromPath } from '../features/sharing/shareModel';
import { sharedSettingsPath } from '../features/sharing/sharedSettings';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { ProfessionalEntry } from '../components/auth/ProfessionalEntry';
import { ErrorState, LoadingState } from '../components/ui/StateViews';
import { useAuth } from '../contexts/AuthContext';
import { buildPath, routes } from './routes';
import { PORTALINK_SPLASH_EXIT_EVENT } from './splashLifecycle';
import { useViewportPresentation } from '../presentation/useViewportPresentation';
import { PresentationContext } from '../presentation/usePresentation';
import { warmScreenForPath } from './screenModules';
import { HOME_STARTUP_TIMEOUT_MS } from './homeStartup';
import { useMobileInstallCapture } from '../features/install/useMobileInstall';
import { useMobileResumeSession } from '../presentation/mobile/useMobileResumeSession';
import { MobileResumeProvider } from '../presentation/mobile/MobileResumeContext';

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
 * Restore the session alongside startup. Returning MOBILE accounts enter as
 * soon as authentication is ready; signed-out visitors see account choices.
 * WEB keeps its existing Home readiness checks without a required intro.
 */
export function ApplicationBootstrap() {
  const auth = useAuth();
  const { pathname, search = '', hash = '', key: locationKey, state: locationState } = useLocation();
  const isHandleView = Boolean(handleFromPath(pathname));
  const isSharedView = isHandleView || /^\/share(?:\/|$)/i.test(pathname);
  const isPublicSettings = pathname.replace(/\/+$/, '') === routes.controlCenter.path || pathname.replace(/\/+$/, '') === '/appearance';
  const presentation = useViewportPresentation();
  useMobileInstallCapture(presentation === 'mobile');
  // Public links own their entry on both presentations. Legacy Settings history
  // must rejoin that durable public address before the platform can mount.
  const legacyPublicSettings = isPublicSettings && locationState && typeof locationState === 'object'
    && 'settingsReturn' in locationState && typeof locationState.settingsReturn === 'string'
    ? sharedSettingsPath(locationState.settingsReturn, search) : undefined;
  const publicEntryPath = isSharedView ? pathname + search + hash : legacyPublicSettings;
  const usePublicEntry = Boolean(publicEntryPath);
  // Code has no account data: overlap the requested destination's download
  // with session restoration, while the normal auth gate still owns rendering.
  useEffect(() => { if (!usePublicEntry && (auth.isAuthenticated || isSharedView || isPublicSettings)) void warmScreenForPath(pathname); }, [usePublicEntry, pathname, auth.isAuthenticated, isSharedView, isPublicSettings]);
  useEffect(() => { if (publicEntryPath) window.location.replace(publicEntryPath); }, [publicEntryPath]);
  const [openingPresentation] = useState(presentation);
  const [openingPath] = useState(pathname);
  const oauthFailed = new URLSearchParams(search).get('entry') === 'oauth'
    && [search, hash].some(part => new URLSearchParams(part.slice(1)).has('error'));
  const isAuthCallback = !oauthFailed && /[?#&](?:auth|code|token|access_token|refresh_token|provider_token|provider_refresh_token|token_hash|type|error|error_code|error_description)=/i.test(search + hash);
  const isRecovery = auth.pendingView === 'resetPassword' || Boolean(auth.session?.isPasswordRecovery);
  const hasInviteLink = new URLSearchParams(search).get('welcome') === '1';
  const isWelcomeInvite = pathname === '/' && (hasInviteLink || oauthFailed) && !isAuthCallback && !isRecovery;
  const resumeBlocked = isAuthCallback || isRecovery || isWelcomeInvite || Boolean(auth.pendingView) || auth.isSessionUnavailable || auth.phase === 'authenticating' || auth.phase === 'signing-out';
  const accountId = auth.isAuthenticated ? auth.user?.id ?? null : null;
  const installedMobile = presentation === 'mobile' && document.documentElement?.hasAttribute('data-standalone');
  const plainHome = pathname === '/' && !search && !hash;
  const resume = useMobileResumeSession({ mobile: presentation === 'mobile', restoreOnLaunch: !installedMobile, accountId,
    authReady: !auth.isInitializing && !auth.isSessionUnavailable, pathname, search, hash, locationKey, blocked: resumeBlocked });
  const [homeOpening, setHomeOpening] = useState<'launch' | { accountId: string; from: string } | null>(() => installedMobile && plainHome ? 'launch' : null);
  const completeHomeOpening = useCallback(() => setHomeOpening(null), []);
  const canReopenHome = installedMobile && accountId !== null && !auth.isInitializing && !resumeBlocked && !usePublicEntry
    && pathname.replace(/\/+$/, '') !== routes.profileEditor?.path;
  const foregroundOpening = homeOpening && homeOpening !== 'launch' && homeOpening.accountId === accountId ? homeOpening : null;
  useEffect(() => {
    if (!canReopenHome || !accountId) return;
    // A new route or account (including a link opened while hidden) owns its entry.
    let wasHidden = false;
    // Returning from a file picker is also a visibility change. Keep the open form.
    const isAuthoring = () => Boolean(document.querySelector?.('[data-ui-modal-backdrop="authoring"], [data-mobile-publish]'));
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = !isAuthoring();
        return;
      }
      if (!wasHidden) return;
      wasHidden = false;
      if (!isAuthoring()) setHomeOpening({ accountId, from: locationKey });
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, [accountId, canReopenHome, locationKey]);
  useEffect(() => {
    if (homeOpening && homeOpening !== 'launch' && (!canReopenHome || !foregroundOpening || (!plainHome && foregroundOpening.from !== locationKey))) completeHomeOpening();
  }, [homeOpening, canReopenHome, foregroundOpening, plainHome, locationKey, completeHomeOpening]);
  // Signed-out visitors choose an account action. A prior public-view
  // context keeps its destination unless this is an explicit invitation.
  const [landingPath] = useState(() => (isWelcomeInvite || !readSharedViewerProfileId())
    && !isAuthCallback && !isRecovery && pathname === '/' ? '/' : null);
  const [hasLeftLanding, setHasLeftLanding] = useState(false);
  const [hasPresentedLanding, setHasPresentedLanding] = useState(false);
  // The installed Home intro starts in the document, independently of auth.
  const [hasInstalledHomeIntro] = useState(() => Boolean(installedMobile && plainHome
    && document.documentElement?.hasAttribute('data-installed-home-launch')));
  const [hasStartupCompleted, setHasStartupCompleted] = useState(isSharedView);
  const [hasSplashCompleted, setHasSplashCompleted] = useState(hasInstalledHomeIntro);
  const completeSplash = useCallback(() => setHasSplashCompleted(true), []);
  useEffect(() => {
    if (hasInstalledHomeIntro) document.getElementById('portalink-preboot')?.remove();
  }, [hasInstalledHomeIntro]);
  // Restored accounts on either presentation return directly to their work.
  const returningAccountReady = auth.isAuthenticated && !auth.isInitializing && !resumeBlocked && !hasPresentedLanding;
  const startupCompleted = hasStartupCompleted || returningAccountReady;
  useEffect(() => {
    if (!returningAccountReady) return;
    setHasSplashCompleted(true);
    const video = document.getElementById('portalink-preboot-video') as HTMLVideoElement | null;
    video?.dispatchEvent(new Event('portalink:splash-adopt'));
    video?.pause();
    document.getElementById('portalink-preboot')?.remove();
    window.dispatchEvent(new Event(PORTALINK_SPLASH_EXIT_EVENT));
  }, [returningAccountReady]);
  const routeSharedProfileId = sharedProfileIdFromPath(pathname);
  const sessionSharedProfileId = isWelcomeInvite ? null : readSharedViewerProfileId();
  // A newly opened public URL is authoritative, even after visiting another creator.
  const lockedSharedProfileId = auth.isAuthenticated ? null : routeSharedProfileId ?? sessionSharedProfileId;
  // Account entry also covers direct/legacy URLs and a session that signs out
  // after the initial welcome has completed. No ordinary guest screen exists.
  const holdLanding = Boolean(!isSharedView && !isPublicSettings && !isAuthCallback && !auth.isInitializing && !auth.isAuthenticated && !isRecovery);
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
  const shouldRedirect = pathname !== '/' && !isHandleView && !isPublicSettings && !auth.isInitializing && auth.pendingView !== 'resetPassword' && lockedSharedProfileId && routeSharedProfileId !== lockedSharedProfileId;
  const homeStartupTarget = auth.isAuthenticated && openingPresentation !== 'mobile' && openingPath === '/' && pathname === '/' && !isSharedView && !usePublicEntry && !shouldRedirect && !isRecovery && !auth.isSessionUnavailable;
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
    if (auth.isAuthenticated || isRecovery) setHasLeftLanding(true);
  }, [auth.isAuthenticated, isRecovery]);

  useEffect(() => {
    // Ready screens load beneath the splash while its complete intro plays.
    if (!auth.isInitializing && (hasSplashCompleted || hasPresentedLanding || returningAccountReady) && !holdLanding && (!homeStartupTarget || homeReady)) setHasStartupCompleted(true);
  }, [auth.isInitializing, hasSplashCompleted, hasPresentedLanding, holdLanding, homeStartupTarget, homeReady, returningAccountReady]);

  const startAccount = (view: 'signIn' | 'signUp' | 'forgotPassword') => {
    if (pathname !== '/' && !isSharedView && !isPublicSettings) {
      auth.requestAuthenticatedDestination({ kind: 'route', path: pathname + search + hash, label: 'continue' }, view);
    } else auth.requestAuth(view);
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

  const timedIntroEnded = openingPresentation === 'mobile' && (hasSplashCompleted || returningAccountReady) && (hasInstalledHomeIntro || !landingPath || hasLeftLanding) && !holdLanding && !isRecovery && !waitingForHome;
  // Keep speculative screen warming out of the opening clip. MOBILE readiness
  // reports may arrive underneath it, but cannot extend the video handoff.
  const appStartupPending = waitingForHome || (openingPresentation === 'mobile' && !hasSplashCompleted && !startupCompleted);

  return <>
      {usePublicEntry ? null : shouldRedirect ? <Navigate replace to={buildPath('sharedProfile', { profileId: lockedSharedProfileId! })} /> : resume.resumeTo ? <Navigate replace to={resume.resumeTo} /> : !auth.isInitializing ? <MobileResumeProvider enabled={presentation === 'mobile' && !resumeBlocked} accountId={accountId} record={resume.launchRecord}><App homeStartupPending={appStartupPending} homeStartupAttempt={homeAttempt} onHomeStartupReady={reportHomeContent} onHomeStartupShellReady={reportHomeShell}
        installedHomeOpening={canReopenHome && plainHome && (homeOpening === 'launch' || foregroundOpening) ? { refresh: Boolean(foregroundOpening), complete: completeHomeOpening } : null} /></MobileResumeProvider> : null}
      <AnimatePresence onExitComplete={() => {
        // The World view deliberately waits for this handoff before painting
        // its expensive cartography and blur layers. That keeps the full-screen
        // splash fade on the compositor instead of competing with globe work.
        window.dispatchEvent(new Event(PORTALINK_SPLASH_EXIT_EVENT));
      }}>
        {!isSharedView && (holdLanding || ((!startupCompleted || auth.isInitializing) && !timedIntroEnded && !showHomeRetry)) ? <PortalinkSplashLoader key={holdLanding || hasPresentedLanding ? 'portalink-account-entry' : 'portalink-splash'} onComplete={completeSplash} stillOnly={startupCompleted || (hasSplashCompleted && homeAttempt > 0 && !hasPresentedLanding)}
          timedIntro={openingPresentation === 'mobile' && !hasStartupCompleted && !hasPresentedLanding && !isRecovery}
          inviteOpening={isWelcomeInvite && hasInviteLink}
          welcomeHandoff={hasPresentedLanding && !holdLanding}
          hidden={Boolean((!auth.isAuthenticated && auth.pendingView) || isRecovery)}
          landing={holdLanding ? {
            ready: !auth.isInitializing,
            hideMedia: true,
            content: <PresentationContext.Provider value={presentation}><ProfessionalEntry ready={!auth.isInitializing} onCreate={() => startAccount('signUp')} onSignIn={() => startAccount('signIn')} /></PresentationContext.Provider>,
            onCreateAccount: () => startAccount('signUp'),
            onSignIn: () => startAccount('signIn'),
            onForgotPassword: () => startAccount('forgotPassword'),
          } : undefined} /> : null}
      </AnimatePresence>
      {(isSharedView || timedIntroEnded) && auth.isInitializing && <div data-presentation={presentation} className="portalink-startup-wait fixed inset-0 grid min-h-[100dvh] place-items-center bg-[var(--surface-canvas)]"><LoadingState label={isSharedView ? 'Opening shared content…' : 'Opening Portalink…'} /></div>}
      {showHomeRetry && <div data-home-startup-retry="" data-presentation={presentation} className="portalink-startup-wait fixed inset-0 z-[1000] grid min-h-[100dvh] place-items-center bg-[var(--surface-canvas)]"><ErrorState title="Home could not finish loading" description="Check your connection and try again." onRetry={retryHome} /></div>}
      {canReopenHome && !plainHome && foregroundOpening !== null && foregroundOpening.from === locationKey && <Navigate replace to={routes.home.path} />}
    </>;
}
