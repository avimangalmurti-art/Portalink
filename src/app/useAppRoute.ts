import { useEffect, useMemo, useRef } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { buildPath, destinationFromSlug, destinationPath, routes } from './routes';
import { activityKindFromSlug, activitySlugForKind } from '../types/engagement';
import type { EngagementKind } from '../types/engagement';
import type { NavigationDestination } from '../components/navigation';
import type { Id } from '../types/domain';
import { beginProjectContinuity } from '../utils/projectContinuity';

/**
 * The URL, read as a destination.
 *
 * This is the application's navigation state. The shell used to keep a parallel
 * state machine — a destination, a viewed profile, a category, a project, four
 * booleans, and a hand-rolled history array — which meant no destination could be
 * linked to, refreshed, or reached with the browser's own Back button. Everything
 * that a URL can express is now derived from the URL, and React state is left to
 * genuinely transient things: dialogs, forms, splash, and pending requests.
 */
export type AppRoute = {
  kind: 'home';
} | {
  kind: 'profileEditor';
} | {
  kind: 'destination';
  destination: NavigationDestination;
} | {
  kind: 'portalink';
  locationId?: Id;
} | {
  kind: 'search';
  query: string;
} | {
  kind: 'profile';
  profileId: Id;
} | {
  kind: 'collaboration' | 'sharedCollaboration';
  profileId: Id;
} | {
  kind: 'category';
  profileId: Id;
  categoryId: Id;
} | {
  kind: 'project';
  profileId: Id;
  categoryId: Id;
  projectId: Id;
} | {
  kind: 'sharedProfile';
  profileId: Id;
} | {
  kind: 'sharedCategory';
  profileId: Id;
  categoryId: Id;
} | {
  kind: 'sharedProject';
  profileId: Id;
  categoryId: Id;
  projectId: Id;
} | {
  /** One of the viewer's own engagement collections: Likes, Saved, Reposts. */
  kind: 'activity';
  profileId: Id;
  activityKind: EngagementKind;
} | {
  kind: 'item';
  projectId: Id;
} | {
  kind: 'portals';
} | {
  kind: 'insights';
} | {
  kind: 'studio';
} | {
  kind: 'messages';
  conversationId?: Id;
  recipientId?: Id;
} | {
  kind: 'saved';
} | {
  kind: 'notifications';
} | {
  kind: 'controlCenter';
} | {
  /** A path that matches no declared route. Reported, never quietly redirected. */
  kind: 'unknown';
};

/**
 * Destinations that genuinely require an account, as opposed to ones that merely
 * belong to a creator. Reading a public profile, category, or project is open to
 * guests; these are the account itself and the creator's own tools.
 */
export const PROTECTED_ROUTE_KINDS: ReadonlySet<AppRoute['kind']> = new Set(['messages', 'saved', 'notifications', 'insights', 'profileEditor']);

