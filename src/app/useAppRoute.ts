import { useEffect, useMemo } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { buildPath, destinationFromSlug, destinationPath, routes } from './routes';
import { activityKindFromSlug, activitySlugForKind } from '../types/engagement';
import type { EngagementKind } from '../types/engagement';
import type { NavigationDestination } from '../components/navigation';
import type { Id } from '../types/domain';

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
export const PROTECTED_ROUTE_KINDS: ReadonlySet<AppRoute['kind']> = new Set(['messages']);

/** What the person was reaching for, for the auth gate's wording. */
export function describeRoute(route: AppRoute): string {
  switch (route.kind) {
    case 'studio':
      return 'open Studio';
    case 'messages':
      return 'read your messages';
    default:
      return 'continue';
  }
}
function parse(pathname: string, search: string): AppRoute {
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
  if (matchPath(routes.controlCenter.path, pathname)) {
    return {
      kind: 'controlCenter'
    };
  }
  if (matchPath(routes.messages.path, pathname)) {
    return {
      kind: 'messages'
    };
  }
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
    sharedProfile: (profileId: Id) => navigate(buildPath('sharedProfile', {
      profileId
    })),
    sharedCategory: (profileId: Id, categoryId: Id) => navigate(buildPath('sharedProfileCategory', {
      profileId,
      categoryId
    })),
    sharedProject: (profileId: Id, categoryId: Id, projectId: Id, replace = false) => navigate(buildPath('sharedProject', {
      profileId,
      categoryId,
      projectId
    }), {
      replace
    }),
    category: (profileId: Id, categoryId: Id) => navigate(buildPath('profileCategory', {
      profileId,
      categoryId
    })),
    /**
     * `replace` for a selection the viewer did not make — opening a portal lands
     * on its first project, and that must not become a history entry, or Back
     * would return to a bare category that immediately re-selects it.
     */
    project: (profileId: Id, categoryId: Id, projectId: Id, replace = false) => navigate(buildPath('project', {
      profileId,
      categoryId,
      projectId
    }), {
      replace
    }),
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
    messages: () => navigate(routes.messages.path),
    controlCenter: () => navigate(routes.controlCenter.path),
    /** Browser history owns Back. Nothing reconstructs the trail by hand. */
    back: () => navigate(-1),
    to: (path: string, replace = false) => navigate(path, {
      replace
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
