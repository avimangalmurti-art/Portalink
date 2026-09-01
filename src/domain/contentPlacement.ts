import type { Id, Profile, ProjectView } from '../types/domain';

export type ProjectPlacementSurface =
  | 'home'
  | 'profile'
  | 'portal'
  | 'location'
  | 'search'
  | 'discover'
  | 'direct'
  | 'shared';

export type ProjectPlacementReason =
  | 'eligible'
  | 'private_profile'
  | 'hidden_category'
  | 'hidden_project'
  | 'outside_relationship_sphere'
  | 'wrong_portal'
  | 'location_missing'
  | 'wrong_location';

export type ProjectPlacementDecision = {
  eligible: boolean;
  reason: ProjectPlacementReason;
};

type ProjectPlacementInput = {
  view: ProjectView;
  surface: ProjectPlacementSurface;
  viewerProfileId?: Id | null;
  followedCreatorIds?: readonly Id[];
  requestedCategoryId?: Id | null;
  requestedLocationName?: string | null;
  isProjectHidden?: boolean;
  isCategoryHidden?: boolean;
};

function normalizedPlace(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A creator's city is an explicit distribution boundary for Portalink place
 * views. A missing city matches nothing; project prose is deliberately ignored.
 */
export function creatorLocationMatches(profileLocation: string | undefined, requestedCity: string): boolean {
  const location = normalizedPlace(profileLocation ?? '');
  const city = normalizedPlace(requestedCity);
  if (!location || !city) return false;
  return location === city
    || location.startsWith(`${city} `)
    || location.endsWith(` ${city}`)
    || location.includes(` ${city} `);
}

/** Private profiles are readable only by their owner or a confirmed follower. */
export function canAccessProfile(input: {
  profile: Pick<Profile, 'id' | 'isPrivate'>;
  viewerProfileId?: Id | null;
  isConfirmedFollower?: boolean;
  isSharedRoute?: boolean;
}): boolean {
  if (!input.profile.isPrivate) return true;
  if (input.isSharedRoute) return false;
  return input.viewerProfileId === input.profile.id || input.isConfirmedFollower === true;
}

/**
 * One answer to “does this canonical project belong on this surface?”
 *
 * Visibility and placement are deliberately separate. A project may be readable
 * by direct URL while remaining ineligible for Home, a city, or another Portal.
 */
export function decideProjectPlacement(input: ProjectPlacementInput): ProjectPlacementDecision {
  const { view, surface } = input;
  const isOwner = input.viewerProfileId === view.creator.id;
  const isFollowing = input.followedCreatorIds?.includes(view.creator.id) ?? false;
  const hasPrivateAccess = isOwner || isFollowing;
  const publicSurface = surface === 'search' || surface === 'discover' || surface === 'location' || surface === 'shared';
  const ownerWorkspaceSurface = surface === 'profile' || surface === 'portal' || surface === 'direct';

  if (view.creator.isPrivate && (publicSurface || !hasPrivateAccess)) {
    return { eligible: false, reason: 'private_profile' };
  }
  if (input.isCategoryHidden && !(isOwner && ownerWorkspaceSurface)) {
    return { eligible: false, reason: 'hidden_category' };
  }
  if (input.isProjectHidden && !(isOwner && ownerWorkspaceSurface)) {
    return { eligible: false, reason: 'hidden_project' };
  }

  if (surface === 'home' && !isOwner && !isFollowing) {
    return { eligible: false, reason: 'outside_relationship_sphere' };
  }
  if (surface === 'portal' && input.requestedCategoryId !== view.project.categoryId) {
    return { eligible: false, reason: 'wrong_portal' };
  }
  if (surface === 'location') {
    if (!view.creator.location?.trim()) {
      return { eligible: false, reason: 'location_missing' };
    }
    if (!input.requestedLocationName || !creatorLocationMatches(view.creator.location, input.requestedLocationName)) {
      return { eligible: false, reason: 'wrong_location' };
    }
  }

  return { eligible: true, reason: 'eligible' };
}
