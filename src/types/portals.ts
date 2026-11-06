import type { Id } from './domain';

/** Public portal identity only; project and owner-only arrangement data stay separate. */
export type PublicPortalSummary = {
  id: Id;
  profileId: Id;
  label: string;
  iconName?: string;
  creator: { id: Id; name: string; handle: string; avatar: string; accentColor?: string };
};

export type PublicPortalPage = {
  items: PublicPortalSummary[];
  nextOffset: number | null;
};
