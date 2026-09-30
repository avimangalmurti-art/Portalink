import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppRoute, type AppRoute } from '../app/useAppRoute';
import { buildPath } from '../app/routes';
import { AppPresentation } from '../presentation/AppPresentation';
import { usePresentation } from '../presentation/usePresentation';
import { MobileBackProvider } from '../presentation/mobile/MobileBackNavigation';
import { SharedProfileSidebar } from '../components/profile/SharedProfileSidebar';
import { SharedSignInBar } from '../components/profile/SharedSignInBar';
import { DeferredDialog, DeferredSurface, DeferredSurfaceBoundary } from '../components/ui/DeferredDialog';
import { useSharedProfileQuery } from '../features/profile/useSharedProfileQuery';
import { useAuth } from '../contexts/AuthContext';
import { useDeviceAppearance } from '../hooks/useDeviceAppearance';
import { resolveAccentTokens } from '../utils/accentTokens';
import { resolveMacTokens } from '../utils/macTokens';
import { resolveNavButtonTokens } from '../data/navButtonTokens';
import { VisitorProfileGrid } from './VisitorProfileGrid';
import { canResumeRegistration, readSharedReturnPath } from '../features/auth/registration';
import { interactionIntent } from '../features/auth/interactionIntent';
import type { AuthIntent } from '../types/auth';
import '../app/screenTransitions.css';

const VisitorProjectPage = lazy(() => import('./VisitorProjectPage').then(module => ({ default: module.VisitorProjectPage })));
const AuthDialog = lazy(() => import('../features/auth/AuthDialog').then(module => ({ default: module.AuthDialog })));
const CollaborationPage = lazy(() => import('../components/profile/CollaborationPage').then(module => ({ default: module.CollaborationPage })));
const ControlCenterPage = lazy(() => import('../components/ControlCenterPage').then(module => ({ default: module.ControlCenterPage })));
const ProfileOnboardingDialog = lazy(() => import('../features/profile/ProfileOnboardingDialog').then(module => ({ default: module.ProfileOnboardingDialog })));
type SharedRoute = Extract<AppRoute, { kind: 'sharedProfile' | 'sharedCategory' | 'sharedProject' }>
  | { kind: 'sharedCollaboration'; profileId: string };