/** What the person was reaching for, for the auth gate's wording. */
export function describeRoute(route: AppRoute): string {
  switch (route.kind) {
    case 'profileEditor':
      return 'edit your profile';
    case 'studio':
      return 'open Studio';
    case 'messages':
      return 'read your messages';
    case 'saved':
      return 'open your saved library';
    case 'notifications':
      return 'view your activity';
    case 'insights':
      return 'view your private insights';
    default:
      return 'continue';
  }
}
function parse(pathname: string, search: string): AppRoute {
  if (matchPath(routes.profileEditor.path, pathname)) return { kind: 'profileEditor' };
  for (const kind of ['collaboration', 'sharedCollaboration'] as const) {
    const match = matchPath(routes[kind].path, pathname);
    if (match?.params.profileId) return { kind, profileId: match.params.profileId };
  }
  // Most specific first: a project path also matches its category path.
  const sharedProject = matchPath(routes.sharedProject.path, pathname);
  if (sharedProject?.params.profileId && sharedProject.params.categoryId && sharedProject.params.projectId) {
    return {
      kind: 'sharedProject',
      profileId: sharedProject.params.profileId,
      categoryId: sharedProject.params.categoryId,
      projectId: sharedProject.params.projectId
    };
  }
  const sharedCategory = matchPath(routes.sharedProfileCategory.path, pathname);
  if (sharedCategory?.params.profileId && sharedCategory.params.categoryId) {
    return {
      kind: 'sharedCategory',
      profileId: sharedCategory.params.profileId,
      categoryId: sharedCategory.params.categoryId
    };
  }
  const sharedProfile = matchPath(routes.sharedProfile.path, pathname);
  if (sharedProfile?.params.profileId) {
    return {
      kind: 'sharedProfile',
      profileId: sharedProfile.params.profileId
    };
  }
  const project = matchPath(routes.project.path, pathname);
  if (project?.params.profileId && project.params.categoryId && project.params.projectId) {
    return {
      kind: 'project',
      profileId: project.params.profileId,
      categoryId: project.params.categoryId,
      projectId: project.params.projectId
    };
  }
  // `/p/:id/activity/:kind` before the profile path, and distinct from a category
  // path by its literal segment. An unrecognised kind is reported, never defaulted
  // to Likes — a URL nobody wrote should not silently become one that works.
  const activity = matchPath(routes.activity.path, pathname);
  if (activity?.params.profileId && activity.params.activityKind) {
    const activityKind = activityKindFromSlug(activity.params.activityKind);
    return activityKind ? {
      kind: 'activity',
      profileId: activity.params.profileId,
      activityKind
    } : {
      kind: 'unknown'
    };
  }
  const category = matchPath(routes.profileCategory.path, pathname);
  if (category?.params.profileId && category.params.categoryId) {
    return {
      kind: 'category',
      profileId: category.params.profileId,
      categoryId: category.params.categoryId
    };
  }
  const profile = matchPath(routes.profile.path, pathname);
  if (profile?.params.profileId) {
    return {
      kind: 'profile',
      profileId: profile.params.profileId
    };
  }
  const item = matchPath(routes.productDetail.path, pathname);
  if (item?.params.productId) {
    return {
      kind: 'item',
      projectId: item.params.productId
    };
  }
  const location = matchPath(routes.location.path, pathname);
  if (location?.params.locationId) {
    return {
      kind: 'portalink',
      locationId: location.params.locationId
    };
  }
  const destination = matchPath(routes.destination.path, pathname);
  if (destination?.params.destinationSlug) {
    // Legacy editorial feeds contained prototype-only content. Keep their old
    // URLs from exposing sample work in production; Home is now the only feed.
    return {
      kind: 'unknown'
    };
  }
  if (matchPath(routes.controlCenter.path, pathname) || matchPath('/appearance', pathname)) {
    return {
      kind: 'controlCenter'
    };
  }
  if (matchPath(routes.messages.path, pathname)) {
    const params = new URLSearchParams(search);
    const conversationId = params.get('conversation')?.trim() || undefined;
    const recipientId = params.get('recipient')?.trim() || undefined;
    return {
      kind: 'messages',
      ...(conversationId ? { conversationId } : {}),
      ...(recipientId ? { recipientId } : {}),
    };
  }
  if (matchPath(routes.saved.path, pathname)) return { kind: 'saved' };
  if (matchPath(routes.notifications.path, pathname)) return { kind: 'notifications' };
  if (matchPath(routes.portals.path, pathname)) {
    return {
      kind: 'portals'
    };
  }
  if (matchPath(routes.insights.path, pathname)) {
    return {
      kind: 'insights'
    };
  }
  if (matchPath(routes.studio.path, pathname)) {
    return {
      kind: 'studio'
    };
  }
  if (matchPath(routes.portalink.path, pathname)) {
    return {
      kind: 'portalink'
    };
  }
  if (matchPath(routes.discovery.path, pathname)) {
    return {
      kind: 'search',
      query: ''
    };
  }
  if (matchPath(routes.search.path, pathname)) {
    return {
      kind: 'search',
      query: new URLSearchParams(search).get('q') ?? ''
    };
  }
  if (matchPath(routes.home.path, pathname)) {
    return {
      kind: 'home'
    };
  }
  return {
    kind: 'unknown'
  };
}
export function useAppRoute(): AppRoute {
  const {
    pathname,
    search
  } = useLocation();
  const navigate = useNavigate();
  // `/discover` is retained as a compatibility address for the old discovery
  // surface. Global discovery now has the explicit `/search` address.
  useEffect(() => {
    if (matchPath(routes.discovery.path, pathname)) {
      navigate(routes.search.path, { replace: true });
    }
  }, [navigate, pathname]);
  return useMemo(() => parse(pathname, search), [pathname, search]);
}

