import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { ProductDetailState } from './components/AppDetailPage';
import type { FeatureCardApp } from './components/FeatureCard';
import { HomeFeed } from './components/home/HomeFeed';
import { getProjectAspectRatio, getProjectDescription, getProjectMediaLabel } from './utils/projectPresentation';
import type { Id, ProjectLocation, ProjectView } from './types/domain';
import type { AuthIntent } from './types/auth';
import type { ViewerRole } from './types/viewer';
import { useProjectResolution } from './features/projects/useProjectResolution';
import { MobileProfileWorkspace } from './presentation/mobile/MobileProfileWorkspace';
import { ActivityCollectionPage } from './components/profile/ActivityCollectionPage';
import { ActivityPage, SavedPage, InsightsPage } from './features/library/PersonalPages';
import { portfolioCategories } from './components/navigation';
import type { NavigationDestination } from './components/navigation';
import { describeRoute, PROTECTED_ROUTE_KINDS, screenPresetPath, useAppRoute, useRouteNavigator } from './app/useAppRoute';
import { useLocation } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from './components/ui/StateViews';
import { Sidebar } from './components/Sidebar';
import { SharedProfileSidebar } from './components/profile/SharedProfileSidebar';
import { getTypefaceStack } from './data/typefaces';
import { resolveNavButtonTokens } from './data/navButtonTokens';
import { resolveAccentTokens } from './utils/accentTokens';
import { resolveMacTokens } from './utils/macTokens';
import { readLanguage, writeLanguage, type AppearanceTheme, type StoredAppearanceMode, type StoredLanguage } from './utils/appearancePreferences';
import { useDeviceAppearance } from './hooks/useDeviceAppearance';
import { useScreenInit } from './useScreenInit.js';
import { useFollows } from './features/follows/useFollows';
import { useLiveSessions } from './features/live/useLiveSessions';
import { useCategoryManagement } from './features/profile/useCategoryManagement';
import { useAuth } from './contexts/AuthContext';
import { SessionStatusBanner } from './features/auth/SessionStatusBanner';
import { AlertCircleIcon } from 'lucide-react';
import { InteractionSafePresence } from './components/ui/InteractionSafePresence';
import { FeatureInDesignPage } from './components/FeatureInDesignPage';
import { useProfileOnboardingStatus } from './features/profile/useProfileOnboarding';
import { DeferredDialog, DeferredSurface, DeferredSurfaceBoundary } from './components/ui/DeferredDialog';
import { PublishConfirmation } from './features/publishing/PublishConfirmation';
import { useProfileData, useProfileQuery } from './contexts/ProfileDataContext';
import { AppScreenLayers } from './presentation/AppScreenLayers';
import './app/screenTransitions.css';
import { buildPath } from './app/routes';
import { beginProjectContinuity, isProjectContinuityActive } from './utils/projectContinuity';
import { canAccessProfile } from './domain/contentPlacement';
import { PANEL_LAYOUT_RESET_EVENT } from './utils/panelLayoutDefaults';
import { useCreatorAppearance } from './features/profile/useCreatorAppearance';
import { canResumeRegistration, readSharedReturnPath } from './features/auth/registration';
import { AppPresentation, AppPresentationProvider } from './presentation/AppPresentation';
import { usePresentation } from './presentation/usePresentation';
import { MobileBackProvider } from './presentation/mobile/MobileBackNavigation';

// Expensive destinations are loaded only when opened. In particular, the
// spatial discovery stack no longer competes with Home's first navigation frame.
const MessagesPage = React.lazy(() => import('./components/MessagesPage').then((module) => ({ default: module.MessagesPage })));
const SearchBrowsePage = React.lazy(() => import('./components/SearchBrowsePage').then((module) => ({ default: module.SearchBrowsePage })));
const ControlCenterPage = React.lazy(() => import('./components/ControlCenterPage').then((module) => ({ default: module.ControlCenterPage })));
const AppDetailPage = React.lazy(() => import('./components/AppDetailPage').then(module => ({ default: module.AppDetailPage })));
const IconPickerPage = React.lazy(() => import('./components/profile/IconPickerPage').then(module => ({ default: module.IconPickerPage })));
const PortalsPage = React.lazy(() => import('./features/profile/PortalsPage').then(module => ({ default: module.PortalsPage })));
const ProfileEditorPage = React.lazy(() => import('./features/profile/ProfileEditorDialog').then(module => ({ default: module.ProfileEditorPage })));
const AuthDialog = React.lazy(() => import('./features/auth/AuthDialog').then(module => ({ default: module.AuthDialog })));
const ProfileOnboardingDialog = React.lazy(() => import('./features/profile/ProfileOnboardingDialog').then(module => ({ default: module.ProfileOnboardingDialog })));
const PublishProjectDialog = React.lazy(() => import('./features/publishing/PublishProjectDialog').then(module => ({ default: module.PublishProjectDialog })));
// Profile editing, sorting and the full media viewer are not Home startup work.
// These retain their existing state/props inside the screen's Suspense boundary.
const loadProfilePage = () => import('./components/UserProfilePage').then((module) => ({ default: module.UserProfilePage }));
const loadCategoryPage = () => import('./components/profile/ProfileCategoryPage').then((module) => ({ default: module.ProfileCategoryPage }));
const UserProfilePage = React.lazy(loadProfilePage);
const ProfileCategoryPage = React.lazy(loadCategoryPage);
const MAIN_SIDEBAR_COLLAPSED_KEY = 'portalink.mainSidebarCollapsed';

function readMainSidebarCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(MAIN_SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

function writeMainSidebarCollapsed(isCollapsed: boolean): void {
  try {
    window.localStorage.setItem(MAIN_SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  } catch {
    // Storage can be unavailable in a private session; the in-memory state
    // remains fully usable for the current visit.
  }
}

/**
 * The one mapping from a canonical project to the detail viewer's view model.
 *
 * Every field is read from the record; nothing is invented. A project with no
 * page count, summary, or extent simply arrives without those fields, and the
 * viewer omits them rather than showing a placeholder.
 */
function toDetailView(view: ProjectView): FeatureCardApp {
  const {
    project,
    creator
  } = view;
  return {
    name: project.title,
    tagline: project.summary,
    icon: '',
    // Only a real filename, from a real uploaded file.
    fileName: project.attachments?.find((attachment) => attachment.isCover)?.fileName ?? project.attachments?.[0]?.fileName,
    pageCount: project.pageCount,
    aspectRatio: getProjectAspectRatio(project),
    description: getProjectDescription(project) ?? undefined,
    mediaLabel: getProjectMediaLabel(project) ?? undefined,
    coverImage: project.cover,
    coverAlt: project.coverAlt,
    coverKind: project.coverKind,
    creatorId: creator.id,
    creatorName: creator.name,
    creatorKind: creator.kind,
    creatorAvatar: creator.avatar
  };
}
// The profile overview is addressed by canonical id and nothing else. There is
// no stand-in identity: an id that does not resolve to a real profile record
// opens no profile page at all, rather than a page assembled from a display name
// and sample content.
export function App() {
  return <AppPresentationProvider><AppContent /></AppPresentationProvider>;
}

function AppContent() {
  const presentation = usePresentation();
  /**
   * The URL is the destination. Everything a location can express — which
   * surface is open, whose profile, which category, which project, the search
   * query — is derived from it below, so a destination can be pasted, refreshed,
   * and reached with the browser's own Back and Forward buttons.
   */
  const route = useAppRoute();
  useEffect(() => {
    // A direct profile/project link fetches its UI alongside its data. Waiting
    // until the profile record renders would introduce a new request waterfall.
    if (['profile', 'category', 'project', 'sharedProfile', 'sharedCategory', 'sharedProject', 'portals'].includes(route.kind)) {
      void loadProfilePage().catch(() => undefined);
    }
    if (['category', 'project', 'sharedCategory', 'sharedProject'].includes(route.kind)) {
      void loadCategoryPage().catch(() => undefined);
    }
  }, [route.kind]);
  const nav = useRouteNavigator();
  const isSharedRoute = route.kind === 'sharedProfile' || route.kind === 'sharedCategory' || route.kind === 'sharedProject';
  const auth = useAuth();
  const { mode: appearanceMode, chooseMode: setAppearanceMode, chooseAppearance, theme,
    accentColor, systemGray: navSystemGray, highContrast, reduceTranslucency } = useDeviceAppearance(presentation);
  const creatorAppearance = useCreatorAppearance(auth.viewerProfileId, !isSharedRoute, { accentColor, systemGray: navSystemGray });
  // Personal interface choices are separate on WEB and MOBILE. Explicit colour
  // choices still update the creator's shared public branding, as before, but
  // branding changes never overwrite either saved personal interface palette.
  const setAccentColor = (value: string) => { chooseAppearance({ accentColor: value }); creatorAppearance.choose({ accentColor: value }); };
  const setNavSystemGray = (value: string) => { chooseAppearance({ systemGray: value }); creatorAppearance.choose({ systemGray: value }); };
  const setHighContrast = (value: boolean) => chooseAppearance({ highContrast: value });
  const setReduceTranslucency = (value: boolean) => chooseAppearance({ reduceTranslucency: value });
  const {
    pathname,
    search,
    state: navigationState
  } = useLocation();
  const settingsReturnPath = route.kind === 'controlCenter' && navigationState && typeof navigationState === 'object'
    && 'settingsReturn' in navigationState && typeof navigationState.settingsReturn === 'string'
    ? readSharedReturnPath(navigationState.settingsReturn) : undefined;
  const screenInit = useScreenInit();
  const activeDestination: NavigationDestination = route.kind === 'destination' ? route.destination : 'Today';
  const [language, setLanguage] = useState<StoredLanguage>(() => readLanguage('auto'));
  // Every route uses the viewer's active WEB/MOBILE Settings appearance.
  // Creator branding remains stored on the profile; opening a public link must
  // not replace the viewer's navigation palette or accessibility preferences.
  const interfaceTheme = theme;
  const interfaceHighContrast = highContrast;
  const interfaceReduceTranslucency = reduceTranslucency;
  const interfaceNavSystemGray = navSystemGray;
  const interfaceAccentColor = accentColor;
  // Typography belongs to the project, so the shell holds none of it: the face is
  // carried on the project's own design setting and read through
  // `useProjectTypography` by the surface that presents the work.

  /**
   * Live sessions and the membership lifecycle. This used to be a display string
   * set directly by the broadcast crawl, so the viewer could appear joined to a
   * session that had no id and that no service had been asked about. Membership is
   * now only ever what `LiveService` confirmed.
   */
  const live = useLiveSessions();
  const liveShow = live.joinedSession ? `${live.joinedSession.hostName} — ${live.joinedSession.title}` : null;
  // Carries the title the owner typed, so the record is created with its real
  // name rather than a placeholder that has to be renamed afterwards.
  const [addCategoryRequest, setAddCategoryRequest] = useState<{
    nonce: number;
    label: string;
    iconName?: string;
  } | null>(null);
  const [iconPickerCategoryId, setIconPickerCategoryId] = useState<string | null>(null);
  /**
   * The icon the picker last attempted, so the tile in flight reports progress and
   * a retry re-runs that same choice rather than losing which one was rejected.
   */
  const [attemptedIconName, setAttemptedIconName] = useState<string | null>(null);
  /** Writes the chosen icon through the management boundary, closing only on success. */
  async function chooseCategoryIcon(categoryId: string, iconName: string) {
    setAttemptedIconName(iconName);
    const saved = await management.setCategoryIcon(categoryId, iconName);
    if (saved) {
      setAttemptedIconName(null);
      setIconPickerCategoryId(null);
    }
  }
  function chooseTheme(nextTheme: AppearanceTheme) {
    setAppearanceMode(nextTheme);
  }
  function chooseAppearanceMode(nextMode: StoredAppearanceMode) {
    setAppearanceMode(nextMode);
  }
  // Keep browser-native controls, scrollbars, and portalled UI in the same
  // resolved appearance. The pre-render bootstrap in index.html sets this before
  // React starts; this effect keeps it current after an override or OS change.
  useEffect(() => {
    document.documentElement.dataset.appearance = interfaceTheme;
    document.documentElement.style.colorScheme = interfaceTheme;
  }, [interfaceTheme]);
  // Portalled menus mount directly under body, outside the themed React tree.
  // Mirror appearance and accessibility classes there so those transient
  // controls resolve the same materials and contrast as the window beneath.
  useEffect(() => {
    document.body.classList.toggle('theme-dark', interfaceTheme === 'dark');
    document.body.classList.toggle('theme-light', interfaceTheme === 'light');
    document.body.classList.toggle('high-contrast', interfaceHighContrast);
    document.body.classList.toggle('reduce-translucency', interfaceReduceTranslucency);
  }, [interfaceTheme, interfaceHighContrast, interfaceReduceTranslucency]);
  useEffect(() => {
    writeLanguage(language);
  }, [language]);
  // The document carries the locale and reading direction, so logical layout,
  // directional glyphs, and assistive technology all agree. Automatic follows
  // the browser; explicit preferences remain stable across sessions.
  useEffect(() => {
    const requestedLocale = language === 'auto' ? navigator.language || 'en' : language;
    const baseLanguage = requestedLocale.toLowerCase().split('-')[0];
    const rtlLanguages = new Set(['ar', 'fa', 'he', 'ps', 'ur']);
    document.documentElement.lang = requestedLocale;
    document.documentElement.dir = rtlLanguages.has(baseLanguage) ? 'rtl' : 'ltr';
  }, [language]);
  // Read before the first paint so both the sidebar and the feed start in the
  // user's last layout, without briefly rendering the opposite state.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readMainSidebarCollapsed);
  useEffect(() => {
    writeMainSidebarCollapsed(isSidebarCollapsed);
  }, [isSidebarCollapsed]);
  /**
   * Which surface is open is a question about the URL, not about nine booleans.
   * Home is the landing surface; Portalink and search are destinations the viewer
   * chooses to go to.
   */
  const isSearchOpen = route.kind === 'search' || route.kind === 'portalink';
  const isPortalsOpen = route.kind === 'portals';
  const isInsightsOpen = route.kind === 'insights';
  const isStudioOpen = route.kind === 'studio';
  const inDesignFeature = isPortalsOpen ? 'Portals' as const : isStudioOpen ? 'Studio' as const : null;
  const isSavedOpen = route.kind === 'saved';
  const isActivityOpen = route.kind === 'notifications';
  const personalScreen = isSavedOpen ? 'Saved' : isActivityOpen ? 'Activity' : isInsightsOpen ? 'Insights' : null;
  const isMessagesOpen = route.kind === 'messages';
  const isControlCenterOpen = route.kind === 'controlCenter';
  const isProfileEditorRoute = route.kind === 'profileEditor';
  // Records addressed by the URL. Ids only — never a display name.
  const routeProfileId = isProfileEditorRoute ? auth.viewerProfileId : route.kind === 'profile' || route.kind === 'category' || route.kind === 'project' || route.kind === 'activity' || route.kind === 'sharedProfile' || route.kind === 'sharedCategory' || route.kind === 'sharedProject' ? route.profileId : null;
  // Which engagement collection the URL asks for, if any.
  const routeActivityKind = route.kind === 'activity' ? route.activityKind : null;
  const routeCategoryId = route.kind === 'category' || route.kind === 'project' || route.kind === 'sharedCategory' || route.kind === 'sharedProject' ? route.categoryId : null;
  const activeProjectId = route.kind === 'project' || route.kind === 'sharedProject' ? route.projectId : null;
  const routeItemId = route.kind === 'item' ? route.projectId : null;
  /**
   * The query lives in the URL (`/search?q=…`), but the field keeps its own draft
   * so typing stays immediate and the caret is never disturbed. The URL is then
   * mirrored on a short debounce, replacing rather than pushing so a search does
   * not bury the previous destination under one entry per keystroke.
   */
  const [searchQuery, setSearchQuery] = useState(route.kind === 'search' ? route.query : '');
  const routeQuery = route.kind === 'search' ? route.query : null;
  // Back, Forward, or a pasted URL is authoritative over the draft.
  useEffect(() => {
    if (routeQuery !== null) {
      setSearchQuery((current) => current === routeQuery ? current : routeQuery);
    }
  }, [routeQuery]);
  const queryTimerRef = useRef<number | null>(null);
  const searchOriginPathRef = useRef(pathname);
  searchOriginPathRef.current = pathname;
  useEffect(() => () => {
    if (queryTimerRef.current !== null) {
      window.clearTimeout(queryTimerRef.current);
    }
  }, []);
  useEffect(() => {
    // A scheduled search belongs to the screen where the user typed it. Once a
    // newer click changes screens, that old timer loses the right to navigate.
    if (queryTimerRef.current !== null) {
      window.clearTimeout(queryTimerRef.current);
      queryTimerRef.current = null;
    }
  }, [pathname]);
  function changeSearchQuery(next: string) {
    setSearchQuery(next);
    if (queryTimerRef.current !== null) {
      window.clearTimeout(queryTimerRef.current);
    }
    const originPathname = pathname;
    queryTimerRef.current = window.setTimeout(() => {
      queryTimerRef.current = null;
      if (searchOriginPathRef.current !== originPathname) {
        return;
      }
      // Already on a search or browse surface: replace, so the history stack
      // holds the destination rather than every intermediate query.
      nav.search(next, true);
    }, 250);
  }
  // The one session source of truth for the whole application.
  // Sign in is shown over Home as a first-arrival experience. Collapse the
  // navigation visually while it is open, without overwriting the person's
  // saved sidebar preference; closing the dialog restores their own layout.
  const isSignInExperienceOpen = auth.pendingView !== null;
  const hasHandledDirectAuthViewRef = useRef(false);
  useEffect(() => {
    if (hasHandledDirectAuthViewRef.current) {
      return;
    }
    const requestedView = new URLSearchParams(search).get('auth');
    if (requestedView !== 'signIn') {
      return;
    }
    hasHandledDirectAuthViewRef.current = true;
    auth.requestAuth('signIn');
  }, [auth.requestAuth, search]);
  /**
   * Resolving a project or a creator by id lives behind its own boundary. No
   * service is reached from the shell: navigation is all this file owns.
   */
  const projectNavigation = useProjectResolution();
  useEffect(() => {
    // An unresolved tile selection is subordinate to a newer route click. This
    // invalidates the old request so its eventual response cannot reopen work
    // after the viewer has already chosen Home, Messages, or another profile.
    projectNavigation.cancel();
  }, [pathname, projectNavigation.cancel]);
  // The resolver callback is stable; the surrounding resolution object changes
  // as loading settles and must not retrigger the item lookup effect below.
  const resolveProject = projectNavigation.resolveProject;
  /**
   * A profile id in the URL is a request, not a fact. It is confirmed through the
   * read boundary before any profile surface renders, so a pasted, stale, or
   * deleted id produces a truthful not-found rather than opening whichever record
   * a fallback would have handed back.
   */
  /**
   * Which profile the portfolio context belongs to. On a creator route it is the
   * id the URL asked for; elsewhere it is the viewer's own profile. A guest with
   * no creator context has NO profile — there is no fallback id, because handing
   * back a seeded creator invents an identity nobody asked for.
   */
  const viewedProfileId = routeProfileId ?? auth.viewerProfileId;
  /**
   * The discovery surface a project was opened FROM, if it was opened that way.
   *
   * This exists because arriving at a project from Home, an editorial feed, a
   * city page, search, or an activity collection is a different flow from
   * reaching it through the portal's own index: in the first case the viewer was
   * mid-browse and wants to carry on, and there is nothing on the page that says
   * where they came from. It is transient presentation state — never persisted,
   * never part of a route — and it is what gates the return control, so the
   * control cannot appear for a viewer who navigated in through the sidebar.
   */
  const [discoveryReturn, setDiscoveryReturn] = useState<{
    path: string;
    profileId: Id;
  } | null>(null);
  // Project-workspace panels belong to the browsing session rather than to the
  // active category component. Category routes are separate transition layers,
  // so keeping this state at the shell prevents a portal or project selection
  // from silently restoring either panel to its default.
  const [isProjectIndexCollapsed, setIsProjectIndexCollapsed] = useState(false);
  const [isProjectEngagementOpen, setIsProjectEngagementOpen] = useState(false);
  // Public links have distinct product defaults: their portal index starts open
  // and their description rail starts open. They still retain the viewer's
  // explicit choices while that person browses the shared Portalink.
  const [isSharedProjectIndexCollapsed, setIsSharedProjectIndexCollapsed] = useState(false);
  const [isSharedProjectDescriptionOpen, setIsSharedProjectDescriptionOpen] = useState(true);
  useEffect(() => {
    const reset = () => {
      setIsSidebarCollapsed(false);
      setIsProjectIndexCollapsed(false);
      setIsProjectEngagementOpen(false);
      setIsSharedProjectIndexCollapsed(false);
      setIsSharedProjectDescriptionOpen(true);
    };
    window.addEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
    return () => window.removeEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
  }, []);
  const hasEnteredDiscoveryProjectRef = useRef(false);
  useEffect(() => {
    if (!discoveryReturn) {
      hasEnteredDiscoveryProjectRef.current = false;
      return;
    }
    // The offer expires when the viewer leaves the portal they were sent into —
    // a stale "back to discovery" on an unrelated later visit would be a lie
    // about how they got there. Moving between projects inside the same portal
    // keeps it, because the browse they interrupted is still the way back.
    const stillInPortal = (route.kind === 'project' || route.kind === 'category') && routeProfileId === discoveryReturn.profileId;
    if (stillInPortal) {
      hasEnteredDiscoveryProjectRef.current = true;
      return;
    }
    // Setting the return target and navigating are separate React updates. Do
    // not expire the target while the viewer is still on the discovery screen
    // during that hand-off; only expire it after the target was actually entered.
    if (hasEnteredDiscoveryProjectRef.current) {
      setDiscoveryReturn(null);
    }
  }, [discoveryReturn, route.kind, routeProfileId]);
  /**
   * The read itself. The URL is a request, not a fact: the record arrives from
   * `ProfileService` through the query boundary, so a pasted, stale, or deleted
   * id produces a truthful not-found or a retryable failure rather than opening
   * whichever record a fallback would have handed back.
   */
  const { fetchProfile } = useProfileData();
  const viewedProfileQuery = useProfileQuery(viewedProfileId);
  const viewedProfile = viewedProfileQuery.profile;
  // Pointer, touch, or keyboard intent can arrive a beat before navigation.
  // Warm the same canonical profile query the destination consumes so the
  // click does not start a duplicate request or flash an avoidable empty state.
  const warmCreator = useCallback((creatorId: Id) => {
    void fetchProfile(creatorId).catch(() => {
      // Prefetch is deliberately silent. If navigation follows, the route owns
      // the truthful error and retry presentation; if it does not, nothing nags.
    });
  }, [fetchProfile]);
  // The footer always represents the signed-in viewer, even while they browse
  // another creator. Reuse the current read when the viewed portal is their own;
  // only resolve a second record when those identities genuinely differ.
  // The record the service returned IS the answer — it is never re-derived from a
  // seed store, and its own id is authoritative even if the service resolved an
  // alias, so a profile that exists nowhere in the seed data renders exactly as
  // returned.
  const isProfileRouteReady = routeProfileId !== null && viewedProfileQuery.status === 'ready' && viewedProfile !== null;
  const activeCategoryId = isProfileRouteReady ? routeCategoryId : null;
  // Follow state and its request lifecycle live in the feature hook, resolved for
  // the profile currently being viewed. Keying it to that profile is what stops a
  // pending or failed request following the viewer to the next creator.
  const follows = useFollows(isSharedRoute ? null : viewedProfileId);
  // An account can exist without a profile; creator surfaces onboard instead.
  const onboardingStatus = useProfileOnboardingStatus();
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const resumedRegistration = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.isAuthenticated) {
      resumedRegistration.current = null;
      if (auth.phase === 'unauthenticated') setIsOnboardingOpen(false);
      return;
    }
    const id = auth.user?.registration?.id;
    if (!id || resumedRegistration.current === id || !canResumeRegistration(auth.session, auth.pendingView)) return;
    resumedRegistration.current = id;
    const returnPath = readSharedReturnPath(auth.user?.registration?.returnPath);
    deferredIntentRef.current = auth.consumePendingIntent() ?? (returnPath ? { kind: 'route', path: returnPath, label: 'view shared content' } : deferredIntentRef.current);
    setIsOnboardingOpen(true);
    if (auth.pendingView) auth.closeAuth();
  }, [auth]);
  const closeProfileEditor = useCallback(() => nav.closeProfileEditor(auth.viewerProfileId), [nav, auth.viewerProfileId]);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishConfirmation, setPublishConfirmation] = useState<{ projectId: string; message: string } | null>(null);
  useEffect(() => {
    if (!publishConfirmation) return;
    const timer = window.setTimeout(() => setPublishConfirmation(null), 5000);
    return () => window.clearTimeout(timer);
  }, [publishConfirmation]);
  const [publishTargetCategoryId, setPublishTargetCategoryId] = useState<string | null>(null);
  const [publishAccountId, setPublishAccountId] = useState<string | null>(null);
  const [globalCreateAccountId, setGlobalCreateAccountId] = useState<string | null>(null);
  const isGlobalCreatePending = globalCreateAccountId !== null && globalCreateAccountId === auth.user?.id;
  function setIsGlobalCreatePending(pending: boolean) {
    setGlobalCreateAccountId(pending ? auth.user?.id ?? null : null);
  }
  const publishingAccountRef = useRef(auth.user?.id ?? null);
  useEffect(() => {
    const accountId = auth.user?.id ?? null;
    if (publishingAccountRef.current === accountId) return;
    const previousAccountId = publishingAccountRef.current;
    publishingAccountRef.current = accountId;
    setGlobalCreateAccountId(null);
    setPublishAccountId(null);
    setIsPublishOpen(false);
    setPublishTargetCategoryId(null);
    setPublishConfirmation(null);
    // Registration can establish its deferred intent earlier in this commit.
    // Keep a guest's first sign-in intent; discard a departing account's intent.
    if (previousAccountId !== null) deferredIntentRef.current = null;
  }, [auth.user?.id]);
  // The page scrolls only when the viewer scrolls it. Nothing moves because
  // somebody stopped moving.
  const mainContentRef = useRef<HTMLElement>(null);
  const productDetailStateRef = useRef<ProductDetailState | undefined>(screenInit.productDetailView ? {
    activeView: screenInit.productDetailView as ProductDetailState['activeView'],
    scrollTop: 0
  } : undefined);
  const shouldReduceMotion = useReducedMotion();
  /**
   * PREVIEW ONLY. A Magic Patterns screen preset describes its destination in the
   * old in-memory state shape. It is translated into a canonical path once, on the
   * first render, and from then on routing is the only navigation source.
   */
  const hasAppliedPresetRef = useRef(false);
  useEffect(() => {
    if (hasAppliedPresetRef.current) {
      return;
    }
    hasAppliedPresetRef.current = true;
    const presetPath = screenPresetPath(screenInit as Record<string, unknown>);
    if (presetPath && presetPath !== pathname) {
      nav.to(`${presetPath}${search}`, true);
    }
    // Deliberately once, at startup: a preset is initialization, not navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * Scroll restoration, keyed by path rather than by a hand-rolled history array.
   * Each destination remembers where it was left, so browser Back returns to the
   * same place in the same view; a destination never seen before opens at the top.
   */
  const scrollPositionsRef = useRef(new Map<string, number>());
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  useEffect(() => {
    const target = scrollPositionsRef.current.get(pathname) ?? 0;
    let frame = 0;
    let attempts = 0;
    const apply = () => {
      const element = mainContentRef.current;
      if (element) {
        element.scrollTo({
          top: target,
          behavior: 'auto'
        });
        if (Math.abs(element.scrollTop - target) < 2 || attempts > 40) {
          return;
        }
      }
      attempts += 1;
      frame = requestAnimationFrame(apply);
    };
    frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  function handleMainScroll(event: React.UIEvent<HTMLElement>) {
    // Content only dissolves into the fixed navigation layer once it starts moving.
    event.currentTarget.classList.toggle('is-at-top', event.currentTarget.scrollTop <= 1);
    // Recorded as it happens, so the position is already known by the time a
    // navigation replaces this view.
    scrollPositionsRef.current.set(pathnameRef.current, event.currentTarget.scrollTop);
  }
  // Ownership is derived from the authenticated account, never from a hardcoded
  // identity. Signed out, every profile is a visitor view.
  const isOwnerMode = !isSharedRoute && auth.viewerProfileId !== null && viewedProfileId === auth.viewerProfileId;
  const isPrivateProfileAccessResolving = Boolean(
    routeProfileId
    && viewedProfile?.isPrivate
    && !isOwnerMode
    && !isSharedRoute
    && follows.isResolving
  );
  const canReadViewedProfile = viewedProfile ? canAccessProfile({
    profile: viewedProfile,
    viewerProfileId: auth.viewerProfileId,
    isConfirmedFollower: follows.isFollowing,
    isSharedRoute,
  }) : true;
  const isProfileAccessDenied = Boolean(routeProfileId && viewedProfile && !isPrivateProfileAccessResolving && !canReadViewedProfile);
  /**
   * One portfolio-management boundary for the whole shell. It lives here rather
   * than inside the sidebar because the icon picker is a page, not a sidebar
   * control: both now write through the same instance, so an icon change gets the
   * same optimistic rollback, pending state, failure message, and exact retry as
   * every other category operation instead of a second mutation path.
   */
  const management = useCategoryManagement(viewedProfileId, isOwnerMode);
  /**
   * Three distinct audiences, not two. Collapsing "not the owner" into one state
   * meant a guest and a signed-in visitor were shown identical surfaces, so a
   * guest was never told which actions need an account and a signed-in visitor
   * was offered no more than someone who had never signed up.
   *
   * This decides what the interface OFFERS. It is not a security boundary: what a
   * viewer is actually allowed to read or change is the service's decision, and a
   * real backend must enforce it independently of anything here.
   */
  const viewerRole: ViewerRole = isSharedRoute ? 'guest' : isOwnerMode ? 'owner' : auth.isAuthenticated ? 'visitor' : 'guest';
  /**
   * Actions that genuinely need an account route through here. The label is
   * what the person was trying to do, so the gate can say so.
   */
  function requireAuth(action: () => void, label = 'continue') {
    if (auth.isAuthenticated) {
      action();
      return;
    }
    auth.requestAuthenticatedDestination({
      kind: 'interaction',
      label
    });
  }
  // True once an authenticated identity has been observed during this mount.
  const wasAuthenticatedRef = useRef(false);
  // Restoring a persisted session is not a sign-in action. Only the explicit
  // authenticating phase earns the post-sign-in landing behavior below; this is
  // what lets refreshes and pasted deep links remain at their requested URL.
  const interactiveSignInRef = useRef(false);
  /**
   * A destination that outlived the sign-in because the account still had to
   * create a profile first. Onboarding interrupts the journey; it does not
   * cancel it, so the destination waits here and is fulfilled afterwards.
   */
  const deferredIntentRef = useRef<AuthIntent | null>(null);
  /*
   * True for the one pass where an account-only URL was left behind by signing
   * out rather than asked for by a guest. That URL is not a destination anybody
   * requested, so the gate must not remember it.
   */
  const signedOutOfProtectedRef = useRef(false);
  /** Takes the person to the destination they were originally reaching for. */
  function fulfilIntent(intent: AuthIntent) {
    if (intent.kind === 'interaction') {
      // The action itself is never replayed — an account mutation must not fire
      // on its own. The person is simply let through.
      return;
    }
    // The sheet is gone by now, so focus belongs on the destination rather than
    // the Sign in control that no longer applies.
    requestAnimationFrame(() => mainContentRef.current?.focus());
    if (intent.kind === 'route') {
      // A URL the person asked for while signed out. It is continued to verbatim,
      // so a pasted or refreshed protected destination survives the whole gate.
      nav.to(intent.path, true);
      return;
    }
    if (intent.kind === 'studio') {
      nav.studio();
      return;
    }
    if (intent.kind === 'create-project') {
      setIsGlobalCreatePending(true);
      if (auth.viewerProfileId) {
        nav.profile(auth.viewerProfileId);
      }
      return;
    }
    if (intent.kind === 'messages') {
      nav.messages(undefined, false, intent.recipientProfileId);
      return;
    }
    // `my-profile` is the only intent that resolves through the authenticated
    // account's own id; every other destination was named explicitly.
    if (intent.kind === 'my-profile') {
      if (auth.viewerProfileId) {
        nav.profile(auth.viewerProfileId);
      }
      return;
    }
    if (intent.kind === 'view-portfolio' && intent.categoryId) {
      nav.category(intent.profileId, intent.categoryId);
      return;
    }
    nav.profile(intent.profileId);
  }
  /**
   * The single post-authentication coordinator. It runs exactly once per
   * sign-in, on the transition into an authenticated session, and never on an
   * unrelated re-render — so nothing here can loop back into the gate.
   */
  useEffect(() => {
    if (auth.phase === 'authenticating') {
      interactiveSignInRef.current = true;
      return;
    }
    // Wait until identity is fully resolved, so nothing is fulfilled — or owner
    // UI shown — while it is still unknown whether this account has a profile.
    if (!auth.isAuthenticated) {
      interactiveSignInRef.current = false;
      /*
       * Signing out of an account-only surface leaves the person standing on a
       * URL they may no longer be there for. Leaving them on it would hand that
       * destination to the gate, and the next sign-in would return them to it
       * rather than to the front door — which is exactly what happened when
       * signing out of Messages. So the session ends at Home.
       */
      if (wasAuthenticatedRef.current && PROTECTED_ROUTE_KINDS.has(route.kind)) {
        signedOutOfProtectedRef.current = true;
        nav.home(true);
      }
      wasAuthenticatedRef.current = false;
      return;
    }
    if (onboardingStatus === 'unknown') {
      // Identity is still resolving. Leave the transition flag alone — marking
      // it here would make the later "ready" pass look like an ordinary
      // re-render, and the pending destination would never be fulfilled.
      return;
    }
    const justSignedIn = interactiveSignInRef.current;
    interactiveSignInRef.current = false;
    wasAuthenticatedRef.current = true;
    if (!justSignedIn) {
      // A session restored during initialization keeps the current URL. It did
      // not originate in the sign-in sheet and has no landing intent to fulfil.
      return;
    }
    // Signing in lands on Home — the product's front door — unless the person
    // was on their way somewhere more specific, in which case that destination
    // is honoured instead.
    const intent = auth.consumePendingIntent();
    // Creating a profile comes first, but the destination is not lost with it:
    // it waits and is honoured once onboarding finishes.
    if (onboardingStatus === 'required') {
      deferredIntentRef.current = intent ?? deferredIntentRef.current;
      setIsOnboardingOpen(true);
      return;
    }
    if (!intent || intent.kind === 'interaction') {
      /*
       * Nowhere specific was being reached for — either the person simply signed
       * in, or they were gated on an ACTION rather than a destination. Either
       * way the landing place is Home: the product's front door, rather than
       * whichever page the sign-in happened to be triggered from.
       */
      nav.home();
      requestAnimationFrame(() => mainContentRef.current?.focus());
      return;
    }
    fulfilIntent(intent);
    // The explicit phase distinguishes an interactive sign-in from restoring a
    // persisted session; neither unrelated renders nor refreshes earn a redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.phase, auth.isAuthenticated, auth.viewerProfileId, onboardingStatus]);
  /**
   * "My profile" means the authenticated account's own profile — never a
   * hardcoded id, and never one inferred from a name or an email.
   */
  function openOwnProfile() {
    if (!auth.isAuthenticated) {
      auth.requestAuthenticatedDestination({
        kind: 'my-profile'
      });
      return;
    }
    if (onboardingStatus === 'required') {
      setIsOnboardingOpen(true);
      return;
    }
    if (auth.viewerProfileId) {
      openProfile(auth.viewerProfileId);
    }
  }
  const activeCategory = isProfileRouteReady && viewedProfile ? viewedProfile.categories.find((category) => category.id === activeCategoryId) ?? null : null;
  // A category id in the URL that this profile does not hold is reported rather
  // than quietly replaced with another category.
  const isCategoryRouteMissing = isProfileRouteReady && activeCategoryId !== null && activeCategory === null;
  /**
   * Whether an account is required to be HERE. Reading a public profile, category,
   * or project never is; the account's own surfaces and the creator's own tools
   * are. This decides what the interface offers — it is not authorization, which
   * remains the service's decision.
   */
  const isProtectedRoute = PROTECTED_ROUTE_KINDS.has(route.kind);
  const isRouteBlocked = isProtectedRoute && !auth.isInitializing && !auth.isAuthenticated;
  /**
   * A protected URL asked for while signed out. The destination is preserved
   * verbatim and handed to the gate, so it survives sign-in — and profile
   * onboarding — and is continued to afterwards. The URL itself is left alone:
   * redirecting away would lose what the person asked for.
   */
  useEffect(() => {
    if (!isRouteBlocked) {
      return;
    }
    if (signedOutOfProtectedRef.current) {
      // Left behind by a sign-out, not asked for. The move to Home is already
      // under way, so nothing is remembered and no gate is raised.
      signedOutOfProtectedRef.current = false;
      return;
    }
    auth.requestAuthenticatedDestination({
      kind: 'route',
      path: `${pathname}${search}`,
      label: describeRoute(route)
    });
    // Keyed on the blocked destination, so it asks once per destination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteBlocked, pathname, search]);
  /**
   * A CREATOR surface reached by an account that has no profile yet. Account
   * settings are deliberately not included: they belong to the account, which
   * exists whether or not a profile does.
   */
  /**
   * A published portfolio category is public. Reading is open; only acting on what
   * you find needs an account.
   */
  function selectProfileCategory(categoryId: string) {
    // A category belongs to a profile, so there is nowhere to go without one.
    if (!viewedProfileId) {
      return;
    }
    // A portal replaces the contents of the existing mobile popup.
    if (isSharedRoute) {
      nav.sharedCategory(viewedProfileId, categoryId);
      return;
    }
    nav.category(viewedProfileId, categoryId);
  }
  function returnFromPortalCollection() {
    if (Number.isInteger(window.history.state?.idx) && window.history.state.idx > 0) { nav.back(); return; }
    nav.to(viewedProfileId ? buildPath(isSharedRoute ? 'sharedProfile' : 'profile', { profileId: viewedProfileId }) : buildPath('home'), true);
  }
  function returnFromPortal() {
    // React Router's index counts app entries; history.length includes other sites.
    const historyIndex = window.history.state?.idx;
    if (Number.isInteger(historyIndex) && historyIndex > 0) {
      nav.back();
      return;
    }
    const fallback = isSharedRoute && viewedProfileId ? buildPath('sharedProfile', { profileId: viewedProfileId })
      : isOwnerMode ? buildPath('portals')
      : viewedProfileId ? buildPath('profile', { profileId: viewedProfileId }) : buildPath('home');
    nav.to(fallback, true);
  }
  function returnToPortalCollection() {
    if (!viewedProfileId) return;
    const path = isSharedRoute ? buildPath('sharedProfile', { profileId: viewedProfileId })
      : isOwnerMode ? buildPath('portals')
      : `${buildPath('profile', { profileId: viewedProfileId })}?view=portals`;
    nav.to(path, true);
  }
  function continueToPortals() {
    const intent: AuthIntent = { kind: 'route', path: buildPath('portals'), label: 'open your portals' };
    if (!auth.isAuthenticated) {
      auth.requestAuthenticatedDestination(intent);
    } else if (onboardingStatus === 'required') {
      deferredIntentRef.current = intent;
      setIsOnboardingOpen(true);
    }
  }
  /**
   * The single door into a creator's profile. Every entry point — feed card,
   * project preview, search result, sidebar — comes through here, and it is a
   * navigation to a canonical URL rather than a state mutation.
   */
  function openProfile(profileId: string) {
    nav.profile(profileId);
  }
  // Publishing needs an account that owns this profile. A signed-in account
  // with no profile is onboarded rather than allowed to create orphaned work.
  function requestPublish() {
    if (onboardingStatus === 'required') {
      setIsOnboardingOpen(true);
      return;
    }
    if (!isOwnerMode) {
      return;
    }
    if (!activeCategory) {
      return;
    }
    setPublishTargetCategoryId(activeCategory.id);
    setPublishAccountId(auth.user?.id ?? null);
    setIsPublishOpen(true);
  }
  /**
   * Create is a primary action, independent of where the viewer happens to be.
   * It returns to the authenticated creator context, chooses the first category
   * as a sensible default, and only then starts the real draft lifecycle.
   */
  function requestGlobalPublish() {
    if (!auth.isAuthenticated) {
      auth.requestAuthenticatedDestination({ kind: 'create-project' });
      return;
    }
    if (onboardingStatus === 'required') {
      deferredIntentRef.current = { kind: 'create-project' };
      setIsOnboardingOpen(true);
      return;
    }
    if (!auth.viewerProfileId) {
      return;
    }
    setIsGlobalCreatePending(true);
    if (!isOwnerMode) {
      nav.profile(auth.viewerProfileId);
    }
  }
  useEffect(() => {
    if (!isGlobalCreatePending || !isOwnerMode || !viewedProfile) {
      return;
    }
    const target = activeCategory ?? viewedProfile.categories[0] ?? null;
    if (!target) {
      // Profile creation provisions a default category in production. If that
      // invariant is still settling, leave the intent pending instead of opening
      // a publisher that has nowhere truthful to place the project.
      return;
    }
    setPublishTargetCategoryId(target.id);
    setPublishAccountId(auth.user?.id ?? null);
    setIsPublishOpen(true);
    setGlobalCreateAccountId(null);
  }, [activeCategory, auth.user?.id, isGlobalCreatePending, isOwnerMode, viewedProfile]);
  const canShowPublisher = isPublishOpen && isOwnerMode && publishAccountId !== null
    && publishAccountId === auth.user?.id
    && Boolean(viewedProfile?.categories.some(category => category.id === publishTargetCategoryId));
  /** Opening or closing a project inside its category is a change of URL. */
  function selectProject(projectId: string | null, replace = false) {
    if (!activeCategory || !viewedProfileId) {
      return;
    }
    if (projectId) {
      if (isSharedRoute) {
        nav.sharedProject(viewedProfileId, activeCategory.id, projectId, replace);
        return;
      }
      nav.project(viewedProfileId, activeCategory.id, projectId, replace);
      return;
    }
    if (isSharedRoute) {
      nav.sharedCategory(viewedProfileId, activeCategory.id);
      return;
    }
    nav.category(viewedProfileId, activeCategory.id);
  }
  function toggleFollowProfile() {
    // Following is a real mutation, so it needs an account behind it.
    requireAuth(() => follows.toggle());
  }
  function openPortalink() {
    nav.portalink();
  }
  /**
   * Messages is a main destination like Studio: it replaces the content area
   * rather than floating above it. It needs an account, so a guest is sent
   * through the gate first.
   */
  function openMessages(recipientProfileId?: string) {
    const intent: AuthIntent = { kind: 'messages', ...(recipientProfileId ? { recipientProfileId } : {}) };
    if (!auth.isAuthenticated) {
      auth.requestAuthenticatedDestination(intent);
      return;
    }
    if (onboardingStatus === 'required') {
      deferredIntentRef.current = intent ?? deferredIntentRef.current;
      setIsOnboardingOpen(true);
      return;
    }
    nav.messages(undefined, false, recipientProfileId);
  }
  function navigateTo(destination: NavigationDestination) {
    // A record label is an editorial destination, not a creator profile: it never
    // opens a profile page built from a label name and a sample catalog.
    nav.destination(destination);
  }
  function saveProductDetailState(state: ProductDetailState) {
    productDetailStateRef.current = state;
  }
  /**
   * A project opens at its own URL, so the detail view survives a refresh and
   * closes with the browser's Back button. The record is resolved canonically
   * through the boundary, which is also what reports loading, not-found, and
   * failure — the view is only ever built from a confirmed record.
   */
  const [resolvedItem, setResolvedItem] = useState<{
    projectId: string;
    view: FeatureCardApp;
  } | null>(null);
  useEffect(() => {
    if (!routeItemId) {
      setResolvedItem(null);
      return;
    }
    if (resolvedItem?.projectId === routeItemId) {
      return;
    }
    resolveProject(routeItemId, (view) => setResolvedItem({
      projectId: routeItemId,
      view: toDetailView(view)
    }));
  }, [routeItemId, resolvedItem, resolveProject]);
  const selectedApp = routeItemId && resolvedItem?.projectId === routeItemId ? resolvedItem.view : null;
  const routeItemResolution = routeItemId && projectNavigation.resolution?.projectId === routeItemId ? projectNavigation.resolution : null;
  /**
   * A project opens in ONE place: the canonical project viewer at
   * `/p/:profileId/c/:categoryId/:projectId`. It used to open at `/item/:id`
   * when reached from discovery and at the canonical address when reached from a
   * portfolio, so the same work behaved differently depending on where it was
   * found. `/item/...` is now reserved for commerce and editorial products,
   * which are not projects.
   *
   * A surface holding a resolved project passes its address along and opens
   * immediately. One holding only an id (a search row) has the address resolved
   * through the service boundary first — the same boundary that reports
   * loading, not-found, and failure — so nothing opens on an unconfirmed record.
   */
  function openProjectById(
    projectId: Id,
    location?: ProjectLocation,
    options: { openEngagement?: boolean } = {}
  ) {
    // Where the viewer was when they chose this work, so the portal can offer a
    // way back to it. Transient by design: it is the current session's path, not
    // a stored preference, and it is recorded ONLY on this route — opening a
    // project from the portal's own index never sets it.
    if (location) {
      // Discovery is a deliberate entrance into one selected work. Preserve the
      // existing work-first index treatment, and make Home's requested social
      // context visible; subsequent project and portal choices do not touch
      // either value.
      setIsProjectIndexCollapsed(true);
      if (options.openEngagement) {
        setIsProjectEngagementOpen(true);
      }
      setDiscoveryReturn({
        path: `${pathname}${search}`,
        profileId: location.profileId
      });
      nav.project(location.profileId, location.categoryId, projectId);
      return;
    }
    const origin = `${pathname}${search}`;
    projectNavigation.resolveProject(projectId, (view) => {
      setIsProjectIndexCollapsed(true);
      if (options.openEngagement) {
        setIsProjectEngagementOpen(true);
      }
      setDiscoveryReturn({
        path: origin,
        profileId: view.creator.id
      });
      nav.project(view.creator.id, view.project.categoryId, view.project.id);
    });
  }
  function closeAppDetail() {
    nav.back();
  }
  /**
   * Opening a creator by id, from an attribution, a search hit, or the feed. The
   * profile route confirms the id through the read boundary, so a creator id that
   * resolves to nothing shows a not-found rather than a page assembled from a
   * display name.
   */
  function openFeedCreator(creatorId: Id) {
    nav.profile(creatorId);
  }
  function closeUserProfile() {
    nav.back();
  }
  // Resolved only when a preference that feeds it actually changes. These two
  // resolvers build whole token maps, and they were being re-run — and the style
  // object rebuilt — on every render of the root, which is every keystroke,
  // hover, and navigation in the product.
  /**
   * When the URL names something that cannot be shown, the page says so. None of
   * these fall back to another record or to sample content: a blocked destination
   * is preserved, an unknown address is reported, and an id that resolves to
   * nothing produces a not-found rather than somebody else's work.
   */
  const routeStateView = isProfileEditorRoute && (auth.isInitializing || auth.phase === 'authenticating' || auth.phase === 'signing-out') ? <LoadingState label="Opening profile editor…" /> : isRouteBlocked ? <EmptyState title="Sign in required" description={`Sign in to ${describeRoute(route)}. This page will reopen after sign-in.`} action={{
    label: 'Sign in',
    onClick: () => auth.requestAuth('signIn')
  }} /> : isProfileEditorRoute && !auth.viewerProfileId ? <EmptyState title="Create your profile first" description={auth.user?.isEmailVerified ? 'Create your profile before editing its details.' : 'Confirm your email address before creating your profile.'} action={{
    label: auth.user?.isEmailVerified ? 'Create profile' : 'Back',
    onClick: () => {
      if (!auth.user?.isEmailVerified) { closeProfileEditor(); return; }
      deferredIntentRef.current = { kind: 'route', path: buildPath('profileEditor'), label: 'edit your profile' };
      setIsOnboardingOpen(true);
    }
  }} /> : route.kind === 'unknown' ? <EmptyState title="Page not found" description="Check the address, or return home." action={{
    label: 'Go home',
    onClick: () => nav.home()
  }} /> : routeItemId && !selectedApp && (!routeItemResolution || routeItemResolution.state === 'loading') ? <LoadingState label="Opening item…" /> : routeItemId && routeItemResolution?.state === 'not-found' ? <EmptyState title="Item not found" description="It may have been removed. Check the link, or return home." action={{
    label: 'Go home',
    onClick: () => nav.home()
  }} /> : routeItemId && routeItemResolution?.state === 'error' ? <ErrorState title="Unable to open item" description="Check the connection, then try again." onRetry={projectNavigation.retry ?? undefined} /> : routeProfileId && viewedProfileQuery.status === 'loading' ? <LoadingState label="Opening profile…" /> : routeProfileId && viewedProfileQuery.status === 'not-found' ? <EmptyState title="Profile not found" description={isSharedRoute ? 'This shared profile is unavailable or no longer public.' : 'It may have been removed. Return home to browse creators and work.'} action={isSharedRoute ? undefined : {
    label: 'Go home',
    onClick: () => nav.home()
  }} /> : routeProfileId && viewedProfileQuery.status === 'error' ? <ErrorState title="Unable to open profile" description={viewedProfileQuery.error ?? 'Check the connection, then try again.'} onRetry={viewedProfileQuery.retry} /> : isPrivateProfileAccessResolving ? <LoadingState label="Checking profile access…" /> : isProfileAccessDenied ? <EmptyState title="Profile unavailable" description={isSharedRoute ? 'This profile is not published through a public link.' : 'This creator has limited their profile to approved followers.'} action={isSharedRoute ? undefined : {
    label: 'Go home',
    onClick: () => nav.home()
  }} /> : isCategoryRouteMissing ? <EmptyState title="Portal not found" description="It may have been renamed or removed." action={{
    label: viewedProfile ? `Back to ${viewedProfile.name}` : 'Back to the profile',
    onClick: () => {
      if (viewedProfileId) {
        if (isSharedRoute) {
          nav.sharedProfile(viewedProfileId);
        } else {
          nav.profile(viewedProfileId);
        }
      }
    }
  }} /> : null;
  /*
   * The discovery feed scrolls ITSELF, because its search field has to hold its
   * place on screen while the work moves under it. That only works if the page
   * wrapper is given a definite height — otherwise it grows to the content, the
   * shell scrolls instead, and the field travels away with the grid. So the feed
   * joins the views that manage their own scrolling. The condition mirrors the
   * branch that actually renders the feed, so no other view is constrained by it.
  */
  const isFeedView = !isProfileEditorRoute && !personalScreen && !routeStateView && !isControlCenterOpen && !iconPickerCategoryId && !inDesignFeature && !isMessagesOpen && !isSearchOpen && !(routeActivityKind && isProfileRouteReady && viewedProfile) && !(activeCategory && viewedProfile) && !((route.kind === 'profile' || route.kind === 'sharedProfile') && isProfileRouteReady && viewedProfile) && (activeDestination === 'Today' || isEditorialDestination(activeDestination));
  /**
   * One stable identity per workspace. Project selection remains inside its
   * category workspace, so its canvases and local viewer state are not remounted
   * merely to animate a route. Full workspace navigation receives a new layer.
   */
  const screenTransitionKey = routeStateView ? `route-state-${pathname}` : isProfileEditorRoute ? `profile-editor-${auth.user?.id ?? 'guest'}-${auth.viewerProfileId ?? 'setup'}` : personalScreen ? `personal-${personalScreen}-${auth.user?.id ?? 'guest'}` : isControlCenterOpen ? 'control-center' : iconPickerCategoryId ? `icon-picker-${iconPickerCategoryId}` : inDesignFeature ? `in-design-${inDesignFeature.toLowerCase()}` : isMessagesOpen ? 'messages' : isSearchOpen ? 'search' : routeActivityKind && viewedProfileId ? `activity-${viewedProfileId}-${routeActivityKind}` : activeCategoryId ? `${isSharedRoute ? 'shared-' : ''}category-${viewedProfileId}-${activeCategoryId}` : (route.kind === 'profile' || route.kind === 'sharedProfile') && viewedProfileId ? `${isSharedRoute ? 'shared-' : ''}profile-${viewedProfileId}` : activeDestination;
  const screenMainClassName = `scroll-edge-fade is-at-top min-h-0 w-full flex-1 ${isProfileEditorRoute || activeCategory || isSearchOpen || isMessagesOpen || inDesignFeature ? 'overflow-hidden' : 'overflow-y-auto'} ${activeCategory ? '' : 'mono-icons'}`;
  const screenAriaLabel = isControlCenterOpen ? 'Settings' : isProfileEditorRoute ? 'Edit profile' : personalScreen ?? inDesignFeature ?? (isMessagesOpen ? 'Messages' : isSearchOpen ? 'Search and browse' : activeCategory ? `${viewedProfile?.name ?? 'Portfolio'} · ${activeCategory.label}${isSharedRoute ? ' · shared read-only view' : ''}` : (route.kind === 'profile' || route.kind === 'sharedProfile') && viewedProfile ? `${viewedProfile.name} profile${isSharedRoute ? ' · shared read-only view' : ''}` : selectedApp ? `${selectedApp.name} details` : `${activeDestination} content`);
  const portalsPage = <PortalsPage key={`${auth.user?.id ?? 'guest'}:${viewedProfileId ?? 'setup'}`} profileQuery={viewedProfileQuery} profileContext={route.kind === 'profile'} onboardingStatus={onboardingStatus} management={management} accentColor={interfaceAccentColor} theme={interfaceTheme} onChangeCategoryIcon={setIconPickerCategoryId} onContinue={continueToPortals} onSelectCategory={selectProfileCategory} onBack={returnFromPortalCollection} />;
  const categoryPage = activeCategory && viewedProfile ? <ProfileCategoryPage profile={viewedProfile} category={activeCategory} viewerRole={viewerRole} activeProjectId={activeProjectId} onBack={returnFromPortal} onBackToPortals={returnToPortalCollection} onSelectProject={selectProject} onCreateProject={isOwnerMode ? requestPublish : undefined} isIndexCollapsed={isSharedRoute ? isSharedProjectIndexCollapsed : isProjectIndexCollapsed} onIndexCollapsedChange={isSharedRoute ? setIsSharedProjectIndexCollapsed : setIsProjectIndexCollapsed} isEngagementOpen={isSharedRoute ? isSharedProjectDescriptionOpen : isProjectEngagementOpen} onEngagementOpenChange={isSharedRoute ? setIsSharedProjectDescriptionOpen : setIsProjectEngagementOpen} sharedReadOnly={isSharedRoute} onReturnToDiscovery={!isSharedRoute && discoveryReturn ? () => {
        const target = discoveryReturn.path;
        const viewTransition = activeProjectId ? beginProjectContinuity(activeProjectId, 'return') : false;
        setDiscoveryReturn(null);
        nav.to(target, false, viewTransition);
      } : undefined} /> : null;
  const mobileWallScrollKey = `mobile-profile-wall:${auth.user?.id ?? 'guest'}:${viewedProfile?.id}:${isSharedRoute}`;
  const profilePage = viewedProfile ? <UserProfilePage key={`${auth.user?.id ?? 'guest'}:${viewedProfile.id}:${isSharedRoute}`} profile={viewedProfile} onBack={closeUserProfile} mobilePortalsView={portalsPage} mobileWallScrollMemory={{
    read: () => scrollPositionsRef.current.get(mobileWallScrollKey) ?? 0,
    save: top => { scrollPositionsRef.current.set(mobileWallScrollKey, top); }
  }} onMobileViewChange={(view) => {
        const path = buildPath(isSharedRoute ? 'sharedProfile' : 'profile', { profileId: viewedProfile.id });
        const target = view === 'projects' ? path : `${path}?view=${view}`;
        if (target !== `${pathname}${search}`) nav.to(target);
      }} viewerRole={viewerRole} isSharedView={isSharedRoute} onBeforeShare={creatorAppearance.flush} shareUrl={isOwnerMode ? `${window.location.origin}${buildPath('sharedProfile', {
        profileId: viewedProfile.id
      })}` : undefined} follow={isSharedRoute ? undefined : {
        isFollowing: follows.isFollowing,
        isRequested: follows.isRequested,
        isResolving: follows.isResolving,
        resolveError: follows.resolveError,
        isPending: follows.isPending,
        mutationError: follows.mutationError,
        onToggle: toggleFollowProfile,
        onRetry: follows.retryMutation
      }} onSignInRequest={isSharedRoute ? undefined : () => auth.requestAuth('signIn')} onOpenProject={(projectId, categoryId, options) => {
        if (isSharedRoute) {
          nav.sharedProject(viewedProfile.id, categoryId, projectId);
          return;
        }
        if (options?.openComments) {
          setIsProjectEngagementOpen(true);
        }
        // The profile is the entrance to this creator's Portal, not a discovery
        // feed. Navigate directly so the Portal index opens alongside the chosen
        // project; discovery-only return state would intentionally collapse it.
        nav.project(viewedProfile.id, categoryId, projectId);
      }} onPublishProject={isOwnerMode ? requestGlobalPublish : undefined} onEditProfile={isOwnerMode ? nav.profileEditor : undefined} onCollaboration={() => openMessages(auth.viewerProfileId === viewedProfile.id ? undefined : viewedProfile.id)} onMessage={() => openMessages(auth.viewerProfileId === viewedProfile.id ? undefined : viewedProfile.id)} onAddCategory={isOwnerMode ? (label, iconName) => setAddCategoryRequest((request) => ({
        nonce: (request?.nonce ?? 0) + 1,
        label,
        iconName
      })) : undefined} onOpenActivity={isOwnerMode ? (kind) => nav.activity(viewedProfile.id, kind) : undefined} /> : null;
  const canShowOwnPortalsWorkspace = profilePage && isOwnerMode && auth.isAuthenticated && !auth.isInitializing && auth.phase !== 'signing-out' && viewedProfileQuery.status === 'ready' && onboardingStatus !== 'required';
  const mobilePortalsWorkspace = canShowOwnPortalsWorkspace
    ? <MobileProfileWorkspace overview={profilePage} view="portals">{portalsPage}</MobileProfileWorkspace>
    : portalsPage;
  const mobileProfileKey = !isProfileEditorRoute && !routeStateView && !personalScreen && !isControlCenterOpen && !iconPickerCategoryId && viewedProfile &&
    (categoryPage || ((route.kind === 'profile' || route.kind === 'sharedProfile') && isProfileRouteReady) || (isPortalsOpen && canShowOwnPortalsWorkspace))
      ? `mobile-profile-${auth.user?.id ?? 'guest'}-${viewedProfile.id}-${isSharedRoute}` : undefined;
  const screenContent = <div data-screen-scroll={isProfileEditorRoute || activeCategory || isMessagesOpen || isSearchOpen || isFeedView || isPortalsOpen ? 'nested' : 'page'} className={`feed-starfield min-h-full ${isProfileEditorRoute || activeCategory || isMessagesOpen || isSearchOpen || isFeedView || isPortalsOpen ? 'h-full' : ''}`}>
      <DeferredSurfaceBoundary active resetKey={screenTransitionKey} onClose={() => {
        if (isProfileEditorRoute) closeProfileEditor();
        else if (isControlCenterOpen) nav.closeSettings();
        else if (iconPickerCategoryId) {
          management.dismissFailure();
          setAttemptedIconName(null);
          setIconPickerCategoryId(null);
        } else nav.back();
      }}><React.Suspense fallback={<div className="flex h-full min-h-[280px] items-center justify-center"><LoadingState label="Opening" /></div>}>
      {routeStateView ? <div className="px-[var(--content-gutter)] py-10">{routeStateView}</div> : isProfileEditorRoute && auth.isAuthenticated && auth.viewerProfileId ? <ProfileEditorPage key={auth.viewerProfileId} profileId={auth.viewerProfileId} onClose={closeProfileEditor} onSaved={closeProfileEditor} /> : isControlCenterOpen ? <ControlCenterPage onOpenProfile={openOwnProfile} appearanceSaving={creatorAppearance.saving} appearanceError={creatorAppearance.saveError ?? creatorAppearance.loadError} onRetryAppearance={() => { if (creatorAppearance.loadError) creatorAppearance.retryLoad(); else void creatorAppearance.flush().catch(() => undefined); }} theme={theme} appearanceMode={appearanceMode} onAppearanceModeChange={chooseAppearanceMode} systemGray={navSystemGray} onSystemGrayChange={setNavSystemGray} accentColor={accentColor} onAccentColorChange={setAccentColor} highContrast={highContrast} onHighContrastChange={setHighContrast} reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={setReduceTranslucency} onBack={nav.closeSettings} /> : iconPickerCategoryId ? <IconPickerPage categoryLabel={viewedProfile?.categories.find((category) => category.id === iconPickerCategoryId)?.label ?? 'Category'} currentIconName={management.categoryIcons[iconPickerCategoryId] ?? viewedProfile?.categories.find((category) => category.id === iconPickerCategoryId)?.iconName ?? ''} isSaving={management.pending?.kind === 'icon'} savingIconName={attemptedIconName} failureMessage={management.failure?.kind === 'icon' ? management.failure.message : null} onRetry={management.failure?.kind === 'icon' && attemptedIconName ? () => void chooseCategoryIcon(iconPickerCategoryId, attemptedIconName) : undefined} onDismissFailure={management.dismissFailure} onSelect={(iconName) => {
        // The picker remains an ordinary screen. Only this outer snapshot moves.
        void chooseCategoryIcon(iconPickerCategoryId, iconName);
      }} onBack={() => {
        management.dismissFailure();
        setAttemptedIconName(null);
        setIconPickerCategoryId(null);
      }} /> : isSavedOpen ? <SavedPage key={auth.user?.id} onBack={() => nav.back()} onOpenProject={openProjectById} /> : isActivityOpen ? <ActivityPage key={auth.user?.id} onBack={() => nav.back()} /> : isInsightsOpen ? <InsightsPage key={auth.user?.id} onBack={() => nav.back()} /> : inDesignFeature ? (isPortalsOpen ? mobilePortalsWorkspace : <FeatureInDesignPage feature={inDesignFeature} onBack={() => nav.back()} />) : isMessagesOpen ? <MessagesPage key={auth.viewerProfileId ?? auth.user?.id ?? 'guest'} onBack={() => nav.back()} initialRecipientId={route.kind === 'messages' ? route.recipientId ?? null : null} initialConversationId={route.kind === 'messages' ? route.conversationId ?? null : null} onConversationChange={(conversationId, replace) => nav.messages(conversationId ?? undefined, replace)} /> : isSearchOpen ? <SearchBrowsePage query={searchQuery} onQueryChange={changeSearchQuery} onOpenProject={openProjectById} onOpenCreator={(creatorId) => openFeedCreator(creatorId)} onWarmCreator={warmCreator} live={live} view={route.kind === 'portalink' ? route.locationId ? 'location' : 'world' : 'atlas'} locationId={route.kind === 'portalink' ? route.locationId ?? null : null} onOpenAtlas={() => nav.search('')} onOpenWorld={() => nav.portalink()} onOpenLocation={(locationId) => nav.to(`/portalink/${encodeURIComponent(locationId)}`)} /> : routeActivityKind && isProfileRouteReady && viewedProfile ? <div className="w-full">
          <ActivityCollectionPage key={`${auth.user?.id}:${viewedProfile.id}:${routeActivityKind}`} kind={routeActivityKind} profileName={viewedProfile.name} isViewerOwnCollection={auth.viewerProfileId !== null && auth.viewerProfileId === viewedProfile.id} onBack={() => nav.back()} onOpenProject={openProjectById} />
        </div> : categoryPage && profilePage ? <MobileProfileWorkspace overview={profilePage} projectSelected={activeProjectId !== null}>{categoryPage}</MobileProfileWorkspace> : (route.kind === 'profile' || route.kind === 'sharedProfile') && isProfileRouteReady && profilePage ? <MobileProfileWorkspace overview={profilePage} /> : <HomeFeed emptyAction={{ label: auth.isAuthenticated ? 'Publish a project' : 'Create your portfolio', onClick: requestGlobalPublish }} emptySecondaryAction={{ label: 'Explore the world', onClick: openPortalink }} isSidebarCollapsed={isSidebarCollapsed || isSignInExperienceOpen} showSearchPlaceholder={route.kind === 'home'} onOpenProject={(projectId, location) => openProjectById(projectId, location, {
        openEngagement: true
      })} onOpenCreator={(creatorId) => openFeedCreator(creatorId)} onWarmCreator={warmCreator} scrollMemoryKey="home" />}
      </React.Suspense></DeferredSurfaceBoundary>
    </div>;
  const rootTokenStyle = useMemo(() => ({
    '--accent-color': interfaceAccentColor,
    // The chosen accent resolves into its whole interaction family here, once,
    // so every component already reading an accent token updates immediately.
    ...resolveAccentTokens(interfaceAccentColor, interfaceTheme),
    // Neutral controls across the product read this shared family, so one
    // System Gray or accessibility change updates every interface surface.
    ...resolveNavButtonTokens(interfaceTheme, interfaceAccentColor, interfaceHighContrast, interfaceReduceTranslucency, interfaceNavSystemGray),
    // Selection and focus in the macOS token family follow the chosen accent,
    // rather than being pinned to a fixed blue. Their appearance-dependent
    // companions (labels, surfaces, fills, separators) resolve from the theme and
    // preference classes on this same element, so there is one source of truth.
    ...resolveMacTokens(interfaceAccentColor, interfaceTheme),
    // Interface typography is fixed; only project presentation varies.
    '--app-font': getTypefaceStack('default')
  }) as React.CSSProperties, [interfaceAccentColor, interfaceTheme, interfaceHighContrast, interfaceReduceTranslucency, interfaceNavSystemGray]);
  /*
   * The shell paints from the macOS token set: the window surface, the interface
   * face, and the primary label colour. `text-gray-900` was a hardcoded value
   * that could not follow the appearance setting; `--mac-label-primary` does,
   * inverting with `.theme-dark` on this same element.
   */
  return <AppPresentation data-layout-mode="adaptive" style={rootTokenStyle} className={`app-shell codex-shell ps-platform-ui accent-theme monochrome-ui theme-${interfaceTheme} ${isSharedRoute ? 'shared-portalink-shell' : ''} ${interfaceHighContrast ? 'high-contrast' : ''} ${interfaceReduceTranslucency ? 'reduce-translucency' : ''} app-typeface flex h-screen min-h-0 w-full overflow-hidden bg-[var(--mac-window-bg)] text-[var(--mac-label-primary)] antialiased`}>
      <MobileBackProvider onBack={isProfileEditorRoute ? closeProfileEditor : nav.back}>
      {!isProfileEditorRoute && (isSharedRoute ? viewedProfile && canReadViewedProfile ? <SharedProfileSidebar profile={viewedProfile} activeCategoryId={activeCategoryId} theme={interfaceTheme} onThemeChange={chooseTheme} onOpenCategory={(categoryId) => nav.sharedCategory(viewedProfile.id, categoryId)} onSettingsOpen={nav.controlCenter} /> : <aside aria-label="Shared Portalink" className="shared-profile-sidebar sidebar-starfield h-full w-[208px] shrink-0 lg:w-[216px] 2xl:w-[224px]" /> : <Sidebar liveShow={liveShow} onLeaveShow={live.leave} isHomeActive={route.kind === 'home'} isSearchActive={route.kind === 'search'} isPortalinkActive={route.kind === 'portalink'} isProfileActive={route.kind === 'profile' && route.profileId === auth.viewerProfileId} accentColor={accentColor} onControlCenterOpen={() => nav.controlCenter()} isAuthenticated={auth.isAuthenticated} isAuthActionPending={auth.phase === 'authenticating' || auth.phase === 'signing-out'} accountName={auth.user?.displayName} accountAvatar={viewedProfile?.id === auth.viewerProfileId ? viewedProfile.avatar : null} onSignIn={() => auth.requestAuth('signIn')} onSignOut={auth.signOut} management={management} onChangeCategoryIcon={setIconPickerCategoryId} isCollapsed={isSidebarCollapsed || isSignInExperienceOpen} onCollapsedChange={setIsSidebarCollapsed} onNavigate={navigateTo} onPortalinkOpen={openPortalink} addCategoryRequest={addCategoryRequest} onProfileOpen={openOwnProfile} profileHref={auth.viewerProfileId ? buildPath('profile', { profileId: auth.viewerProfileId }) : undefined} onMessagesOpen={openMessages} theme={theme} onThemeChange={chooseTheme} isMessagesActive={isMessagesOpen} isInsightsActive={isInsightsOpen} isActivityActive={isActivityOpen} isSavedActive={isSavedOpen} viewedProfile={viewedProfile} activeCategoryId={activeCategoryId} onCategorySelect={selectProfileCategory} isOwnerMode={isOwnerMode} />)}

      {/* Every surface renders in the interface face. Creator typography is
           carried by individual projects, not by the page around them, so the
           chrome reads the same on every profile. */}
      {/* The session's own conditions are stated above the page, because they
           belong to no single screen. */}
      <div className="codex-workspace flex min-w-0 flex-1 basis-0 flex-col">
      {!isSharedRoute && !isProfileEditorRoute && <SessionStatusBanner onCreateProfile={() => setIsOnboardingOpen(true)} />}
      {/* A creator opened from an attribution is now confirmed by the profile
             route's own read, whose loading, not-found, and retryable failure states
             render in the page area — so there is no second resolution path to
             report here. */}
      <div id="app-viewport" className={shouldReduceMotion ? 'app-viewport--reduce-motion' : undefined}>
        {!isSharedRoute && projectNavigation.resolution?.state === 'loading' && !routeItemId ? <div role="status" aria-live="polite" aria-label="Opening project" className="navigation-progress" /> : null}
        {!isSharedRoute && projectNavigation.resolution && projectNavigation.resolution.state !== 'loading' && !routeItemId ? <div role="alert" aria-live="polite" className="navigation-feedback shape-compact flex items-center gap-2.5 border border-[var(--hairline)] bg-[var(--surface-raised)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
            <AlertCircleIcon className="h-4 w-4 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {projectNavigation.resolution.state === 'not-found' ? 'That project no longer exists, so nothing was opened in its place.' : 'That project could not be opened.'}
            </span>
            {projectNavigation.retry && <button type="button" onClick={projectNavigation.retry} className="shrink-0 font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>}
            <button type="button" onClick={projectNavigation.dismiss} aria-label="Dismiss" className="shrink-0 text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Dismiss</button>
          </div> : null}
        <AppScreenLayers screenKey={screenTransitionKey} mobileProfileKey={mobileProfileKey} snapshot={{ mainClassName: screenMainClassName, ariaLabel: screenAriaLabel, content: screenContent }} reduceMotion={Boolean(shouldReduceMotion)} skipLayerTransition={isProjectContinuityActive()} mainContentRef={mainContentRef} onScroll={handleMainScroll} />
      </div>
      </div>

      <DeferredSurface active={Boolean(selectedApp)} onClose={closeAppDetail}><InteractionSafePresence isPresent={Boolean(selectedApp)}>
        {selectedApp && <AppDetailPage app={selectedApp} savedState={productDetailStateRef.current} onStateChange={saveProductDetailState} onBack={closeAppDetail} onOpenCreator={(creator) => openFeedCreator(creator.id)} />}
      </InteractionSafePresence></DeferredSurface>

      {/* The auth surface is application-level: any control can request it. */}
      {(!isOnboardingOpen || !auth.isAuthenticated || auth.pendingView === 'resetPassword' || auth.session?.isPasswordRecovery) && <DeferredDialog active={Boolean(auth.pendingView)} onClose={auth.closeAuth}><AuthDialog registrationReturnPath={presentation === 'mobile' ? (isSharedRoute ? readSharedReturnPath(pathname + search) : settingsReturnPath) : undefined} theme={theme} systemGray={navSystemGray} onSystemGrayChange={setNavSystemGray} accentColor={accentColor} onAccentColorChange={setAccentColor} highContrast={highContrast} onHighContrastChange={setHighContrast} reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={setReduceTranslucency} /></DeferredDialog>}

      {/* Publishing targets the category resolved when Create was pressed, so it
           works from every destination rather than only inside a category. */}
      <DeferredDialog key={auth.user?.id ?? 'guest'} active={canShowPublisher} onClose={() => { setIsPublishOpen(false); setPublishTargetCategoryId(null); }}><PublishProjectDialog isOpen={canShowPublisher} profileId={auth.viewerProfileId} categoryId={publishTargetCategoryId} categoryLabel={viewedProfile?.categories.find((category) => category.id === publishTargetCategoryId)?.label ?? 'Work'} onClose={() => {
        setIsPublishOpen(false);
        setPublishTargetCategoryId(null);
      }} onPublished={(result, title) => {
        const targetCategoryId = publishTargetCategoryId;
        setIsPublishOpen(false);
        setPublishTargetCategoryId(null);
        setPublishConfirmation({
          projectId: result.projectId,
          message: result.mediaPersisted && !result.sessionOnly
            ? `${title} published.`
            : `${title} added for this session only. Reloading will clear it.`,
        });
        // The new work opens where it landed, through the normal viewer.
        if (result.projectId && auth.viewerProfileId && targetCategoryId) {
          nav.project(auth.viewerProfileId, targetCategoryId, result.projectId);
        }
        requestAnimationFrame(() => mainContentRef.current?.focus({ preventScroll: true }));
      }} /></DeferredDialog>
      <PublishConfirmation message={publishConfirmation?.message ?? null} />

      {/* Onboarding opens only when a creator surface needs a profile. */}
      {isOnboardingOpen && auth.isAuthenticated && !auth.session?.isPasswordRecovery && auth.pendingView !== 'resetPassword' && <DeferredSurface active onClose={() => { setIsOnboardingOpen(false); deferredIntentRef.current = null; }}><ProfileOnboardingDialog theme={theme} systemGray={navSystemGray} onSystemGrayChange={setNavSystemGray} key={auth.user?.id} accentColor={accentColor} onAccentColorChange={setAccentColor} highContrast={highContrast} onHighContrastChange={setHighContrast} reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={setReduceTranslucency} isOpen={isOnboardingOpen} completionActionLabel={deferredIntentRef.current?.kind === 'create-project' ? 'Publish your first project' : deferredIntentRef.current?.kind === 'messages' ? 'Continue to messages' : 'Open profile'} onDismiss={() => {
        setIsOnboardingOpen(false);
        // Abandoning onboarding abandons the journey it interrupted.
        deferredIntentRef.current = null;
      }} onComplete={(profileId) => {
        setIsOnboardingOpen(false);
        // The destination that survived onboarding resolves now; a person who was
        // only creating a profile lands on the profile they just made.
        const deferred = deferredIntentRef.current;
        deferredIntentRef.current = null;
        if (deferred && deferred.kind !== 'my-profile' && deferred.kind !== 'interaction') {
          fulfilIntent(deferred);
          return;
        }
        openProfile(profileId);
      }} /></DeferredSurface>}

      </MobileBackProvider>
    </AppPresentation>;
}
function isEditorialDestination(destination: NavigationDestination) {
  return destination === 'Today' || destination === 'Games' || destination === 'Apps' || destination === 'Arcade' || (portfolioCategories as readonly string[]).includes(destination);
}
