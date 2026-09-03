import type { Id } from '../types/domain';
import { navigationDestinations } from '../components/navigation';
import type { NavigationDestination } from '../components/navigation';

/**
 * The route map — the ONE source of truth for every navigable destination.
 *
 * The browser URL is canonical: `useAppRoute` parses the current location
 * against these templates, and every navigation is built from them with
 * `buildPath`. Records are addressed by stable id, never by a visible label, so
 * a pasted URL resolves the same record for everyone.
 */

export type RouteId = 'home' | 'destination' | 'discovery' | 'search' | 'profile' | 'profileCategory' | 'project' | 'sharedProfile' | 'sharedProfileCategory' | 'sharedProject' | 'productDetail' | 'portalink' | 'location' | 'portals' | 'insights' | 'studio' | 'messages' | 'controlCenter' | 'activity' | 'saved' | 'notifications';
export type RouteDefinition = {
  id: RouteId;
  path: string;
  params: readonly string[];
  /** What the destination is, for engineers reading this cold. */
  description: string;
};
export const routes: Record<RouteId, RouteDefinition> = {
  home: {
    id: 'home',
    path: '/',
    params: [],
    description: 'Relationship feed containing the viewer’s own work and work from creators they follow.'
  },
  destination: {
    id: 'destination',
    path: '/feed/:destinationSlug',
    params: ['destinationSlug'],
    description: 'An editorial or label feed destination from the sidebar.'
  },
  discovery: {
    id: 'discovery',
    path: '/discover',
    params: [],
    description: 'Browse surface for locations and creators (Portalink browse).'
  },
  search: {
    id: 'search',
    path: '/search',
    params: ['q'],
    description: 'Global search and discovery across profiles, projects, and locations.'
  },
  profile: {
    id: 'profile',
    path: '/p/:profileId',
    params: ['profileId'],
    description: 'A creator profile: identity, stats, and portfolio categories.'
  },
  profileCategory: {
    id: 'profileCategory',
    path: '/p/:profileId/c/:categoryId',
    params: ['profileId', 'categoryId'],
    description: 'One portfolio category, presented in its declared format.'
  },
  project: {
    id: 'project',
    path: '/p/:profileId/c/:categoryId/:projectId',
    params: ['profileId', 'categoryId', 'projectId'],
    description: 'A single project in its viewer (document, gallery, audio, story).'
  },
  sharedProfile: {
    id: 'sharedProfile',
    path: '/share/:profileId',
    params: ['profileId'],
    description: 'A public, read-only creator profile for people without a Portalink account.'
  },
  sharedProfileCategory: {
    id: 'sharedProfileCategory',
    path: '/share/:profileId/c/:categoryId',
    params: ['profileId', 'categoryId'],
    description: 'A public, read-only Portal within a shared creator profile.'
  },
  sharedProject: {
    id: 'sharedProject',
    path: '/share/:profileId/c/:categoryId/:projectId',
    params: ['profileId', 'categoryId', 'projectId'],
    description: 'A published project inside the read-only shared profile experience.'
  },
  productDetail: {
    id: 'productDetail',
    path: '/item/:productId',
    params: ['productId'],
    description: 'Commerce/product detail overlay.'
  },
  portalink: {
    id: 'portalink',
    path: '/portalink',
    params: [],
    description: 'The globe surface for choosing a location.'
  },
  location: {
    id: 'location',
    path: '/portalink/:locationId',
    params: ['locationId'],
    description: 'A location page and its live sessions.'
  },
  portals: {
    id: 'portals',
    path: '/portals',
    params: [],
    description: 'Reserved Portals product destination while the feature is being designed.'
  },
  insights: {
    id: 'insights',
    path: '/insights',
    params: [],
    description: 'Private creator save and follower totals for the signed-in creator.'
  },
  studio: {
    id: 'studio',
    path: '/studio',
    params: [],
    description: 'Reserved Studio product destination while the feature is being designed.'
  },
  messages: {
    id: 'messages',
    path: '/messages',
    params: [],
    description: 'Direct messages. Requires an account.'
  },
  controlCenter: {
    id: 'controlCenter',
    path: '/appearance',
    params: [],
    description: 'Control Center, opened from the sidebar. Public: it configures this browser.'
  },
  saved: {
    id: 'saved', path: '/saved', params: [],
    description: 'Private saved projects and creators. Requires an account.'
  },
  notifications: {
    id: 'notifications', path: '/notifications', params: [],
    description: 'Activity notifications addressed to the signed-in account.'
  },
  activity: {
    id: 'activity',
    path: '/p/:profileId/activity/:activityKind',
    params: ['profileId', 'activityKind'],
    description: "One engagement collection — likes, saved, reposts. Private to the profile's own account; `activityKind` is likes|saved|reposts."
  }
};

/** Fills a route template. Unknown params are left untouched, never guessed. */
export function buildPath(routeId: RouteId, params: Record<string, Id> = {}): string {
  return routes[routeId].path.replace(/:([A-Za-z]+)/g, (match, key: string) => params[key] ?? match);
}

/**
 * Editorial destinations are the one exception to id-addressing, because they are
 * not records — they are the product's own curated feeds, named in code. They
 * still travel as a stable slug rather than a raw label, and a slug that matches
 * no declared destination resolves to nothing rather than to a guess.
 */
export function destinationSlug(destination: NavigationDestination): string {
  return destination.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
export function destinationFromSlug(slug: string): NavigationDestination | null {
  return navigationDestinations.find((destination) => destinationSlug(destination) === slug) ?? null;
}

/** The canonical path for an editorial destination. Home has its own route. */
export function destinationPath(destination: NavigationDestination): string {
  return destination === 'Today' ? routes.home.path : buildPath('destination', {
    destinationSlug: destinationSlug(destination)
  });
}
