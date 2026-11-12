import { LoadingSkeleton } from '../components/ui/StateViews';
import { RouteError, routeErrorKind } from '../components/ui/RouteError';
import { SharedPortalPopup } from './mobile/SharedPortalPopup';
import { handleFromPath, isPublicSharePath, portfolioPath, portfolioProjectPath } from '../features/sharing/shareModel';
import { sharedSettingsPath, sharedSettingsReturnPath } from '../features/sharing/sharedSettings';
import { useHandleRoute } from './useHandleRoute';
import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppRoute, type AppRoute } from '../app/useAppRoute';
import { buildPath } from '../app/routes';
import { AppPresentation } from '../presentation/AppPresentation';
import { usePresentation } from '../presentation/usePresentation';
import { MobileBackProvider } from '../presentation/mobile/MobileBackNavigation';
import { SharedProfileSidebar } from '../components/profile/SharedProfileSidebar';
import { DeferredDialog, DeferredSurface, DeferredSurfaceBoundary } from '../components/ui/DeferredDialog';
import { useSharedProfileQuery } from '../features/profile/useSharedProfileQuery';
import { useAuth } from '../contexts/AuthContext';
import { useDeviceAppearance } from '../hooks/useDeviceAppearance';
import { resolveAccentTokens } from '../utils/accentTokens';
import { resolveMacTokens } from '../utils/macTokens';
import { resolveNavButtonTokens } from '../data/navButtonTokens';
import { VisitorProfileGrid } from './VisitorProfileGrid';
import { usePrepareProfileAudio } from '../components/profile/usePrepareProfileAudio';
import { useMobileProjectReturn } from './useMobileProjectReturn';
import type { Profile } from '../types/domain';
import type { PortalProjectBrowsing } from '../components/profile/portalProjectBrowsing';
import { PublicActionSheet } from './mobile/PublicActionSheet';
import { canResumeRegistration, readSharedReturnPath } from '../features/auth/registration';
import { interactionIntent } from '../features/auth/interactionIntent';
import type { AuthIntent } from '../types/auth';
import { loadVisitorProjectPage } from '../app/screenModules';
import { captureCatalogueReaderOrigin, restoreCatalogueReaderOrigin, withCataloguePageTarget, type CatalogueReaderOrigin } from '../features/profile/cataloguePageNavigation';
import '../app/screenTransitions.css';

const VisitorProjectPage = lazy(loadVisitorProjectPage);
const AuthDialog = lazy(() => import('../features/auth/AuthDialog').then(module => ({ default: module.AuthDialog })));
const CollaborationPage = lazy(() => import('../components/profile/CollaborationPage').then(module => ({ default: module.CollaborationPage })));
const ControlCenterPage = lazy(() => import('../components/ControlCenterPage').then(module => ({ default: module.ControlCenterPage })));
const ProfileOnboardingDialog = lazy(() => import('../features/profile/ProfileOnboardingDialog').then(module => ({ default: module.ProfileOnboardingDialog })));
const FirstLoginWelcome = lazy(() => import('../components/auth/FirstLoginWelcome').then(module => ({ default: module.FirstLoginWelcome })));
type SharedRoute = Extract<AppRoute, { kind: 'sharedProfile' | 'sharedCategory' | 'sharedProject' }>
  | { kind: 'sharedCollaboration'; profileId: string };
