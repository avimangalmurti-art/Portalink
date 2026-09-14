import type { FeedCurationEntry, Id } from '../types/domain';

/**
 * Discovery CURATION only.
 *
 * This file holds no project metadata. It decides which canonical projects are
 * surfaced in discovery and in what order, by referencing them by stable id.
 * Titles, years, covers, descriptions, and attribution all resolve from the
 * canonical `Project` record and its owning profile through `ProjectService`, so
 * there is exactly one authoritative description of any piece of work.
 */

/** The single hero slot. */
export const featuredCuration: FeedCurationEntry = {
  profileId: 'avi',
  projectId: 'cool-calm-and-collected'
};

/** The ordered discovery run. Ordering is the only editorial decision here. */
export const feedCuration: FeedCurationEntry[] = [{
  profileId: 'avi',
  projectId: 'user-interface-design-global-navigation-prototype'
}, {
  profileId: 'avi',
  projectId: 'glitch-typography-series'
}, {
  profileId: 'avi',
  projectId: 'tribute-to-helvetica'
}, {
  profileId: 'tide-and-form',
  projectId: 'photography-coastal-survey-winter'
}, {
  profileId: 'tide-and-form',
  projectId: 'architecture-harbour-house'
}, {
  profileId: 'avi',
  projectId: 'user-interface-design-checkout-redesign'
}, {
  profileId: 'studio-luma',
  projectId: 'furniture-ash-side-table'
}, {
  profileId: 'form-practice',
  projectId: 'film-six-days-in-the-workshop'
}, {
  profileId: 'tide-and-form',
  projectId: 'structural-engineering-long-span-timber-study'
}, {
  profileId: 'avi',
  projectId: 'typography-grotesk-specimen'
}, {
  profileId: 'wide-margin',
  projectId: 'soundcloud-night-pressing-side-a'
}, {
  profileId: 'wide-margin',
  projectId: 'graphic-design-risograph-annual'
}, {
  profileId: 'orbit-house',
  projectId: 'product-design-halo-lamp'
}, {
  profileId: 'form-practice',
  projectId: 'objects-folded-mirror-edition-06'
}];

/** Profiles woven between the work, by id. */
export const accountsToExploreIds: Id[] = ['studio-luma', 'avi', 'form-practice', 'tide-and-form', 'wide-margin', 'orbit-house'];