import { buildPath } from '../../app/routes';

/** A preview is the public renderer, never the owner's full-profile cache. */
export function visitorPreviewPath(profileId: string): string {
  return `${buildPath('sharedProfile', { profileId })}?visitorPreview=1`;
}
export function isOwnVisitorPreview(search: string, profileId: string | null, viewerProfileId: string | null | undefined): boolean {
  return Boolean(profileId && viewerProfileId === profileId && new URLSearchParams(search).get('visitorPreview') === '1');
}
export function visitorPreviewReturn(profileId: string): string {
  return buildPath('profile', { profileId });
}