const isProfileId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Public reading starts alongside session restoration, never behind it. */
export function VisitorApp() {
  const originalRoute = useAppRoute();
  const { route, pending: handlePending, error: handleError } = useHandleRoute(originalRoute);
  const location = useLocation(), navigate = useNavigate(), auth = useAuth();
  const presentation = usePresentation();
  const pageScroll = useRef(new Map<string, number>());
  const appearance = useDeviceAppearance(presentation, 'public');
  // Colour mode follows the viewer across the platform and shared links.
  const { theme, mode: appearanceMode, chooseMode } = useDeviceAppearance(presentation);
  const highContrast = appearance.highContrast, reduceTranslucency = appearance.reduceTranslucency;
  const shared = route.kind === 'sharedProfile' || route.kind === 'sharedCategory' || route.kind === 'sharedProject' || route.kind === 'sharedCollaboration';
  const sharedShell = isPublicSharePath(location.pathname);
  const lastSharedRoute = useRef<SharedRoute | null>(null);
  if (shared) lastSharedRoute.current = route as SharedRoute;
  const publicSettingsReturn = shared && isProfileId((route as SharedRoute).profileId)
    ? sharedSettingsReturnPath(location.pathname + location.search + location.hash) : undefined;
  const settingsReturn = publicSettingsReturn ?? readSharedReturnPath(location.state?.settingsReturn);
  const settings = Boolean(publicSettingsReturn) || route.kind === 'controlCenter' && Boolean(settingsReturn && lastSharedRoute.current);
  const readingRoute = shared ? route as SharedRoute : settings ? lastSharedRoute.current : null;
  const profileId = readingRoute?.profileId ?? null;
  const categoryId = readingRoute?.kind === 'sharedCategory' || readingRoute?.kind === 'sharedProject' ? readingRoute.categoryId : null;
  const projectId = readingRoute?.kind === 'sharedProject' ? readingRoute.projectId : null;
  useEffect(() => {
    if (!settings || publicSettingsReturn || !settingsReturn) return;
    const path = sharedSettingsPath(settingsReturn, location.search);
    if (path) navigate(path, { replace: true });
  }, [settings, publicSettingsReturn, settingsReturn, location.search, navigate]);
  useEffect(() => { if (projectId) void loadVisitorProjectPage().catch(() => undefined); }, [projectId]);
  const sharedPath = readSharedReturnPath(shared ? location.pathname + location.search : settingsReturn);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [portalPopup, setPortalPopup] = useState<{ profileId: string; categoryId: string } | null>(null);
  const [portalBrowsing, setPortalBrowsing] = useState<Record<string, Pick<PortalProjectBrowsing, 'layout' | 'sort'>>>({});
  // The chooser and keyed project readers share only local browsing preferences.
  const browsingForPortal = (portalId: string): PortalProjectBrowsing => {
    const scope = `${profileId}/${portalId}`;
    const defaults = { layout: 'list' as const, sort: 'recent' as const };
    return {
      ...(portalBrowsing[scope] ?? defaults),
      onLayout: layout => setPortalBrowsing(current => ({ ...current, [scope]: { ...(current[scope] ?? defaults), layout } })),
      onSort: sort => setPortalBrowsing(current => ({ ...current, [scope]: { ...(current[scope] ?? defaults), sort } })),
    };
  };
  const deferredIntent = useRef<AuthIntent | null>(null);
  const interactiveSignIn = useRef(false), resumedRegistration = useRef<string | null>(null);
  const invalidShared = !settings && sharedShell && (!shared || !profileId || !isProfileId(profileId));
  usePrepareProfileAudio(presentation === 'mobile' && !auth.isInitializing && route.kind === 'sharedProfile' && !settings
    && !handlePending && !handleError && !invalidShared && isProfileId(route.profileId)
    && new URLSearchParams(location.search).get('view') !== 'portals' ? route.profileId : null, auth.user?.id ?? null);
  const query = useSharedProfileQuery(invalidShared ? null : profileId, projectId, categoryId);
  const confirmedWebReader = useRef<{ scope: string; profile: Profile } | null>(null);
  const webReaderScope = presentation === 'web' && !settings && !handlePending && !handleError && !invalidShared
    && (route.kind === 'sharedCategory' || route.kind === 'sharedProject') && profileId && categoryId
    ? JSON.stringify([auth.user?.id ?? null, profileId, categoryId]) : null;
  if (!webReaderScope || confirmedWebReader.current?.scope !== webReaderScope || query.status === 'error' || query.status === 'not-found') {
    confirmedWebReader.current = null;
  }
  if (webReaderScope && query.status === 'ready') {
    const readyProfile = query.profile;
    const confirmed = readyProfile && readyProfile.id === profileId && !readyProfile.isPrivate
      && readyProfile.categories.some(item => item.id === categoryId)
      && (!projectId || readyProfile.projects.some(item => item.id === projectId && item.categoryId === categoryId && item.isPubliclyVisible !== false));
    confirmedWebReader.current = confirmed ? { scope: webReaderScope, profile: readyProfile } : null;
  }
  // Keep the confirmed public index through same-portal media reads, while the
  // pending selection renders no previous project's files.
  const retainedReaderProfile = webReaderScope && route.kind === 'sharedProject' && query.status === 'loading'
    && confirmedWebReader.current?.scope === webReaderScope ? confirmedWebReader.current.profile : null;
  const retainedWebReaderLoading = Boolean(retainedReaderProfile);
  const profile = retainedReaderProfile ?? query.profile;
  const portalPopupId = portalPopup?.profileId === profileId && profile?.categories.some(item => item.id === portalPopup.categoryId)
    ? portalPopup.categoryId : null;
  const publicStyle = profile?.publicAppearance;
  const accentColor = appearance.publicAccentColor ?? publicStyle?.accentColor ?? appearance.accentColor;
  const chooseAccent = (publicAccentColor: string) => appearance.chooseAppearance({ publicAccentColor });
  const systemGray = publicStyle?.systemGray ?? appearance.systemGray;
  const project = retainedWebReaderLoading ? undefined : profile?.projects.find(item => item.id === projectId && item.categoryId === categoryId);
  const webCategoryRoute = presentation === 'web' && !settings && route.kind === 'sharedCategory';
  const readerRoute = !settings && (Boolean(projectId) || webCategoryRoute);
  const webCategoryReady = webCategoryRoute && !handlePending && !handleError && !invalidShared && query.status === 'ready'
    && profile?.id === profileId && !profile?.isPrivate && Boolean(profile?.categories.some(item => item.id === categoryId));
  const publicCategoryProjects = webCategoryReady && profile ? profile.projects.filter(item => item.categoryId === categoryId && item.isPubliclyVisible !== false) : [];
  const firstCategoryProjectId = (publicCategoryProjects.find(item => item.isPinned) ?? publicCategoryProjects[0])?.id;
  useEffect(() => {
    if (!webCategoryReady || !profileId || !categoryId || !firstCategoryProjectId) return;
    navigate(portfolioProjectPath(profileId, categoryId, firstCategoryProjectId, handleFromPath(location.pathname)) + location.search + location.hash, { replace: true });
  }, [webCategoryReady, profileId, categoryId, firstCategoryProjectId, location.pathname, location.search, location.hash, navigate]);
  const catalogueRoute = !settings && (route.kind === 'sharedProfile' || route.kind === 'sharedCategory');
  const catalogueReady = catalogueRoute && !handlePending && !handleError && !invalidShared && query.status === 'ready' && Boolean(profile);
  // Canonical handle replacement can briefly be unresolved; keep this trusted
  // session identity hidden until resolution confirms (or changes) the creator.
  const returnProfileId = profileId ?? (handlePending || handleError ? lastSharedRoute.current?.profileId : null);
  const catalogueScope = `${returnProfileId ?? ''}:${auth.user?.id ?? ''}`;
  const [portalNavigationRequest, setPortalNavigationRequest] = useState<{ scope: string } | null>(null);
  useEffect(() => {
    setPortalNavigationRequest(null);
  }, [catalogueScope, location.pathname, location.search, location.hash, presentation]);
  const desktopCatalogueOrigin = useRef<{ scope: string; origin: CatalogueReaderOrigin; pending: boolean } | null>(null);
  useLayoutEffect(() => {
    const memory = desktopCatalogueOrigin.current;
    if (presentation !== 'web' || (memory && memory.scope !== catalogueScope)) {
      desktopCatalogueOrigin.current = null;
      return;
    }
    if (!memory) return;
    if (projectId) { memory.pending = true; return; }
    if (!catalogueRoute) { memory.pending = false; return; }
    if (!catalogueReady || !memory.pending) return;
    memory.pending = false;
    if (location.pathname + location.search + location.hash !== memory.origin.path) return;
    return restoreCatalogueReaderOrigin(memory.origin, () => document.querySelector<HTMLElement>('[data-public-portfolio-grid]'));
  }, [presentation, catalogueScope, projectId, catalogueRoute, catalogueReady, location.pathname, location.search, location.hash]);
  // Keep only this creator/account's MOBILE catalogue mounted while reading.
  // Timeline selection and sort belong to that composition, not a second URL model.
  const catalogue = useMemo(() => ({ scope: catalogueScope, presentation, profile: null as Profile | null }), [catalogueScope, presentation]);
  if (presentation === 'mobile' && catalogueReady) catalogue.profile = profile;
  if (catalogueRoute && (query.status === 'error' || query.status === 'not-found')) catalogue.profile = null;
  const projectReturn = useMobileProjectReturn({ enabled: presentation === 'mobile', scope: catalogueScope,
    location, projectId: settings ? null : projectId, catalogueReady,
    otherScreen: settings || route.kind === 'sharedCollaboration', navigate });
  useEffect(() => {
    if (presentation !== 'mobile' || projectId || catalogueRoute) return;
    window.scrollTo({ top: pageScroll.current.get(location.pathname) ?? 0, behavior: 'auto' });
    const remember = () => pageScroll.current.set(location.pathname, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [presentation, location.pathname, projectId, catalogueRoute]);
  const back = () => {
    if (settings && settingsReturn) { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate(settingsReturn, { replace: true }); return; }
    const desktopOrigin = desktopCatalogueOrigin.current;
    if (presentation === 'web' && projectId && desktopOrigin?.scope === catalogueScope) {
      navigate(desktopOrigin.origin.path);
      return;
    }
    if (profileId && !invalidShared && projectReturn.close(portfolioPath(profileId, handleFromPath(location.pathname)))) return;
    if (!profileId || !profile || invalidShared || handleError) { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else window.location.assign('/'); return; }
    if (profileId) navigate(portfolioPath(profileId, handleFromPath(location.pathname)),
      presentation === 'web' && readerRoute ? { replace: true } : undefined);
  };
  useEffect(() => {
    if (!settings && presentation === 'mobile' && route.kind === 'sharedCategory' && profileId) {
      if (categoryId) setPortalPopup(current => current?.profileId === profileId && current.categoryId === categoryId
        ? current : { profileId, categoryId });
      navigate(buildPath('sharedProfile', { profileId }), { replace: true });
    }
  }, [settings, presentation, route.kind, profileId, categoryId, navigate]);
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
    document.title = settings ? 'Settings | Portalink' : profile ? project ? `${project.title} — ${profile.name} | Portalink` : `${profile.name} — Catalogue | Portalink` : 'Shared catalogue | Portalink';
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
  const navigationGray = presentation === 'web' ? appearance.systemGray : systemGray;
  const desktopNavigationStyle = useMemo(() => {
    if (navigationGray === systemGray) return undefined;
    return resolveNavButtonTokens(theme, accentColor, highContrast, reduceTranslucency, navigationGray) as React.CSSProperties;
  }, [navigationGray, systemGray, theme, accentColor, highContrast, reduceTranslucency]);
  const openProject = (category: string, id: string) => { if (profileId) {
    if (presentation === 'mobile') { setPortalPopup(null); setPortalNavigationRequest(null); }
    if (presentation === 'web' && !projectId && catalogueReady) {
      const origin = captureCatalogueReaderOrigin(profileId, location.pathname + location.search + location.hash, id,
        document.querySelector<HTMLElement>('[data-public-portfolio-grid]'));
      desktopCatalogueOrigin.current = origin ? { scope: catalogueScope, origin, pending: true } : null;
    }
    projectReturn.open(withCataloguePageTarget(portfolioProjectPath(profileId, category, id, handleFromPath(location.pathname)), id, undefined, presentation === 'mobile' ? 'scroll' : 'focused'), id);
  } };
  const catalogueAppearanceControls = {
    highContrast, reduceTranslucency,
    onHighContrastChange: (value: boolean) => appearance.chooseAppearance({ highContrast: value }),
    onReduceTranslucencyChange: (value: boolean) => appearance.chooseAppearance({ reduceTranslucency: value }),
  };
  const useCatalogueIndicator = presentation === 'mobile' && (catalogueRoute || (handlePending && !settings));
  const pending = useCatalogueIndicator
    ? <div className="grid min-h-[var(--mobile-viewport-height,100dvh)] place-items-center" role="status" aria-label="Opening shared catalogue">
        <span className="premium-media-loading-mark" aria-hidden="true" />
      </div>
    : <LoadingSkeleton kind={projectId || webCategoryRoute ? 'reader' : 'profile'} projectId={projectId ?? undefined} label="Opening shared content…" />;
  const profileOnboarding = <ProfileOnboardingDialog key={auth.user?.id} isOpen theme={theme} systemGray={systemGray}
    onSystemGrayChange={value => appearance.chooseAppearance({ systemGray: value })} accentColor={accentColor}
    onAccentColorChange={chooseAccent} highContrast={highContrast}
    onHighContrastChange={value => appearance.chooseAppearance({ highContrast: value })} reduceTranslucency={reduceTranslucency}
    onReduceTranslucencyChange={value => appearance.chooseAppearance({ reduceTranslucency: value })}
    completionActionLabel={deferredIntent.current?.kind === 'messages' ? 'Continue to messages' : 'Return to catalogue'}
    onDismiss={() => { setOnboardingOpen(false); deferredIntent.current = null; }}
    onComplete={id => { setOnboardingOpen(false); const intent = deferredIntent.current; deferredIntent.current = null;
      if (intent?.kind === 'my-profile') window.location.assign(buildPath('profile', { profileId: id })); else fulfilIntent(intent);
    }} />;
  return <AppPresentation showFloatingActions={!settings && !projectId && !handleError && !invalidShared && Boolean(profile) && query.status === 'ready'} actionSheet={PublicActionSheet} data-public-portfolio="" data-layout-mode="adaptive" style={style} className={`app-shell codex-shell ps-platform-ui accent-theme monochrome-ui shared-portalink-shell theme-${theme} ${highContrast ? 'high-contrast' : ''} ${reduceTranslucency ? 'reduce-translucency' : ''} app-typeface flex h-screen min-h-0 w-full overflow-hidden bg-[var(--mac-window-bg)] text-[var(--mac-label-primary)] antialiased`}>
    <MobileBackProvider onBack={back}>
      {profile && <SharedProfileSidebar mobileNavigationEnabled={!projectId && !settings && !portalPopupId} profile={profile} activeCategoryId={categoryId} theme={theme} onThemeChange={chooseMode} desktopNavigationStyle={desktopNavigationStyle}
        mobileNavigationRequest={presentation === 'mobile' && portalNavigationRequest?.scope === catalogueScope ? portalNavigationRequest : undefined}
        onOpenCategory={id => { if (presentation === 'mobile') {
          setPortalNavigationRequest(null);
          setPortalPopup({ profileId: profile.id, categoryId: id });
        } else {
          desktopCatalogueOrigin.current = null;
          navigate(portfolioPath(profile.id, handleFromPath(location.pathname)) + `/c/${encodeURIComponent(id)}`);
        } }}
        onSettingsOpen={() => { if (!settings && sharedPath) {
          const path = sharedSettingsPath(location.pathname + location.search + location.hash);
          if (path) navigate(path);
        } }} />}
      <div className="codex-workspace flex min-w-0 flex-1 basis-0 flex-col">
        <div id="app-viewport">
          <div className="app-screen-layer h-full min-h-0">
            <main tabIndex={-1} aria-label={settings ? 'Settings' : presentation === 'mobile' && projectId ? project ? `${project.title} files` : 'Shared project' : profile ? `${profile.name} shared catalogue` : 'Shared catalogue'} className={`min-h-0 h-full w-full ${readerRoute ? 'overflow-hidden' : 'overflow-y-auto'}`}>
              <div data-screen-scroll={readerRoute ? 'nested' : 'page'} className={`feed-starfield min-h-full ${readerRoute ? 'h-full' : ''}`}>
                {presentation === 'mobile' && catalogue.profile && <DeferredSurfaceBoundary active={catalogueReady} onClose={back} resetKey={catalogueScope}>
                  <Suspense fallback={catalogueReady ? pending : null}>
                    <VisitorProfileGrid key={`catalogue:${catalogueScope}`} profile={catalogue.profile} categoryId={null}
                      active={catalogueReady} appearanceControls={catalogueAppearanceControls} onCaptureOpener={projectReturn.captureOpener} onOpen={openProject} onBack={back} onMessage={openMessages}
                      onCollaboration={() => { if (catalogue.profile) navigate(buildPath('sharedCollaboration', { profileId: catalogue.profile.id })); }} />
                  </Suspense>
                </DeferredSurfaceBoundary>}
                <DeferredSurfaceBoundary active onClose={back} resetKey={location.pathname}>
                  <Suspense fallback={pending}>
                    {settings ? <ControlCenterPage sharedReadOnly theme={theme} appearanceMode={appearanceMode} onAppearanceModeChange={chooseMode}
                      systemGray={navigationGray} onSystemGrayChange={value => appearance.chooseAppearance({ systemGray: value })}
                      accentColor={accentColor} onAccentColorChange={chooseAccent}
                      highContrast={highContrast} onHighContrastChange={value => appearance.chooseAppearance({ highContrast: value })}
                      reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={value => appearance.chooseAppearance({ reduceTranslucency: value })}
                      onBack={back} onOpenProfile={openOwnProfile} />
                      : handleError ? <RouteError kind={routeErrorKind(handleError)} onBack={back} onHome={() => window.location.assign('/')} /> : handlePending ? pending
                      : invalidShared ? <RouteError kind="not-found" onBack={back} onHome={() => window.location.assign('/')} />
                      : (query.status === 'loading' || query.status === 'idle') && !retainedWebReaderLoading ? pending : !profile ? <RouteError kind={query.status === 'error' ? routeErrorKind(query.error) : 'not-found'} onBack={back} onHome={() => window.location.assign('/')} />
                      : projectId ? project || retainedWebReaderLoading ? <VisitorProjectPage key={presentation === 'web' ? `${profile.id}/${categoryId}` : project?.id} profile={profile} project={project ?? null} categoryId={categoryId ?? undefined} loading={retainedWebReaderLoading} pendingProjectId={presentation === 'web' && retainedWebReaderLoading ? projectId : undefined} onBack={back} desktopNavigationStyle={desktopNavigationStyle} browsing={presentation === 'mobile' && categoryId ? browsingForPortal(categoryId) : undefined}
                        onBackToProfile={presentation === 'mobile' ? back : () => navigate(portfolioPath(profile.id, handleFromPath(location.pathname)))} onSelect={id => { if (categoryId) openProject(categoryId, id); }} /> : <RouteError kind="not-found" creatorHandle={profile.handle} onBack={back} onHome={() => window.location.assign('/')} onCreator={presentation === 'mobile' ? back : () => navigate(portfolioPath(profile.id, handleFromPath(location.pathname)))} />
                      : route.kind === 'sharedCollaboration' ? <CollaborationPage profile={profile} onBack={back} />
                      : presentation !== 'mobile' && categoryId && !profile.categories.some(item => item.id === categoryId) ? <RouteError kind="not-found" creatorHandle={profile.handle} onBack={back} onHome={() => window.location.assign('/')} onCreator={() => navigate(portfolioPath(profile.id, handleFromPath(location.pathname)))} />
                      : webCategoryRoute ? webCategoryReady && !firstCategoryProjectId ? <VisitorProjectPage key={`${profile.id}/${categoryId}`} profile={profile} project={null} categoryId={categoryId ?? undefined} onBack={back} desktopNavigationStyle={desktopNavigationStyle}
                        onBackToProfile={back} onSelect={id => { if (categoryId) openProject(categoryId, id); }} /> : pending
                      : presentation === 'mobile' ? null : <VisitorProfileGrid key={`${profile.id}/${categoryId ?? ''}`} profile={profile} categoryId={categoryId} appearanceControls={catalogueAppearanceControls} onOpen={openProject} onBack={back} onMessage={openMessages}
                        onCollaboration={openMessages} />}
                  </Suspense>
                </DeferredSurfaceBoundary>
              </div>
            </main>
          </div>
        </div>
      </div>
      {profile && portalPopupId && presentation === 'mobile' && <SharedPortalPopup profile={profile} categoryId={portalPopupId} onClose={() => setPortalPopup(null)}
        onBack={() => { setPortalPopup(null); setPortalNavigationRequest({ scope: catalogueScope }); }}
        onSelect={openProject} browsing={browsingForPortal(portalPopupId)} />}
      <DeferredDialog active={Boolean(auth.pendingView) && (!onboardingOpen || auth.pendingView === 'resetPassword' || Boolean(auth.session?.isPasswordRecovery))} onClose={auth.closeAuth}>
        <AuthDialog welcomeBeforeSignup showWelcomeMedia={false} registrationReturnPath={sharedPath} theme={theme} systemGray={systemGray}
          onSystemGrayChange={value => appearance.chooseAppearance({ systemGray: value })} accentColor={accentColor}
          onAccentColorChange={chooseAccent} highContrast={highContrast}
          onHighContrastChange={value => appearance.chooseAppearance({ highContrast: value })} reduceTranslucency={reduceTranslucency}
          onReduceTranslucencyChange={value => appearance.chooseAppearance({ reduceTranslucency: value })} />
      </DeferredDialog>
      {onboardingOpen && auth.isAuthenticated && !auth.session?.isPasswordRecovery && auth.pendingView !== 'resetPassword' && <DeferredSurface active onClose={() => { setOnboardingOpen(false); deferredIntent.current = null; }}>
        {presentation === 'mobile'
          ? <FirstLoginWelcome key={auth.user?.id} accountId={auth.user?.id ?? ''}>{profileOnboarding}</FirstLoginWelcome>
          : profileOnboarding}
      </DeferredSurface>}
    </MobileBackProvider>
  </AppPresentation>;
}