/**
 * Navigation, expressed as destinations rather than state mutations. Every path
 * comes from the route map, so a template only ever exists in one place.
 */
export function useRouteNavigator() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  return useMemo(() => ({
    /** `replace` when Home is a correction rather than a step — signing out of
     *  an account-only surface, say — so Back does not return to it. */
    home: (replace = false) => navigate(routes.home.path, {
      replace
    }),
    destination: (destination: NavigationDestination) => navigate(destinationPath(destination)),
    discover: () => navigate(routes.home.path),
    portalink: () => navigate(routes.portalink.path),
    /** `replace` while typing, so a search does not fill the history stack. */
    search: (query: string, replace = false) => navigate(query ? `${routes.search.path}?q=${encodeURIComponent(query)}` : routes.search.path, {
      replace
    }),
    profile: (profileId: Id) => navigate(buildPath('profile', {
      profileId
    })),
    collaboration: (profileId: Id, shared = false) => {
      const current = locationRef.current;
      navigate(buildPath(shared ? 'sharedCollaboration' : 'collaboration', { profileId }), {
        state: { collaborationReturn: `${current.pathname}${current.search}${current.hash}` }
      });
    },
    closeCollaboration: (profileId: Id, shared = false) => {
      const state: unknown = locationRef.current.state;
      const returnPath = state && typeof state === 'object' && 'collaborationReturn' in state ? state.collaborationReturn : null;
      const fallback = buildPath(shared ? 'sharedProfile' : 'profile', { profileId });
      // Only a recorded entry from this creator's profile earns browser Back.
      // A pasted URL returns to the profile without leaving the application.
      if (typeof returnPath === 'string' && returnPath.split(/[?#]/)[0].replace(/\/$/, '') === fallback && window.history.state?.idx > 0) {
        navigate(-1);
      } else {
        navigate(fallback, { replace: true });
      }
    },
    profileEditor: () => {
      const current = locationRef.current;
      if (matchPath(routes.profileEditor.path, current.pathname)) return;
      navigate(routes.profileEditor.path, {
        state: { profileEditorReturn: `${current.pathname}${current.search}${current.hash}` }
      });
    },
    closeProfileEditor: (profileId: Id | null) => {
      const state: unknown = locationRef.current.state;
      const returnPath = state && typeof state === 'object' && 'profileEditorReturn' in state ? state.profileEditorReturn : null;
      // History state survives refresh. Only an entry pushed by Edit profile
      // earns browser Back; a pasted URL must stay in the app instead.
      if (typeof returnPath === 'string' && returnPath.startsWith('/') && !returnPath.startsWith('//') &&
        !matchPath(routes.profileEditor.path, returnPath.split(/[?#]/)[0]) && window.history.state?.idx > 0) {
        navigate(-1);
      } else {
        navigate(profileId ? buildPath('profile', { profileId }) : routes.home.path, { replace: true });
      }
    },
    sharedProfile: (profileId: Id) => navigate(buildPath('sharedProfile', {
      profileId
    })),
    sharedCategory: (profileId: Id, categoryId: Id) => navigate(buildPath('sharedProfileCategory', {
      profileId,
      categoryId
    })),
    sharedProject: (profileId: Id, categoryId: Id, projectId: Id, replace = false) => {
      const viewTransition = !replace && beginProjectContinuity(projectId);
      navigate(buildPath('sharedProject', {
        profileId,
        categoryId,
        projectId
      }), {
        replace,
        viewTransition
      });
    },
    category: (profileId: Id, categoryId: Id) => navigate(buildPath('profileCategory', {
      profileId,
      categoryId
    })),
    /**
     * `replace` for a selection the viewer did not make — opening a portal lands
     * on its first project, and that must not become a history entry, or Back
     * would return to a bare category that immediately re-selects it.
     */
    project: (profileId: Id, categoryId: Id, projectId: Id, replace = false) => {
      const viewTransition = !replace && beginProjectContinuity(projectId);
      navigate(buildPath('project', {
        profileId,
        categoryId,
        projectId
      }), {
        replace,
        viewTransition
      });
    },
    /** The URL says `likes`/`saved`/`reposts`; the domain says like/save/repost. */
    activity: (profileId: Id, activityKind: EngagementKind) => navigate(buildPath('activity', {
      profileId,
      activityKind: activitySlugForKind(activityKind)
    })),
    item: (projectId: Id) => navigate(buildPath('productDetail', {
      productId: projectId
    })),
    portals: () => navigate(routes.portals.path),
    insights: () => navigate(routes.insights.path),
    studio: () => navigate(routes.studio.path),
    messages: (conversationId?: Id, replace = false, recipientId?: Id) => {
      const params = new URLSearchParams();
      if (conversationId) params.set('conversation', conversationId);
      if (recipientId) params.set('recipient', recipientId);
      navigate(`${routes.messages.path}${params.size ? `?${params.toString()}` : ''}`, { replace });
    },
    controlCenter: () => {
      const current = locationRef.current;
      if (matchPath(routes.controlCenter.path, current.pathname) || matchPath('/appearance', current.pathname)) return;
      navigate(routes.controlCenter.path, { state: { settingsReturn: `${current.pathname}${current.search}${current.hash}` } });
    },
    closeSettings: () => {
      const state: unknown = locationRef.current.state;
      const returnPath = state && typeof state === 'object' && 'settingsReturn' in state ? state.settingsReturn : null;
      if (typeof returnPath === 'string' && returnPath.startsWith('/') && !returnPath.startsWith('//') &&
        ![routes.controlCenter.path, '/appearance'].includes(returnPath.split(/[?#]/)[0].replace(/\/+$/, '')) && window.history.state?.idx > 0) {
        navigate(-1);
      } else {
        navigate(routes.home.path, { replace: true });
      }
    },
    /** Browser history owns Back. Nothing reconstructs the trail by hand. */
    back: () => navigate(-1),
    to: (path: string, replace = false, viewTransition = false) => navigate(path, {
      replace,
      viewTransition
    })
  }), [navigate]);
}

/**
 * PREVIEW ONLY. Magic Patterns screen presets describe a destination as the old
 * in-memory state shape. They are translated into a canonical path exactly once,
 * at startup, so presets keep working for development while routing stays the
 * single source of truth from then on.
 */
export function screenPresetPath(preset: Record<string, unknown>): string | null {
  const profileId = typeof preset.viewedProfileId === 'string' ? preset.viewedProfileId : null;
  const categoryId = typeof preset.activeCategoryId === 'string' ? preset.activeCategoryId : null;
  const projectId = typeof preset.activeProjectId === 'string' ? preset.activeProjectId : null;
  const overviewProfileId = typeof preset.overviewProfileId === 'string' ? preset.overviewProfileId : null;
  if (profileId && categoryId && projectId) {
    return buildPath('project', {
      profileId,
      categoryId,
      projectId
    });
  }
  if (profileId && categoryId) {
    return buildPath('profileCategory', {
      profileId,
      categoryId
    });
  }
  if (overviewProfileId) {
    return buildPath('profile', {
      profileId: overviewProfileId
    });
  }
  if (preset.isPlatformAIOpen === true) {
    return routes.studio.path;
  }
  if (preset.isSearchOpen === true) {
    return routes.search.path;
  }
  if (typeof preset.activeDestination === 'string') {
    const resolved = destinationFromSlug(preset.activeDestination.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    return resolved ? destinationPath(resolved) : null;
  }
  return null;
}