const isProfileId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Public reading starts alongside session restoration, never behind it. */
export function VisitorApp() {
  const route = useAppRoute(), location = useLocation(), navigate = useNavigate(), auth = useAuth();
  const presentation = usePresentation();
  const pageScroll = useRef(new Map<string, number>());
  useEffect(() => {
    if (presentation !== 'mobile') return;
    window.scrollTo({ top: pageScroll.current.get(location.pathname) ?? 0, behavior: 'auto' });
    const remember = () => pageScroll.current.set(location.pathname, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [presentation, location.pathname]);
  const appearance = useDeviceAppearance(presentation);
  const { theme, accentColor, systemGray, highContrast, reduceTranslucency } = appearance;
  const shared = route.kind === 'sharedProfile' || route.kind === 'sharedCategory' || route.kind === 'sharedProject' || route.kind === 'sharedCollaboration';
  const sharedShell = /^\/share(?:\/|$)/i.test(location.pathname);
  const lastSharedRoute = useRef<SharedRoute | null>(null);
  if (shared) lastSharedRoute.current = route as SharedRoute;
  const settingsReturn = readSharedReturnPath(location.state?.settingsReturn);
  const settings = route.kind === 'controlCenter' && Boolean(settingsReturn && lastSharedRoute.current);
  const readingRoute = shared ? route as SharedRoute : settings ? lastSharedRoute.current : null;
  const profileId = readingRoute?.profileId ?? null;
  const categoryId = readingRoute?.kind === 'sharedCategory' || readingRoute?.kind === 'sharedProject' ? readingRoute.categoryId : null;
  const projectId = readingRoute?.kind === 'sharedProject' ? readingRoute.projectId : null;
  const sharedPath = readSharedReturnPath(shared ? location.pathname + location.search : settingsReturn);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const deferredIntent = useRef<AuthIntent | null>(null);
  const interactiveSignIn = useRef(false), resumedRegistration = useRef<string | null>(null);
  const invalidShared = !settings && sharedShell && (!shared || !profileId || !isProfileId(profileId));
  const query = useSharedProfileQuery(invalidShared ? null : profileId, projectId, categoryId);
  const profile = query.profile, project = profile?.projects.find(item => item.id === projectId && item.categoryId === categoryId);
  const back = () => {
    if (settings && settingsReturn) { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate(settingsReturn, { replace: true }); return; }
    if (profileId) navigate(buildPath(projectId ? 'sharedProfileCategory' : 'sharedProfile', { profileId, categoryId: categoryId ?? '' }));
  };
  useEffect(() => {
    if (!sharedShell && !settings) window.location.replace(location.pathname + location.search + location.hash);
  }, [sharedShell, settings, location.pathname, location.search, location.hash]);
  useEffect(() => {
    document.documentElement.dataset.sharedView = '';
    document.documentElement.dataset.appearance = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('high-contrast', highContrast);
    document.body.classList.toggle('reduce-translucency', reduceTranslucency);
  }, [theme, highContrast, reduceTranslucency]);
  useEffect(() => {
    document.title = settings ? 'Settings | Portalink' : profile ? project ? `${project.title} — ${profile.name} | Portalink` : `${profile.name} — Portfolio | Portalink` : 'Shared portfolio | Portalink';
  }, [profile, project, settings]);
  const fulfilIntent = useCallback((intent: AuthIntent | null) => {
    if (!intent || intent.kind === 'interaction') return;
    const path = intent.kind === 'route' ? intent.path
      : intent.kind === 'messages' ? `${buildPath('messages')}${intent.recipientProfileId ? `?recipient=${encodeURIComponent(intent.recipientProfileId)}` : ''}`
      : intent.kind === 'studio' || intent.kind === 'create-project' ? buildPath('studio')
      : intent.kind === 'my-profile' ? auth.viewerProfileId ? buildPath('profile', { profileId: auth.viewerProfileId }) : null
      : intent.kind === 'view-portfolio' && intent.categoryId ? buildPath('profileCategory', { profileId: intent.profileId, categoryId: intent.categoryId })
      : buildPath('profile', { profileId: intent.profileId });
    if (!path || !path.startsWith('/') || path.startsWith('//')) return;
    if (readSharedReturnPath(path)) navigate(path, { replace: true });
    else window.location.assign(path);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#app-viewport main')?.focus({ preventScroll: true }));
  }, [auth.viewerProfileId, navigate]);
  useEffect(() => {
    if (auth.phase === 'authenticating') { interactiveSignIn.current = true; return; }
    if (!auth.isAuthenticated) {
      interactiveSignIn.current = false;
      if (auth.phase === 'unauthenticated') { setOnboardingOpen(false); resumedRegistration.current = null; }
      return;
    }
    if (auth.session?.isPasswordRecovery || auth.pendingView === 'resetPassword' || auth.pendingView === 'forgotPassword') return;
    const registrationId = auth.user?.registration?.id;
    const resume = registrationId && resumedRegistration.current !== registrationId && canResumeRegistration(auth.session, auth.pendingView);
    const signedIn = interactiveSignIn.current || Boolean(auth.peekPendingIntent());
    interactiveSignIn.current = false;
    if (resume || (signedIn && auth.needsProfileSetup)) {
      if (registrationId) resumedRegistration.current = registrationId;
      const returnPath = readSharedReturnPath(auth.user?.registration?.returnPath) ?? sharedPath;
      deferredIntent.current = auth.consumePendingIntent() ?? (returnPath ? { kind: 'route', path: returnPath, label: 'view shared content' } : null);
      setOnboardingOpen(true);
      if (auth.pendingView) auth.closeAuth();
    } else if (signedIn && !onboardingOpen) fulfilIntent(auth.consumePendingIntent());
  }, [auth, sharedPath, onboardingOpen, fulfilIntent]);
  const openMessages = () => {
    if (!auth.isAuthenticated) { auth.requestAuthenticatedDestination(interactionIntent('message this creator', sharedPath)); return; }
    const intent: AuthIntent = { kind: 'messages', ...(profile && profile.id !== auth.viewerProfileId ? { recipientProfileId: profile.id } : {}) };
    if (auth.needsProfileSetup) { deferredIntent.current = intent; setOnboardingOpen(true); }
    else fulfilIntent(intent);
  };
  const openOwnProfile = () => {
    if (!auth.isAuthenticated) { auth.requestAuthenticatedDestination({ kind: 'my-profile' }); return; }
    if (auth.needsProfileSetup) { deferredIntent.current = { kind: 'my-profile' }; setOnboardingOpen(true); }
    else fulfilIntent({ kind: 'my-profile' });
  };
  const style = useMemo(() => ({ '--accent-color': accentColor, ...resolveAccentTokens(accentColor, theme),
    ...resolveNavButtonTokens(theme, accentColor, highContrast, reduceTranslucency, systemGray), ...resolveMacTokens(accentColor, theme),
  }) as React.CSSProperties, [accentColor, theme, highContrast, reduceTranslucency, systemGray]);
  const openProject = (category: string, id: string) => { if (profileId) navigate(buildPath('sharedProject', { profileId, categoryId: category, projectId: id })); };
  const pending = <p role="status" className="p-5 text-[var(--text-secondary)]">Opening shared content…</p>;
  return <AppPresentation data-layout-mode="adaptive" style={style} className={`app-shell codex-shell ps-platform-ui accent-theme monochrome-ui shared-portalink-shell theme-${theme} ${highContrast ? 'high-contrast' : ''} ${reduceTranslucency ? 'reduce-translucency' : ''} app-typeface flex h-screen min-h-0 w-full overflow-hidden bg-[var(--mac-window-bg)] text-[var(--mac-label-primary)] antialiased`}>
    <MobileBackProvider onBack={back}>
      {profile && <SharedProfileSidebar profile={profile} activeCategoryId={categoryId} theme={theme} onThemeChange={appearance.chooseMode}
        onOpenCategory={id => navigate(buildPath('sharedProfileCategory', { profileId: profile.id, categoryId: id }))}
        onSettingsOpen={() => { if (!settings && sharedPath) navigate(buildPath('controlCenter'), { state: { settingsReturn: sharedPath } }); }} />}
      <div className="codex-workspace flex min-w-0 flex-1 basis-0 flex-col">
        <SharedSignInBar name={profile?.name} />
        <div id="app-viewport">
          <div className="app-screen-layer h-full min-h-0">
            <main tabIndex={-1} aria-label={settings ? 'Settings' : profile ? `${profile.name} shared portfolio` : 'Shared portfolio'} className={`min-h-0 h-full w-full ${projectId && !settings ? 'overflow-hidden' : 'overflow-y-auto'}`}>
              <div data-screen-scroll={projectId && !settings ? 'nested' : 'page'} className={`feed-starfield min-h-full ${projectId && !settings ? 'h-full' : ''}`}>
                <DeferredSurfaceBoundary active onClose={back} resetKey={location.pathname}>
                  <Suspense fallback={pending}>
                    {settings ? <ControlCenterPage theme={theme} appearanceMode={appearance.mode} onAppearanceModeChange={appearance.chooseMode}
                      systemGray={systemGray} onSystemGrayChange={value => appearance.chooseAppearance({ systemGray: value })}
                      accentColor={accentColor} onAccentColorChange={value => appearance.chooseAppearance({ accentColor: value })}
                      highContrast={highContrast} onHighContrastChange={value => appearance.chooseAppearance({ highContrast: value })}
                      reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={value => appearance.chooseAppearance({ reduceTranslucency: value })}
                      onBack={back} onOpenProfile={openOwnProfile} />
                      : invalidShared ? <p role="alert" className="p-5">This shared page could not be found.</p>
                      : query.status === 'loading' || query.status === 'idle' ? pending : !profile ? <div className="p-5"><p role="alert">{query.error || 'This portfolio could not be found.'}</p>{query.status === 'error' && <button type="button" onClick={query.retry}>Try again</button>}</div>
                      : projectId ? project ? <VisitorProjectPage key={project.id} profile={profile} project={project} onBack={back}
                        onBackToProfile={() => navigate(buildPath('sharedProfile', { profileId: profile.id }))} onSelect={id => openProject(project.categoryId, id)} /> : <p className="p-5">This project could not be found.</p>
                      : route.kind === 'sharedCollaboration' ? <CollaborationPage profile={profile} onBack={back} />
                      : categoryId && !profile.categories.some(item => item.id === categoryId) ? <p className="p-5">This portal could not be found.</p>
                      : <VisitorProfileGrid key={`${profile.id}/${categoryId ?? ''}`} profile={profile} categoryId={categoryId} onOpen={openProject} onBack={back} onMessage={openMessages}
                        onCollaboration={() => presentation === 'mobile' ? navigate(buildPath('sharedCollaboration', { profileId: profile.id })) : openMessages()} />}
                  </Suspense>
                </DeferredSurfaceBoundary>
              </div>
            </main>
          </div>
        </div>
      </div>
      <DeferredDialog active={Boolean(auth.pendingView) && (!onboardingOpen || auth.pendingView === 'resetPassword' || Boolean(auth.session?.isPasswordRecovery))} onClose={auth.closeAuth}>
        <AuthDialog showWelcomeMedia={false} registrationReturnPath={sharedPath} theme={theme} systemGray={systemGray}
          onSystemGrayChange={value => appearance.chooseAppearance({ systemGray: value })} accentColor={accentColor}
          onAccentColorChange={value => appearance.chooseAppearance({ accentColor: value })} highContrast={highContrast}
          onHighContrastChange={value => appearance.chooseAppearance({ highContrast: value })} reduceTranslucency={reduceTranslucency}
          onReduceTranslucencyChange={value => appearance.chooseAppearance({ reduceTranslucency: value })} />
      </DeferredDialog>
      {onboardingOpen && auth.isAuthenticated && !auth.session?.isPasswordRecovery && auth.pendingView !== 'resetPassword' && <DeferredSurface active onClose={() => { setOnboardingOpen(false); deferredIntent.current = null; }}>
        <ProfileOnboardingDialog key={auth.user?.id} isOpen theme={theme} systemGray={systemGray}
          onSystemGrayChange={value => appearance.chooseAppearance({ systemGray: value })} accentColor={accentColor}
          onAccentColorChange={value => appearance.chooseAppearance({ accentColor: value })} highContrast={highContrast}
          onHighContrastChange={value => appearance.chooseAppearance({ highContrast: value })} reduceTranslucency={reduceTranslucency}
          onReduceTranslucencyChange={value => appearance.chooseAppearance({ reduceTranslucency: value })}
          completionActionLabel={deferredIntent.current?.kind === 'messages' ? 'Continue to messages' : 'Return to portfolio'}
          onDismiss={() => { setOnboardingOpen(false); deferredIntent.current = null; }}
          onComplete={id => { setOnboardingOpen(false); const intent = deferredIntent.current; deferredIntent.current = null;
            if (intent?.kind === 'my-profile') window.location.assign(buildPath('profile', { profileId: id })); else fulfilIntent(intent);
          }} />
      </DeferredSurface>}
    </MobileBackProvider>
  </AppPresentation>;
}
