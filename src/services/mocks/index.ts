import { withProjectLocation } from '../../features/publishing/projectLocation';
import { projectRelevanceForPersistence } from '../../domain/discovery/ranking';
/**
 * Mock implementations of every service interface.
 *
 * Deliberately simple: they read the prototype data files and resolve. There is
 * no fake database, no fake auth, no persistence beyond the in-memory follow set
 * and the appearance preferences the product already stores locally.
 *
 * Replace these one at a time with `Api*` implementations in `services/index.ts`.
 */

import { accountsToExploreIds } from '../../data/feed';
import { applyPrototypeProfileUpdate, countPrototypeCategoryProjects, findProfileById, getProfileById, profiles, registerPrototypeCategory, registerPrototypeProfile, registerPrototypeProject, removePrototypeCategory, removePrototypeProject, renamePrototypeCategory, reorderPrototypeCategories, reorderPrototypeProjects, setPrototypeCategoryIcon, updatePrototypeProject } from '../../data/profiles';
import type { Profile as PrototypeProfile } from '../../data/profiles';
import { cities } from '../../data/cities';
import { liveSessionSeeds } from '../../data/liveSessions';
import { getCountryCode } from '../../data/countryCodes';
import { toLocationId } from '../../utils/location';
import { defaultReportingPeriodId, gazeCapital, getReportingPeriod, kpisForPeriod } from '../../data/studioAnalytics';
import { getSeededProjectTypefaceId } from '../../data/projectTypefaces';
import { typefaces } from '../../data/typefaces';
import { attachmentsFromPreparedMedia } from '../../features/media/projectAttachments';
import type { CommentService, DiscoveryService, EngagementService, LiveService, MediaService, MessagingService, NotificationService, ProfileService, ProjectService, SocialService } from '../interfaces';
import { EngagementServiceError } from '../../types/engagement';
import { SocialServiceError } from '../../types/social';
import { CommentServiceError, validateCommentBody } from '../../types/comments';
import type { Comment, CommentAuthor, ProjectComments } from '../../types/comments';
// The prototype's own session, used to enforce authentication inside the service
// rather than trusting the caller. A real implementation verifies a token instead.
import { readPrototypeSession } from '../prototype/authService';
import type { EngagementKind, ProjectEngagement } from '../../types/engagement';
import type { FeedCreator, FollowRequest, FollowState, GenerationOutcome, GenerativeCapability, Id, LiveCapability, LiveSession, Notification, PortfolioArrangement, PortfolioCategory, Product, Profile, Project, ProjectArrangement, ProjectDesign, ProjectView, SearchResult, UpdateProfileInput } from '../../types/domain';
import { CategoryMutationError, ProfileServiceError } from '../../types/profile';
import { ProcessingServiceError, ProjectMutationError, PublishServiceError, UploadServiceError } from '../../types/publishing';
import type { DeleteProjectResult, ProjectDraft, PublishProjectInput, PublishResult, UpdateProjectInput, UpdateProjectResult } from '../../types/publishing';
import type { CreateProfileInput, CreateProfileResult } from '../../types/profile';
import { createProfileHandle } from '../../utils/profileHandle';
import { deriveInitials, normalizeHandle } from '../../features/profile/validation';
import { buildUserContentSphere, rankDiscoverProjects, rankHomeProjects } from '../../domain/discovery/ranking';
import { creatorLocationMatches, decideProjectPlacement } from '../../domain/contentPlacement';
import { MAX_PAGES_PER_ROW, MIN_PAGES_PER_ROW } from '../../features/projects/pageLayout';
import { MAX_PROJECT_GRID_COLUMNS, MIN_PROJECT_GRID_COLUMNS } from '../../utils/projectGridDensity';

/**
 * These mocks serve CONTENT only. They never decide who is signed in — that is
 * `AuthService` alone (see `contexts/AuthContext.tsx`).
 */

/** Simulated latency, so loading states are exercised rather than skipped. */
const LATENCY_MS = 220;
function resolve<T>(value: T, latency = LATENCY_MS): Promise<T> {
  return new Promise((done) => window.setTimeout(() => done(value), latency));
}
/** Ids come from the shared location utility, so they match everywhere. */
const slug = (value: string): Id => toLocationId(value);
/**
 * PROTOTYPE ONLY: which account owns which profile, and any profile created
 * during this session. In-memory, so a reload loses it — that is truthful,
 * because no database exists yet. Production replaces this with a `profiles`
 * table keyed by the auth user id.
 */
const accountProfileIds = new Map<Id, Id>([['user-avi', 'avi'], ['user-studio-luma', 'studio-luma']]);
function isHandleTaken(handle: string): boolean {
  return profiles.some((profile) => normalizeHandle(profile.handle) === handle);
}
/**
 * PROTOTYPE ONLY. A deterministic way to exercise the save-failure and retry
 * path without a backend that can fail. Saving with this handle always rejects;
 * changing it to anything else succeeds. Delete with the mocks.
 */
const PROTOTYPE_SAVE_FAILURE_HANDLE = 'savefail';
/**
 * PROTOTYPE ONLY. The hidden-category set, which is genuinely arrangement-only
 * state with nowhere to live on the record. In-memory, so a reload loses it.
 */
const savedArrangements = new Map<Id, {
  hiddenCategoryIds: Id[];
}>();
/**
 * PROTOTYPE ONLY. Per-category project order and hidden set, keyed by
 * `profileId:categoryId`. In-memory for the session: a reload loses it, and the
 * UI must not claim otherwise. A real implementation carries project order and
 * visibility on the record and filters the hidden set server-side, where a
 * client cannot reach it.
 */
const savedProjectArrangements = new Map<string, ProjectArrangement>();
function projectArrangementKey(profileId: Id, categoryId: Id): string {
  return `${profileId}:${categoryId}`;
}
const MAX_CATEGORY_LABEL = 40;
/** One place for the rules, so create and rename cannot disagree. */
function assertUsableCategoryLabel(profileId: Id, label: string, excludingCategoryId: Id | null): void {
  if (!label) {
    throw new CategoryMutationError('label_required', 'Give this category a name.');
  }
  if (label.length > MAX_CATEGORY_LABEL) {
    throw new CategoryMutationError('label_too_long', `Keep the name under ${MAX_CATEGORY_LABEL} characters.`);
  }
  const clash = getProfileById(profileId).categories.some((category) => category.id !== excludingCategoryId && category.label.trim().toLowerCase() === label.toLowerCase());
  if (clash) {
    throw new CategoryMutationError('duplicate_label', 'You already have a category with that name.');
  }
}
/**
 * PROTOTYPE ONLY. Publishing a project with this title always fails, so the
 * failure/retry path can be exercised without a backend that can fail. Delete
 * with the mocks — it is not a product rule.
 */
const PROTOTYPE_PUBLISH_FAILURE_TITLE = 'publish fail';
/** PROTOTYPE ONLY: drafts live here for the session and are lost on reload. */
const drafts = new Map<Id, ProjectDraft>();
let draftCounter = 0;

function profileForCurrentViewer(profile: PrototypeProfile): Profile {
  const session = readPrototypeSession();
  const isOwner = session?.user.profileId === profile.id;
  const hiddenCategoryIds = new Set(savedArrangements.get(profile.id)?.hiddenCategoryIds ?? []);
  const categories = isOwner ? profile.categories : profile.categories.filter((category) => !hiddenCategoryIds.has(category.id));
  const visibleCategoryIds = new Set(categories.map((category) => category.id));
  const projects = isOwner ? profile.projects : profile.projects.filter((project) => {
    if (!visibleCategoryIds.has(project.categoryId)) return false;
    return !(savedProjectArrangements.get(projectArrangementKey(profile.id, project.categoryId))?.hiddenProjectIds.includes(project.id) ?? false);
  });
  return { ...profile, categories, projects } as Profile;
}

export const mockProfileService: ProfileService = {
  async getProfile(profileId) {
    const profile = findProfileById(profileId);
    // Absence is reported, never papered over. Returning a fallback record here
    // would open somebody else's portfolio under the requested id.
    if (!profile) {
      throw new Error(`Unknown profile: ${profileId}`);
    }
    return resolve(profileForCurrentViewer(profile));
  },
  async getProfileForAccount(accountId) {
    const profileId = accountProfileIds.get(accountId);
    // Null is a real answer: an authenticated account may own no profile.
    return resolve(profileId ? profileForCurrentViewer(getProfileById(profileId)) : null);
  },
  async listProfiles() {
    const ownProfileId = readPrototypeSession()?.user.profileId ?? null;
    return resolve(profiles.filter((profile) => !profile.isPrivate || profile.id === ownProfileId).map(profileForCurrentViewer));
  },
  async createProfile(accountId, input: CreateProfileInput): Promise<CreateProfileResult> {
    await resolve(undefined, 620);
    const handle = input.handle === undefined ? createProfileHandle(input.name) : normalizeHandle(input.handle);
    if (!handle) {
      throw new ProfileServiceError('invalid_handle', 'Choose a handle before continuing.');
    }
    // Re-checked at write time, because an availability check can go stale.
    if (isHandleTaken(handle)) {
      throw new ProfileServiceError('handle_taken', 'That handle was taken while you were filling this in. Choose another.');
    }
    if (!input.name.trim()) {
      throw new ProfileServiceError('invalid_input', 'A profile name is required.');
    }
    const profile: Profile = {
      id: `profile-${handle}`,
      name: input.name.trim(),
      handle: `@${handle}`,
      headline: input.headline?.trim() ?? '',
      location: input.location?.trim() ?? '',
      isPrivate: input.isPrivate === true,
      initials: deriveInitials(input.name),
      // No storage backend exists, so the chosen file is never given a URL.
      avatar: '',
      navHeading: 'PORTFOLIO',
      stats: [],
      socialLinks: {},
      links: [],
      // A new profile starts genuinely empty; portfolio building is a later system.
      categories: [],
      projects: []
    };
    registerPrototypeProfile(profile);
    accountProfileIds.set(accountId, profile.id);
    return {
      profile,
      accountId,
      // Truthful: nothing was uploaded.
      avatarPersisted: false
    };
  },
  async updateProfile(profileId, input: UpdateProfileInput) {
    await resolve(undefined, 320);
    if (input.projectGridColumns !== undefined && (!Number.isInteger(input.projectGridColumns) || input.projectGridColumns < MIN_PROJECT_GRID_COLUMNS || input.projectGridColumns > MAX_PROJECT_GRID_COLUMNS)) {
      throw new ProfileServiceError('invalid_input', `Projects per row must be between ${MIN_PROJECT_GRID_COLUMNS} and ${MAX_PROJECT_GRID_COLUMNS}.`);
    }
    const current = getProfileById(profileId) as Profile;
    const {
      handle,
      avatar,
      ...fields
    } = input;
    const nextHandle = handle === undefined ? null : normalizeHandle(handle);
    if (nextHandle !== null) {
      if (!nextHandle) {
        throw new ProfileServiceError('invalid_handle', 'Choose a handle before saving.');
      }
      // Same rule as creation: re-checked on write, since a check can go stale.
      if (nextHandle !== normalizeHandle(current.handle) && isHandleTaken(nextHandle)) {
        throw new ProfileServiceError('handle_taken', 'That handle is already taken.');
      }
      if (nextHandle === PROTOTYPE_SAVE_FAILURE_HANDLE) {
        throw new ProfileServiceError('network', 'Could not reach the server. Your changes are still here.');
      }
    }
    // The canonical in-memory record is updated, so every surface reading this
    // profile sees the same values for the rest of the session. `avatar` has no
    // transport, so the prepared file is deliberately NOT written — inventing a
    // storage URL would be a lie. Reload resets all of this.
    return applyPrototypeProfileUpdate(profileId, {
      ...fields,
      handle: nextHandle ? `@${nextHandle}` : current.handle,
      initials: fields.name ? deriveInitials(fields.name) : current.initials
    } as Partial<PrototypeProfile>) as Profile;
  },
  async getPortfolioArrangement(profileId) {
    const profile = getProfileById(profileId);
    const saved = savedArrangements.get(profileId);
    // Order and icons live on the canonical record, so a rename, a new category,
    // or a deletion is reflected without the arrangement going stale. Only the
    // hidden set is arrangement-only.
    return resolve({
      categoryOrder: profile.categories.map((category) => category.id),
      hiddenCategoryIds: (saved?.hiddenCategoryIds ?? []).filter((id) => profile.categories.some((category) => category.id === id)),
      categoryIcons: Object.fromEntries(profile.categories.map((category) => [category.id, category.iconName]))
    } satisfies PortfolioArrangement);
  },
  async savePortfolioArrangement(profileId, arrangement) {
    // Order and icons are properties of the categories themselves, so they are
    // written to the canonical record rather than kept in a parallel store that
    // could disagree with it.
    reorderPrototypeCategories(profileId, arrangement.categoryOrder);
    Object.entries(arrangement.categoryIcons).forEach(([categoryId, iconName]) => {
      setPrototypeCategoryIcon(profileId, categoryId, iconName);
    });
    savedArrangements.set(profileId, {
      hiddenCategoryIds: [...arrangement.hiddenCategoryIds]
    });
    return resolve(undefined);
  },
  async createCategory(profileId, input) {
    const label = input.label.trim();
    assertUsableCategoryLabel(profileId, label, null);
    const category: PortfolioCategory = {
      id: `${toLocationId(label)}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      iconName: input.iconName ?? 'FolderIcon',
      format: input.format ?? 'grid',
      blurb: input.blurb ?? ''
    };
    registerPrototypeCategory(profileId, category as never);
    return resolve(category);
  },
  async renameCategory(profileId, categoryId, label) {
    const trimmed = label.trim();
    assertUsableCategoryLabel(profileId, trimmed, categoryId);
    renamePrototypeCategory(profileId, categoryId, trimmed);
    const renamed = getProfileById(profileId).categories.find((category) => category.id === categoryId);
    if (!renamed) {
      throw new CategoryMutationError('not_found', 'That category no longer exists.');
    }
    return resolve(renamed as PortfolioCategory);
  },
  async setCategoryIcon(profileId, categoryId, iconName) {
    setPrototypeCategoryIcon(profileId, categoryId, iconName);
    const updated = getProfileById(profileId).categories.find((category) => category.id === categoryId);
    if (!updated) {
      throw new CategoryMutationError('not_found', 'That category no longer exists.');
    }
    return resolve(updated as PortfolioCategory);
  },
  async getCategoryDeletionCapability(profileId, categoryId) {
    const profile = getProfileById(profileId);
    const category = profile.categories.find((candidate) => candidate.id === categoryId);
    if (!category) {
      return resolve({
        isAvailable: false,
        removes: [],
        reason: 'That category no longer exists.',
        blockingProjectCount: 0
      }, 90);
    }
    const blockingProjectCount = countPrototypeCategoryProjects(profileId, categoryId);
    if (blockingProjectCount > 0) {
      // Refusing is the only safe answer: deleting the work would destroy
      // published projects, and keeping it would leave those projects filed
      // under a category that no longer resolves.
      return resolve({
        isAvailable: false,
        removes: [],
        reason: `“${category.label}” still holds ${blockingProjectCount} ${blockingProjectCount === 1 ? 'project' : 'projects'}. Move that work to another category first — deleting this one will never delete your projects.`,
        blockingProjectCount
      }, 90);
    }
    return resolve({
      isAvailable: true,
      removes: [`The “${category.label}” category and its place in your sidebar.`, 'Its chosen icon and its position in your portfolio order.'],
      blockingProjectCount: 0
    }, 90);
  },
  async deleteCategory(profileId, categoryId) {
    const blockingProjectCount = countPrototypeCategoryProjects(profileId, categoryId);
    if (blockingProjectCount > 0) {
      // Re-checked here as well as in the capability: a destructive operation
      // never trusts the caller to have asked the right question first.
      throw new CategoryMutationError('category_not_empty', `“${categoryId}” still holds work, so it was not deleted. Your projects are untouched.`, blockingProjectCount);
    }
    removePrototypeCategory(profileId, categoryId);
    const saved = savedArrangements.get(profileId);
    if (saved) {
      savedArrangements.set(profileId, {
        hiddenCategoryIds: saved.hiddenCategoryIds.filter((id) => id !== categoryId)
      });
    }
    return resolve(undefined);
  }
};
/**
 * The one read path for canonical projects. Every surface — feed, search,
 * profile, category, detail — resolves through this, so a project has exactly
 * one description of itself and one attribution.
 */
function findProjectOwner(projectId: Id): {project: Project;profile: PrototypeProfile;} | null {
  for (const profile of profiles) {
    const match = profile.projects.find((project) => project.id === projectId);
    if (match) {
      return {
        project: match as Project,
        profile
      };
    }
  }
  return null;
}
/** Attribution is derived from the owning profile, never stored on the project. */
function creatorFromProfile(profile: PrototypeProfile): FeedCreator {
  return {
    id: profile.id,
    name: profile.name,
    kind: profile.headline,
    avatar: profile.avatar,
    location: profile.location,
    isPrivate: profile.isPrivate === true
  };
}
function viewFor(projectId: Id): ProjectView | null {
  const owner = findProjectOwner(projectId);
  return owner ? {
    project: owner.project,
    creator: creatorFromProfile(owner.profile)
  } : null;
}

function prototypePlacementFlags(profile: PrototypeProfile, project: Project): {
  isCategoryHidden: boolean;
  isProjectHidden: boolean;
} {
  const categoryArrangement = savedArrangements.get(profile.id);
  const projectArrangement = savedProjectArrangements.get(projectArrangementKey(profile.id, project.categoryId));
  return {
    isCategoryHidden: categoryArrangement?.hiddenCategoryIds.includes(project.categoryId) ?? false,
    isProjectHidden: projectArrangement?.hiddenProjectIds.includes(project.id) ?? false,
  };
}

function prototypeViews(): Array<{ view: ProjectView; profile: PrototypeProfile; flags: ReturnType<typeof prototypePlacementFlags> }> {
  return profiles.flatMap((profile) => profile.projects.map((project) => ({
    view: { project: project as Project, creator: creatorFromProfile(profile) },
    profile,
    flags: prototypePlacementFlags(profile, project as Project),
  })));
}
/**
 * Project design settings, session-only.
 *
 * Seeded work has no stored design, so its face comes from the deterministic
 * assignment in `data/projectTypefaces.ts` — the same one the shell used to hold
 * in component state. Migrating it here means the canonical record is the single
 * answer to "what face is this project in", while every published project keeps
 * exactly the appearance it had. An owner's edits live in this map for the session
 * and are lost on reload; nothing here is persisted.
 */
const projectDesigns = new Map<Id, ProjectDesign>();
function designFor(projectId: Id): ProjectDesign {
  const saved = projectDesigns.get(projectId);
  if (saved) {
    return {
      ...saved
    };
  }
  const owner = findProjectOwner(projectId);
  // A record that already carries a design wins over the seed; work published
  // this session has neither and starts in the interface face.
  return owner?.project.design ? {
    ...owner.project.design
  } : {
    typefaceId: getSeededProjectTypefaceId(projectId)
  };
}
export const mockProjectService: ProjectService = {
  async getProject(projectId) {
    const owner = findProjectOwner(projectId);
    if (!owner) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    return resolve(owner.project);
  },
  async getProjectView(projectId) {
    const view = viewFor(projectId);
    if (!view) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    return resolve(view);
  },
  async listProjectViews(projectIds) {
    // An id that no longer names a project is dropped, never substituted.
    const views = projectIds.map(viewFor).filter((view): view is ProjectView => view !== null);
    return resolve(views);
  },
  async listProjects(profileId, categoryId) {
    const all = getProfileById(profileId).projects as Project[];
    return resolve(categoryId ? all.filter((project) => project.categoryId === categoryId) : all);
  },
  async getProjectDesign(projectId) {
    const owner = findProjectOwner(projectId);
    if (!owner) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    return resolve(designFor(projectId));
  },
  async listProjectDesigns(projectIds) {
    // Ids that no longer name a project are omitted rather than given a face, so
    // a stale index can never carry typography for work that does not exist.
    const entries = projectIds.filter((projectId) => findProjectOwner(projectId) !== null).map((projectId) => [projectId, designFor(projectId)] as const);
    return resolve(Object.fromEntries(entries) as Record<Id, ProjectDesign>);
  },
  async updateProjectDesign(projectId, design) {
    await resolve(undefined, 220);
    const owner = findProjectOwner(projectId);
    if (!owner) {
      throw new Error('That project no longer exists, so its typography could not be saved.');
    }
    // Re-checked here rather than trusted from the caller: an unknown face would
    // silently fall back at render time and look like the save had failed.
    if (!typefaces.some((typeface) => typeface.id === design.typefaceId)) {
      throw new Error('That typeface is not one this product offers.');
    }
    if (design.pagesPerRow !== undefined && (!Number.isInteger(design.pagesPerRow) || design.pagesPerRow < MIN_PAGES_PER_ROW || design.pagesPerRow > MAX_PAGES_PER_ROW)) {
      throw new Error(`Pages per row must be between ${MIN_PAGES_PER_ROW} and ${MAX_PAGES_PER_ROW}.`);
    }
    // Session-only, like the arrangement stores: nothing is persisted, and a
    // reload returns every project to the face it was published in.
    const next: ProjectDesign = {
      typefaceId: design.typefaceId,
      ...(design.pagesPerRow ? { pagesPerRow: design.pagesPerRow } : {})
    };
    projectDesigns.set(projectId, next);
    return next;
  },
  async updateProjectTags(projectId, tags) {
    const owner = findProjectOwner(projectId);
    if (!owner) throw new Error('That project no longer exists.');
    owner.project.tags = [...tags];
  },
  async saveProfileProjectOrder(profileId, projectIds) {
    const live = getProfileById(profileId).projects.map((project) => project.id);
    const unique = [...new Set(projectIds)];
    if (unique.length !== projectIds.length || unique.some((projectId) => !live.includes(projectId))) {
      throw new Error('That order contains a project this profile does not own.');
    }
    await resolve(undefined, 220);
    reorderPrototypeProjects(profileId, unique);
  },
  async getProjectArrangement(profileId, categoryId) {
    // The canonical record decides which projects exist; the saved arrangement
    // only decides their order and which are hidden. Reconciling on read means a
    // project published or deleted since the arrangement was saved is handled
    // correctly rather than dropped or invented: known ids keep their saved
    // position, newly published work joins the end, and ids that no longer name
    // a project in this category fall out of both lists.
    const live = getProfileById(profileId).projects.filter((project) => project.categoryId === categoryId).map((project) => project.id);
    const saved = savedProjectArrangements.get(projectArrangementKey(profileId, categoryId));
    if (!saved) {
      return resolve({
        projectOrder: live,
        hiddenProjectIds: [],
        pinnedProjectIds: []
      } satisfies ProjectArrangement);
    }
    const known = saved.projectOrder.filter((projectId) => live.includes(projectId));
    const added = live.filter((projectId) => !known.includes(projectId));
    return resolve({
      projectOrder: [...known, ...added],
      hiddenProjectIds: saved.hiddenProjectIds.filter((projectId) => live.includes(projectId)),
      // Reconciled the same way: a pin cannot outlive the project it names.
      pinnedProjectIds: (saved.pinnedProjectIds ?? []).filter((projectId) => live.includes(projectId))
    } satisfies ProjectArrangement);
  },
  async saveProjectArrangement(profileId, categoryId, arrangement) {
    await resolve(undefined, 220);
    // An arrangement can only speak about work this category actually holds, so
    // an id from anywhere else is refused rather than silently stored.
    const live = getProfileById(profileId).projects.filter((project) => project.categoryId === categoryId).map((project) => project.id);
    const foreign = [...arrangement.projectOrder, ...arrangement.hiddenProjectIds, ...arrangement.pinnedProjectIds].find((projectId) => !live.includes(projectId));
    if (foreign) {
      throw new Error('That arrangement refers to work this category does not hold.');
    }
    savedProjectArrangements.set(projectArrangementKey(profileId, categoryId), {
      projectOrder: [...arrangement.projectOrder],
      hiddenProjectIds: [...arrangement.hiddenProjectIds],
      pinnedProjectIds: [...arrangement.pinnedProjectIds]
    });
    return undefined;
  },
  async getDraft(draftId) { return drafts.get(draftId) ?? null; },
  async updateProjectJourneyDetails(projectId, details, caption) {
    const project = await this.getProject(projectId);
    project.creationDetails = details; project.thenNowCaption = caption;
  },
  async updateProjectCreationDetails(projectId, details) {
    const project = await this.getProject(projectId);
    project.creationDetails = details;
  },
  async createDraft(profileId, categoryId) {
    const profile = getProfileById(profileId);
    if (!profile.categories.some((category) => category.id === categoryId)) {
      throw new PublishServiceError('category_not_found', 'That category does not belong to this profile.');
    }
    draftCounter += 1;
    const draft: ProjectDraft = {
      id: `draft-${draftCounter}`,
      profileId,
      categoryId,
      metadata: {
        title: '',
        summary: ''
      },
      createdAt: new Date().toISOString()
    };
    drafts.set(draft.id, draft);
    return resolve(draft, 180);
  },
  async updateDraft(draftId, metadata) {
    const current = drafts.get(draftId);
    if (!current) {
      throw new PublishServiceError('draft_not_found', 'That draft is no longer available.');
    }
    const next: ProjectDraft = {
      ...current,
      metadata
    };
    drafts.set(draftId, next);
    return resolve(next, 140);
  },
  async discardDraft(draftId) {
    drafts.delete(draftId);
    return resolve(undefined, 120);
  },
  async publishProject(input: PublishProjectInput): Promise<PublishResult> {
    await resolve(undefined, 640);
    const draft = drafts.get(input.draftId);
    if (!draft) {
      throw new PublishServiceError('draft_not_found', 'That draft is no longer available.');
    }
    const profile = getProfileById(input.profileId);
    if (!profile.categories.some((category) => category.id === input.categoryId)) {
      throw new PublishServiceError('category_not_found', 'That category does not belong to this profile.');
    }
    // Defence in depth: the public fields are required at the boundary too, so
    // no path can create a project with metadata invented to fill a gap.
    if (!input.metadata.title.trim() || (!input.metadata.creationDetails && !input.metadata.summary.trim())) {
      throw new PublishServiceError('invalid_metadata', 'A title and a description are both required.');
    }
    const preparedMedia = input.media ?? [];
    const persistedAttachments = input.attachments ?? [];
    if (preparedMedia.length === 0 && persistedAttachments.length === 0) {
      throw new PublishServiceError('invalid_media', 'Select at least one file before publishing.');
    }
    // One source of media, never both: otherwise this could not tell whether the
    // bytes were persisted, and would have to guess what the record may claim.
    if (preparedMedia.length > 0 && persistedAttachments.length > 0) {
      throw new PublishServiceError('invalid_media', 'A project is published either from persisted attachments or from locally prepared files, never both.');
    }
    // A persisted attachment without a storage key did not persist. Accepting one
    // would write a record that claims storage it does not have.
    const unpersisted = persistedAttachments.find((attachment) => !attachment.storagePath);
    if (unpersisted) {
      throw new PublishServiceError('invalid_media', `${unpersisted.fileName} has no storage reference, so it cannot be published as stored media.`);
    }
    if (input.metadata.title.trim().toLowerCase() === PROTOTYPE_PUBLISH_FAILURE_TITLE) {
      throw new PublishServiceError('network', 'Could not reach the server. Your draft is still here.');
    }
    // The creator's cover choice leads. Images render directly, PDFs render
    // the selected page, and videos render natively; unsupported assets are not
    // offered as cover choices by the preparation rules.
    const attachments = persistedAttachments.length > 0 ? [...persistedAttachments].sort((a, b) => a.order - b.order) : attachmentsFromPreparedMedia(preparedMedia);
    const isPersisted = persistedAttachments.length > 0;
    const coverAsset = attachments.find((item) => item.isCover && item.sourceUrl) ?? attachments.find((item) => item.kind === 'image' && item.sourceUrl) ?? attachments.find((item) => item.sourceUrl);
    const cover = coverAsset?.sourceUrl ?? '';
    const projectId = `session-${draft.id}`;
    // Session-only: the record joins the canonical in-memory profile so it
    // reads through the normal path, and `cover` is a local blob preview —
    // never a storage URL, because nothing was uploaded.
    registerPrototypeProject(input.profileId, {
      id: projectId,
      categoryId: input.categoryId,
      title: input.metadata.title.trim(),
      summary: input.metadata.summary.trim(),
      creationDetails: input.metadata.creationDetails,
      cover,
      relevance: withProjectLocation(input.relevance ?? projectRelevanceForPersistence(input.metadata), input.location),
      coverAlt: isPersisted ? input.metadata.title.trim() : `${input.metadata.title.trim()} — locally prepared preview`,
      coverKind: coverAsset?.kind === 'video' ? 'video' : coverAsset?.kind === 'document' ? 'document' : undefined,
      coverAspectRatio: coverAsset?.metadata?.widthPixels && coverAsset.metadata.heightPixels ? coverAsset.metadata.widthPixels / coverAsset.metadata.heightPixels : undefined,
      coverFrame: coverAsset?.metadata?.coverFrame,
      coverPageNumber: coverAsset?.kind === 'document' ? coverAsset.metadata?.coverPageNumber : undefined,
      // No page count: the files are mixed media, and their number is not a page
      // count. Extent is read from the attachments themselves.
      // Each file keeps its own media kind, so the viewer never has to guess.
      attachments,
      sessionOnly: true
    });
    drafts.delete(input.draftId);
    return {
      projectId,
      // Truthful: with this implementation the record itself is in memory, so it
      // is session-only either way. `mediaPersisted` reflects whether the caller
      // supplied real storage references rather than being hardcoded — a real
      // ProjectService reports both from its own store.
      mediaPersisted: isPersisted,
      sessionOnly: true
    };
  },
  /**
   * Mutates the canonical in-memory record, so the whole edit lifecycle can be
   * exercised — but it claims nothing about a database, and it deletes nothing
   * from storage, because there is no storage to delete from.
   */
  async updateProject(input: UpdateProjectInput): Promise<UpdateProjectResult> {
    await resolve(undefined, 520);
    const profile = findProfileById(input.profileId);
    if (!profile) {
      throw new ProjectMutationError('not_found', 'That profile could not be found.');
    }
    const current = profile.projects.find((project) => project.id === input.projectId);
    if (!current) {
      // The work may have been deleted in another view since the editor opened.
      throw new ProjectMutationError('not_found', 'That project no longer exists, so there was nothing to save.');
    }
    // Defence in depth: the public fields are required here too, so no path can
    // strip a published project down to invented or empty metadata.
    if (!input.metadata.title.trim() || (!input.metadata.creationDetails && !input.metadata.summary.trim())) {
      throw new ProjectMutationError('invalid_metadata', 'A title and a description are both required.');
    }
    if (input.metadata.title.trim().toLowerCase() === PROTOTYPE_PUBLISH_FAILURE_TITLE) {
      // Exercises the failure path: nothing is written, so the published project
      // and every file it uses are left exactly as they were.
      throw new ProjectMutationError('network', 'Could not reach the server. Your changes are still here and the published project is unchanged.');
    }
    const existing = current.attachments ?? [];
    // An edit may only speak about files this project actually holds.
    const foreign = input.attachments.find((edit) => !existing.some((attachment) => attachment.id === edit.id));
    if (foreign) {
      throw new ProjectMutationError('invalid_media', 'That edit refers to a file this project does not hold.');
    }
    const added = input.addedAttachments && input.addedAttachments.length > 0 ? [...input.addedAttachments] : input.addedMedia && input.addedMedia.length > 0 ? attachmentsFromPreparedMedia(input.addedMedia) : [];
    if (input.addedAttachments?.length && input.addedMedia?.length) {
      throw new ProjectMutationError('invalid_media', 'Added files come either from persisted attachments or from locally prepared files, never both.');
    }
    const kept = input.attachments.slice().sort((a, b) => a.order - b.order).map((edit) => {
      const attachment = existing.find((item) => item.id === edit.id)!;
      return {
        ...attachment,
        // Only what an edit is allowed to change. The file, its storage
        // reference, kind, and processing state are untouched.
        metadata: edit.coverFrame ? { ...attachment.metadata, coverFrame: edit.coverFrame } : attachment.metadata,
        displayName: edit.displayName.trim() || attachment.displayName,
        isCover: edit.isCover
      };
    });
    if (kept.length === 0 && added.length === 0) {
      throw new ProjectMutationError('invalid_media', 'A project has to keep at least one file.');
    }
    const attachments = [...kept, ...added].map((attachment, index) => ({
      ...attachment,
      order: index
    }));
    const removedAttachmentIds = existing.filter((attachment) => !attachments.some((item) => item.id === attachment.id)).map((attachment) => attachment.id);
    const coverAsset = attachments.find((item) => item.isCover && item.sourceUrl) ?? attachments.find((item) => item.kind === 'image' && item.sourceUrl) ?? attachments.find((item) => item.sourceUrl);
    const isPersisted = attachments.every((attachment) => attachment.storagePath !== null);
    const next: Project = {
      ...current,
      title: input.metadata.title.trim(),
      summary: input.metadata.summary.trim(),
      creationDetails: input.metadata.creationDetails,
      cover: coverAsset?.sourceUrl ?? current.cover,
      coverAlt: input.metadata.title.trim(),
      coverKind: coverAsset ? coverAsset.kind === 'video' ? 'video' : coverAsset.kind === 'document' ? 'document' : undefined : current.coverKind,
      coverFrame: coverAsset?.metadata?.coverFrame,
      coverPageNumber: coverAsset?.kind === 'document' ? coverAsset.metadata?.coverPageNumber : undefined,
      attachments,
      // Anything edited in this runtime lives in this runtime only.
      sessionOnly: true
    };
    // Committed FIRST. Only after this would a real implementation clean up the
    // objects behind `removedAttachmentIds`; here there is nothing stored to
    // remove, and none is claimed.
    updatePrototypeProject(input.profileId, next);
    return {
      project: next,
      mediaPersisted: isPersisted,
      sessionOnly: true,
      removedAttachmentIds,
      message: removedAttachmentIds.length > 0 ? 'Your changes are saved for this session. The files you removed are no longer part of the project; nothing was deleted from storage, because no storage is connected.' : 'Your changes are saved for this session. A reload restores the original record, because no database is connected.'
    };
  },
  async deleteProject(projectId, options): Promise<DeleteProjectResult> {
    await resolve(undefined, 520);
    const owner = profiles.find((profile) => profile.projects.some((project) => project.id === projectId));
    if (!owner) {
      throw new ProjectMutationError('not_found', 'That project no longer exists, so there was nothing to delete.');
    }
    if (options?.profileId && options.profileId !== owner.id) {
      // The UI only offers this to an owner, but the boundary refuses on its own
      // rather than trusting the caller.
      throw new ProjectMutationError('permission_denied', 'That project belongs to another profile.');
    }
    const project = owner.projects.find((candidate) => candidate.id === projectId)!;
    if (project.title.trim().toLowerCase() === PROTOTYPE_PUBLISH_FAILURE_TITLE) {
      throw new ProjectMutationError('network', 'Could not reach the server. The project was not deleted.');
    }
    const removedAttachmentIds = (project.attachments ?? []).map((attachment) => attachment.id);
    removePrototypeProject(owner.id, projectId);
    return {
      projectId,
      removedAttachmentIds,
      // No storage exists, so nothing was deleted from it and nothing claims to be.
      storageDeleted: false,
      message: 'The project is removed from your portfolio for this session. No files were deleted from storage, because no storage is connected, and a reload restores the original record.'
    };
  }
};

/**
 * No storage backend exists, so this service's only honest answer is that
 * uploading is unavailable. A `SupabaseMediaService` implements the same
 * interface with real progress, cancellation, retry, and deletion.
 */
export const mockMediaService: MediaService = {
  async getUploadCapability() {
    return resolve({
      isAvailable: false,
      reason: 'File storage is not connected yet, so files stay on this device and are previewed locally.',
      reportsPerFileProgress: false
    }, 80);
  },
  /**
   * Refuses, rather than pretending. No operation is created, no id is issued, no
   * progress is emitted, and nothing is reported as persisted — so the publishing
   * flow cannot enter an uploading, progress, or uploaded state against this
   * implementation.
   */
  async startUpload() {
    await resolve(undefined, 0);
    throw new UploadServiceError({
      code: 'unavailable',
      message: 'File storage is not connected yet, so nothing can be uploaded.',
      persisted: [],
      cleanupRequired: false
    });
  },
  async cancelUpload() {
    // Nothing can be in flight while uploading is unavailable, so there is no
    // operation to cancel and nothing was left behind to clean up.
    await resolve(undefined, 0);
    throw new UploadServiceError({
      code: 'unavailable',
      message: 'No upload is in progress, because file storage is not connected.',
      persisted: [],
      cleanupRequired: false
    });
  },
  async deleteMedia() {
    await resolve(undefined, 0);
    throw new Error('Nothing has been stored, so nothing can be deleted.');
  },
  /**
   * No conversion pipeline exists either, and saying so is the only truthful
   * answer. Nothing here rasterises a PDF, renders CAD, transcodes a video, or
   * generates a thumbnail, and no state is advanced by a timer.
   */
  async getProcessingCapability() {
    return resolve({
      isAvailable: false,
      reason: 'No media processing service is connected, so previews, thumbnails, and conversions are not generated. Original files are always kept as they are.',
      canRetry: false
      // No refresh interval: there is nothing to re-query.
    }, 80);
  },
  async getProcessingStatus() {
    await resolve(undefined, 0);
    // Nothing has ever been persisted, so there is no object whose processing
    // state could be reported. An empty answer is honest; inventing `ready`
    // entries would claim finished conversions that never ran.
    return [];
  },
  async retryProcessing() {
    await resolve(undefined, 0);
    throw new ProcessingServiceError('unavailable', 'No media processing service is connected, so there is no job to run again. Nothing was changed.');
  }
};
let mockHomeFeedMode: import('../../types/discovery').HomeFeedMode = 'balanced';
export const mockDiscoveryService: DiscoveryService = {
  async getHomeDiscovery() {
    const session = readPrototypeSession();
    const viewerProfile = session?.user.profileId
      ? profiles.find((profile) => profile.id === session.user.profileId) ?? null
      : null;
    const followedCreatorIds = session ? [...followsFor(session.user.id)] : [];
    const availableProjects = prototypeViews()
      .filter(({ view, flags }) => decideProjectPlacement({
        view,
        surface: 'home',
        viewerProfileId: viewerProfile?.id ?? null,
        followedCreatorIds,
        ...flags,
      }).eligible)
      .map(({ view }) => view);
    const sphere = buildUserContentSphere({ viewerProfile, availableProjects, followedCreatorIds, engagement: [], explicitSignals: [] });
    return resolve(rankHomeProjects(availableProjects, sphere, new Date(), mockHomeFeedMode));
  },
  async setHomeFeedMode(mode) {
    mockHomeFeedMode = mode;
    return this.getHomeDiscovery();
  },
  async getDiscoverSections(mode) {
    const availableProjects = prototypeViews()
      .filter(({ view, flags }) => decideProjectPlacement({ view, surface: 'discover', ...flags }).eligible)
      .map(({ view }) => view);
    const sphere = buildUserContentSphere({ viewerProfile: null, availableProjects, followedCreatorIds: [], engagement: [], explicitSignals: [] });
    return resolve(rankDiscoverProjects(availableProjects, sphere, mode));
  },
  async recordProjectSignal() {
    return resolve(undefined);
  },
  async listLocationProjects(locationId) {
    const { locationDirectory, profileMatchesPlace } = await import('../../data/locationDirectory');
    const city = await locationDirectory.resolve(locationId);
    if (!city) return resolve([]);
    const located = prototypeViews()
      .filter(({ view, flags }) => (city.legacy ? creatorLocationMatches(view.creator.location, city.name) : profileMatchesPlace(view.creator.location, city))
        && decideProjectPlacement({
          view,
          surface: city.legacy ? 'location' : 'discover',
          requestedLocationName: city.name,
          ...flags,
        }).eligible)
      .map(({ view }) => view)
      .sort((left, right) => (right.project.publishedAt ?? '').localeCompare(left.project.publishedAt ?? '') || left.project.id.localeCompare(right.project.id));
    return resolve(located);
  },
  async listAccountsToExplore() {
    const creators = accountsToExploreIds.map((profileId) => profiles.find((profile) => profile.id === profileId)).filter((profile): profile is PrototypeProfile => profile !== undefined && !profile.isPrivate).map(creatorFromProfile);
    return resolve(creators);
  },
  async searchAccounts(query, offset = 0) {
    const term = query.trim().replace(/^@/, '').toLocaleLowerCase();
    return resolve(profiles.filter(profile => !profile.isPrivate && term && `${profile.name} ${profile.handle}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(offset, offset + 30)
      .map(profile => ({ ...creatorFromProfile(profile), kind: `@${profile.handle}` })));
  }
};
/** Standalone fixture helper; not registered in a product runtime. */
export const mockSearchService = {
  async search(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return resolve([] as SearchResult[]);
    }
    const queryWords = normalized.split(/\s+/).filter(Boolean);
    const matchesText = (value: string) => {
      const words = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
      return queryWords.every((token) => words.some((word) => word === token || (token.length >= 4 && word.startsWith(token))));
    };
    const profileHits: SearchResult[] = profiles.filter((profile) => !profile.isPrivate && matchesText(`${profile.name} ${profile.headline}`)).map((profile) => ({
      id: profile.id,
      kind: 'profile',
      title: profile.name,
      subtitle: profile.headline,
      avatar: profile.avatar
    }));
    const projectHits: SearchResult[] = prototypeViews().filter(({ view, flags }) => decideProjectPlacement({ view, surface: 'search', ...flags }).eligible).map(({ view, profile }) => ({
      project: view.project,
      profile,
      categoryLabel: profile.categories.find((category) => category.id === view.project.categoryId)?.label ?? ''
    })).filter(({
      project,
      categoryLabel
    }) => matchesText(`${project.title} ${project.summary} ${categoryLabel}`)).map(({
      project,
      profile
    }) => ({
      id: project.id,
      kind: 'project',
      title: project.title,
      // The creator alone: with no year on the record, there is nothing else here
      // that is true of every project.
      subtitle: profile.name
    }));
    const locationHits: SearchResult[] = cities.filter((city) => {
      const cityName = city.name.toLowerCase();
      const words = cityName.split(/\s+/);
      return cityName === normalized || words.some((word) => word === normalized || (normalized.length >= 4 && word.startsWith(normalized)));
    }).map((city) => ({
      id: slug(city.name),
      kind: 'location',
      title: city.name,
      subtitle: getCountryCode(city.name)
    }));
    return resolve([...profileHits, ...projectHits, ...locationHits]);
  }
};

/**
 * Follows are in-memory for the session only, and keyed by ACCOUNT.
 *
 * They were one global set, which meant the follow graph had no follower in it —
 * only a list of followed ids. With two accounts that is indistinguishable from
 * every account following the same people, and a guest would have read a signed-in
 * viewer's follows. Each account now owns its own set, so no account can read
 * another's.
 *
 * The follower is taken from the prototype session, which is this implementation's
 * equivalent of a request a server has verified — never from an argument.
 *
 * Signing out does NOT clear these: follows belong to the account, not the session,
 * so signing back into the same account during this browser session restores its
 * own follows. A reload clears everything, because nothing is persisted.
 */
const followsByAccount = new Map<string, Set<Id>>();
function followsFor(accountId: string): Set<Id> {
  const existing = followsByAccount.get(accountId);
  if (existing) {
    return existing;
  }
  const created = new Set<Id>();
  followsByAccount.set(accountId, created);
  return created;
}
/**
 * Follow REQUESTS, with the same lifetime as the edges above. A request is what
 * a follow of a private profile becomes: it is not an edge, and it grants
 * nothing until the creator approves it.
 *
 * Held as records rather than per-account sets, because a request has two ends:
 * the account that asked (which is what makes a request the viewer's OWN) and
 * the profile being asked (which is what makes it appear in that creator's
 * list). A set keyed by one end could only ever answer half of that.
 */
type FollowRequestRecord = {
  requesterAccountId: string;
  requesterProfileId: Id;
  targetProfileId: Id;
};
/**
 * Seeded pending requests, so the approval side has something real to act on in
 * the prototype: only the signed-in account can create a request here, so
 * without these a creator's own list would always be empty. These are seed data
 * of exactly the same kind as the seeded profiles and projects — they are held
 * in memory, are cleared by a reload, and are not persisted anywhere.
 */
const followRequests: FollowRequestRecord[] = [{
  requesterAccountId: 'user-tide-and-form',
  requesterProfileId: 'tide-and-form',
  targetProfileId: 'avi'
}, {
  requesterAccountId: 'user-wide-margin',
  requesterProfileId: 'wide-margin',
  targetProfileId: 'avi'
}, {
  requesterAccountId: 'user-orbit-house',
  requesterProfileId: 'orbit-house',
  targetProfileId: 'studio-luma'
}];
function hasRequest(accountId: string, targetProfileId: Id): boolean {
  return followRequests.some((record) => record.requesterAccountId === accountId && record.targetProfileId === targetProfileId);
}
/** Removes one pending request. Reports whether there was actually one to remove. */
function dropRequest(accountId: string, targetProfileId: Id): boolean {
  const index = followRequests.findIndex((record) => record.requesterAccountId === accountId && record.targetProfileId === targetProfileId);
  if (index === -1) {
    return false;
  }
  followRequests.splice(index, 1);
  return true;
}
/** Resolves the requester's public identity, dropping any that no longer exists. */
function describeRequestsFor(targetProfileId: Id): FollowRequest[] {
  return followRequests.filter((record) => record.targetProfileId === targetProfileId).map((record) => {
    const profile = profiles.find((candidate) => candidate.id === record.requesterProfileId);
    return profile ? {
      profileId: profile.id,
      name: profile.name,
      handle: profile.handle,
      initials: profile.initials,
      avatar: profile.avatar
    } : null;
  }).filter((request): request is FollowRequest => request !== null);
}
/** The signed-in viewer's own profile, or a refusal. Never taken from an argument. */
function requireOwnProfile(): {
  accountId: string;
  profileId: Id;
} {
  const follower = currentFollower();
  if (!follower || !follower.profileId) {
    throw new SocialServiceError('unauthenticated', 'Sign in to see who has asked to follow you.');
  }
  return follower;
}

/** The viewer's account and their own profile id, as the session reports them. */
function currentFollower(): {
  accountId: string;
  profileId: string;
} | null {
  const user = readPrototypeSession()?.user;
  return user ? {
    accountId: user.id,
    profileId: user.profileId
  } : null;
}

/** Shared by both mutations: every precondition, checked in the same order. */
function requireFollowTarget(profileId: Id, action: string): {
  accountId: string;
  profileId: Id;
  follows: Set<Id>;
} {
  // Enforced HERE, independently of the UI gate.
  const follower = currentFollower();
  if (!follower) {
    throw new SocialServiceError('unauthenticated', `Sign in to ${action} creators.`);
  }
  // A follow edge pointing at nothing is worse than a refusal.
  if (!profiles.some((profile) => profile.id === profileId)) {
    throw new SocialServiceError('not_found', 'That creator no longer has a profile.');
  }
  // Refused at the boundary rather than merely hidden in the interface.
  if (follower.profileId && follower.profileId === profileId) {
    throw new SocialServiceError('permission_denied', 'You cannot follow your own profile.');
  }
  return {
    accountId: follower.accountId,
    profileId: follower.profileId,
    follows: followsFor(follower.accountId)
  };
}
export const mockSocialService: SocialService = {
  async listProfileConnections(profileId, kind, offset = 0) {
    const viewer = requireOwnProfile();
    if (viewer.profileId !== profileId) throw new SocialServiceError('permission_denied', 'Only the profile owner can view this list.');
    const ids = kind === 'following' ? [...followsFor(viewer.accountId)] : [...followsByAccount.entries()]
      .filter(([, targets]) => targets.has(profileId))
      .map(([accountId]) => accountProfileIds.get(accountId) ?? followRequests.find((request) => request.requesterAccountId === accountId)?.requesterProfileId);
    const people = ids.flatMap((id) => {
      const person = profiles.find((candidate) => candidate.id === id);
      return person ? [{ profileId: person.id, name: person.name, avatar: person.avatar }] : [];
    }).sort((a, b) => a.profileId.localeCompare(b.profileId));
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    return resolve({ items: people.slice(start, start + 54), total: people.length, nextOffset: start + 54 < people.length ? start + 54 : null }, 0);
  },
  async getFollowState(profileId) {
    // Open to guests: the answer for someone with no account is "you do not".
    const follower = currentFollower();
    const follows = follower ? followsFor(follower.accountId) : null;
    return resolve({
      profileId,
      isFollowing: follows?.has(profileId) ?? false,
      isRequested: follower ? hasRequest(follower.accountId, profileId) : false
    } satisfies FollowState, 0);
  },
  async followProfile(profileId) {
    const {
      accountId,
      profileId: requesterProfileId,
      follows
    } = requireFollowTarget(profileId, 'follow');
    /*
     * Whether this becomes an edge or a request is decided from the TARGET's own
     * visibility, here at the boundary — a client cannot be trusted to know, and
     * a private profile must not be followed outright by one that guesses wrong.
     */
    const targetProfile = profiles.find((profile) => profile.id === profileId) as { isPrivate?: boolean } | undefined;
    const isPrivate = targetProfile?.isPrivate === true;
    if (isPrivate) {
      // Idempotent, and it grants nothing: no edge is written.
      if (!hasRequest(accountId, profileId)) {
        followRequests.push({
          requesterAccountId: accountId,
          requesterProfileId,
          targetProfileId: profileId
        });
      }
      return resolve({
        profileId,
        isFollowing: false,
        isRequested: true
      });
    }
    // Idempotent: a Set cannot record the same edge twice.
    follows.add(profileId);
    dropRequest(accountId, profileId);
    return resolve({
      profileId,
      isFollowing: true,
      isRequested: false
    });
  },
  async unfollowProfile(profileId) {
    const {
      accountId,
      follows
    } = requireFollowTarget(profileId, 'unfollow');
    follows.delete(profileId);
    dropRequest(accountId, profileId);
    return resolve({
      profileId,
      isFollowing: false,
      isRequested: false
    });
  },
  async cancelFollowRequest(profileId) {
    const {
      accountId
    } = requireFollowTarget(profileId, 'follow');
    // Refused rather than reported as success: withdrawing a request that was
    // never made is not a thing that happened.
    if (!dropRequest(accountId, profileId)) {
      throw new SocialServiceError('not_found', 'There is no pending request to withdraw.');
    }
    return resolve({
      profileId,
      isFollowing: false,
      isRequested: false
    });
  },
  async listFollowRequests() {
    // The profile is the SESSION's, never an argument: one creator cannot
    // enumerate another's pending requests.
    const { profileId } = requireOwnProfile();
    return resolve(describeRequestsFor(profileId), 0);
  },
  async approveFollowRequest(requesterProfileId) {
    const { profileId } = requireOwnProfile();
    const index = followRequests.findIndex((record) => record.targetProfileId === profileId && record.requesterProfileId === requesterProfileId);
    if (index === -1) {
      throw new SocialServiceError('not_found', 'That request is no longer pending.');
    }
    // Consumed, then granted: the edge belongs to the account that ASKED, so
    // approving makes them a follower of this profile rather than the reverse.
    const [record] = followRequests.splice(index, 1);
    accountProfileIds.set(record.requesterAccountId, record.requesterProfileId);
    followsFor(record.requesterAccountId).add(profileId);
    return resolve(describeRequestsFor(profileId));
  },
  async declineFollowRequest(requesterProfileId) {
    const { profileId } = requireOwnProfile();
    const index = followRequests.findIndex((record) => record.targetProfileId === profileId && record.requesterProfileId === requesterProfileId);
    if (index === -1) {
      throw new SocialServiceError('not_found', 'That request is no longer pending.');
    }
    // Consumed and nothing granted.
    followRequests.splice(index, 1);
    return resolve(describeRequestsFor(profileId));
  }
};
/**
 * The comment graph: in-memory, session-only, and flat.
 *
 * Records are stored flat and assembled into threads on read, which is how a real
 * store would hold them — nesting is a presentation of the parent relationship, not
 * a storage shape. Nothing is persisted: a reload empties this, and the UI says so
 * rather than implying a conversation was saved.
 *
 * Author identity is NOT stored on the record. Only the account id is, and the
 * name, initials, and picture are resolved from the canonical profile on every
 * read — so renaming a profile corrects every comment it ever wrote instead of
 * leaving stale copies behind.
 */
type CommentRecord = {
  id: Id;
  projectId: Id;
  /** The authenticated account that wrote it — the sole authority on deletion. */
  accountId: string;
  body: string;
  createdAt: string;
  parentId: Id | null;
  rootId: Id | null;
};
const commentRecords: CommentRecord[] = [];
let commentSequence = 0;

/** Resolves presentation identity for an account, at read time. */
function resolveCommentAuthor(accountId: string): CommentAuthor {
  const profileId = accountProfileIds.get(accountId) ?? null;
  const profile = profileId ? profiles.find((entry) => entry.id === profileId) ?? null : null;
  if (profile) {
    return {
      profileId: profile.id,
      name: profile.name,
      initials: profile.name.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase(),
      avatarUrl: profile.avatar || undefined
    };
  }
  // An account with no creator profile can still comment. It is named from the
  // session rather than given a borrowed identity.
  const session = readPrototypeSession();
  const user = session?.user.id === accountId ? session.user : null;
  return {
    profileId: null,
    name: user?.displayName ?? 'Account',
    initials: user?.initials ?? 'AC'
  };
}
function toComment(record: CommentRecord, viewerAccountId: string | null): Comment {
  return {
    id: record.id,
    projectId: record.projectId,
    author: resolveCommentAuthor(record.accountId),
    body: record.body,
    createdAt: record.createdAt,
    parentId: record.parentId,
    rootId: record.rootId,
    // Authorship is the only permission here. No moderation role exists yet, and
    // inventing one would be a claim about capabilities the product does not have.
    canDelete: viewerAccountId !== null && record.accountId === viewerAccountId
  };
}
function requireCommentAuthor(action: string): string {
  const accountId = readPrototypeSession()?.user.id ?? null;
  if (!accountId) {
    throw new CommentServiceError('unauthenticated', `Sign in to ${action}.`);
  }
  return accountId;
}
function requireValidBody(body: string): string {
  const problem = validateCommentBody(body);
  if (problem) {
    // Re-checked independently of the client: the form's check is for feedback.
    throw new CommentServiceError('validation', problem);
  }
  return body.trim();
}
export const mockCommentService: CommentService = {
  async listComments(projectId) {
    // Public: a comment on published work is published too.
    const viewerAccountId = readPrototypeSession()?.user.id ?? null;
    const forProject = commentRecords.filter((record) => record.projectId === projectId);
    const roots = forProject.filter((record) => record.parentId === null);
    const threads = roots.map((root) => ({
      comment: toComment(root, viewerAccountId),
      replies: forProject.filter((record) => record.rootId === root.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((reply) => toComment(reply, viewerAccountId))
    }));
    return resolve({
      projectId,
      // Newest conversation last, the way a thread reads.
      threads: threads.sort((a, b) => a.comment.createdAt.localeCompare(b.comment.createdAt)),
      totalCount: forProject.length
    } satisfies ProjectComments, 240);
  },
  async createComment(projectId, body) {
    const accountId = requireCommentAuthor('join the conversation');
    const trimmed = requireValidBody(body);
    // A comment cannot hang off a project that does not exist.
    if (!profiles.some((profile) => profile.projects.some((project) => project.id === projectId))) {
      throw new CommentServiceError('not_found', 'That project no longer exists.');
    }
    commentSequence += 1;
    const record: CommentRecord = {
      id: `comment-${commentSequence}`,
      projectId,
      accountId,
      body: trimmed,
      createdAt: new Date().toISOString(),
      parentId: null,
      rootId: null
    };
    commentRecords.push(record);
    return resolve(toComment(record, accountId), 320);
  },
  async createReply(projectId, parentCommentId, body) {
    const accountId = requireCommentAuthor('reply');
    const trimmed = requireValidBody(body);
    // The project the caller believes it is writing into has to be real.
    if (!profiles.some((profile) => profile.projects.some((project) => project.id === projectId))) {
      throw new CommentServiceError('not_found', 'That project no longer exists.');
    }
    // The ordinary race: the parent was deleted after the list was read.
    const parent = commentRecords.find((record) => record.id === parentCommentId);
    if (!parent) {
      throw new CommentServiceError('not_found', 'That comment has been deleted, so it cannot be replied to.');
    }
    // The caller's claim is CHECKED rather than trusted. A parent on a different
    // project means the reply was composed against a list that no longer describes
    // this conversation, so it is refused instead of being filed somewhere it does
    // not belong.
    if (parent.projectId !== projectId) {
      throw new CommentServiceError('not_found', 'That comment is not part of this project’s conversation.');
    }
    commentSequence += 1;
    const record: CommentRecord = {
      id: `comment-${commentSequence}`,
      projectId,
      accountId,
      body: trimmed,
      createdAt: new Date().toISOString(),
      parentId: parent.id,
      // One level: a reply to a reply still belongs to the same root thread.
      rootId: parent.rootId ?? parent.id
    };
    commentRecords.push(record);
    return resolve(toComment(record, accountId), 320);
  },
  async deleteComment(commentId) {
    const accountId = requireCommentAuthor('delete a comment');
    const index = commentRecords.findIndex((record) => record.id === commentId);
    if (index === -1) {
      // Already gone — reported rather than treated as a success, so the UI can
      // say what happened instead of implying this request removed it.
      throw new CommentServiceError('not_found', 'That comment has already been deleted.');
    }
    if (commentRecords[index].accountId !== accountId) {
      throw new CommentServiceError('permission_denied', 'You can only delete your own comments.');
    }
    const [removed] = commentRecords.splice(index, 1);
    // A deleted top-level comment takes its replies with it: leaving them would
    // orphan them under a parent that no longer resolves.
    if (removed.parentId === null) {
      for (let index = commentRecords.length - 1; index >= 0; index -= 1) {
        if (commentRecords[index].rootId === removed.id) {
          commentRecords.splice(index, 1);
        }
      }
    }
    return resolve(undefined, 300);
  }
};

/**
 * Engagement is in-memory for the session only, and VIEWER-SCOPED.
 *
 * Engagement is account data, so it is keyed by authenticated account id rather
 * than held in one global set. That is the difference between a prototype that
 * merely looks right for one signed-in person and one that behaves correctly the
 * moment a second account exists: with a single shared set, account B would open
 * the product already carrying account A's likes, and A's private collection would
 * be readable by anyone.
 *
 * The viewer is read from the prototype auth module — this implementation's own
 * equivalent of a verified request — never from an argument and never from React.
 * The UI's sign-in gate is UX; THIS is the enforcement.
 *
 * Public TOTALS are reported as `null`, because this implementation has no other
 * viewers to count — answering `0`, or inventing a plausible number, would be a
 * claim about an audience that does not exist.
 */
const engagementByAccount = new Map<string, Record<EngagementKind, Set<Id>>>();

/**
 * The account id of the verified viewer, or null for a guest.
 *
 * Every method below starts here, so no path can accidentally skip the check.
 */
function currentAccountId(): string | null {
  return readPrototypeSession()?.user.id ?? null;
}

/**
 * That account's records, created on first use.
 *
 * Signing out does NOT delete them: the account's data outlives its session, so
 * signing back into the same account during this prototype session restores that
 * account's own engagement — exactly as a real backend would. A page RELOAD does
 * clear everything, because nothing here is persisted, and the UI says so.
 */
function recordsFor(accountId: string): Record<EngagementKind, Set<Id>> {
  const existing = engagementByAccount.get(accountId);
  if (existing) {
    return existing;
  }
  const created: Record<EngagementKind, Set<Id>> = {
    like: new Set<Id>(),
    save: new Set<Id>(),
    repost: new Set<Id>()
  };
  engagementByAccount.set(accountId, created);
  return created;
}

/** A guest has engaged with nothing, so every flag reads false — not an error. */
function readEngagement(projectId: Id, accountId: string | null): ProjectEngagement {
  const records = accountId ? recordsFor(accountId) : null;
  return {
    projectId,
    isLiked: records?.like.has(projectId) ?? false,
    isSaved: records?.save.has(projectId) ?? false,
    isReposted: records?.repost.has(projectId) ?? false,
    likeCount: null,
    saveCount: null,
    repostCount: null
  };
}
export const mockEngagementService: EngagementService = {
  async getProjectEngagement(projectId) {
    // Readable by a guest: whether a project can be liked is public, and the
    // answer for someone with no account is simply "you have not".
    return resolve(readEngagement(projectId, currentAccountId()), 0);
  },
  async getProjectEngagements(projectIds) {
    const accountId = currentAccountId();
    return resolve(projectIds.map((projectId) => readEngagement(projectId, accountId)), 0);
  },
  async setEngagement({
    projectId,
    kind,
    engaged
  }) {
    // Enforced HERE, independently of the React gate. A call that reaches this
    // point without a session is refused rather than written to a shared set.
    const accountId = currentAccountId();
    if (!accountId) {
      throw new EngagementServiceError('unauthenticated', 'Sign in to like, save, or repost work.');
    }
    // The project has to exist: engaging with an id nothing published would be a
    // record pointing at nothing.
    const exists = profiles.some((profile) => profile.projects.some((project) => project.id === projectId));
    if (!exists) {
      throw new EngagementServiceError('not_found', 'That project no longer exists.');
    }
    const records = recordsFor(accountId);
    // Idempotent by construction: a Set cannot double-count.
    if (engaged) {
      records[kind].add(projectId);
    } else {
      records[kind].delete(projectId);
    }
    return resolve(readEngagement(projectId, accountId), 260);
  },
  async listEngagedProjectIds(kind) {
    // An activity collection is private account data. There is no such thing as a
    // guest's collection, so this is REFUSED rather than answered with an empty
    // array — an empty array would read as "you have liked nothing", which is a
    // different and misleading claim.
    const accountId = currentAccountId();
    if (!accountId) {
      throw new EngagementServiceError('unauthenticated', 'Sign in to see your own likes, saved work, and reposts.');
    }
    return resolve([...recordsFor(accountId)[kind]], 0);
  }
};
export const mockNotificationService: NotificationService = {
  async listNotifications() {
    return resolve([] as Notification[]);
  },
  async markRead() {
    return resolve(undefined);
  },
  async markAllRead() {
    return resolve(undefined);
  },
  subscribeToNotifications() {
    return () => undefined;
  }
};
export const mockMessagingService: MessagingService = {
  async listConversations() {
    return resolve({ conversations: [], nextOffset: null });
  },
  async getOrCreateConversation() {
    throw new Error('Messaging needs a configured Supabase project.');
  },
  async getConversation() {
    throw new Error('Messaging needs a configured Supabase project.');
  },
  async listMessages() {
    return resolve({ messages: [], before: null });
  },
  async searchConversations() {
    return resolve([]);
  },
  async searchRecipients() {
    return resolve([]);
  },
  async sendMessage() {
    throw new Error('Messaging needs a configured Supabase project.');
  },
  async editMessage() {
    throw new Error('Messaging needs a configured Supabase project.');
  },
  async deleteMessage() {
    return resolve(undefined);
  },
  async toggleReaction() {
    return resolve([]);
  },
  async markConversationRead() {
    return resolve(undefined);
  },
  subscribeToMessages() {
    return () => undefined;
  },
  subscribeToConversationChanges() {
    return () => undefined;
  },
  subscribeToTyping() {
    return () => undefined;
  },
  broadcastTyping() { return undefined; },
  async getPreferences() {
    return resolve({ permission: 'requests' as const });
  },
  async updatePreferences(preferences) {
    return resolve(preferences);
  },
  async acceptRequest() {
    throw new Error('Messaging needs a configured Supabase project.');
  },
  async deleteRequest() {
    throw new Error('Messaging needs a configured Supabase project.');
  },
  async setMuted() {
    return resolve(undefined);
  },
  async archiveConversation() {
    return resolve(undefined);
  },
  async listBlockedPeople() { return resolve([]); },
  async unblockParticipant() { return resolve(undefined); },
  async blockParticipant() {
    return resolve(undefined);
  },
  async reportConversation() {
    return resolve(undefined);
  },
};
/** Joined sessions are in-memory for the session only, like follows. */
const joinedSessionIds = new Set<Id>();
export const mockLiveService: LiveService = {
  async listSessions(locationId) {
    // Deterministic prototype seeds. Real sessions would come from the broadcast
    // backend; these describe sessions rather than carrying any audio.
    const sessions: LiveSession[] = liveSessionSeeds.map((seed) => ({ ...seed }));
    return resolve(locationId ? sessions.filter((session) => session.locationId === locationId) : sessions);
  },
  async getLiveCapability() {
    return resolve({
      isRealtime: false,
      isDurable: false,
      reason: 'No broadcast backend is connected, so joining marks the session for this browser session only — there is no audio and a reload clears it.'
    } satisfies LiveCapability, 80);
  },
  /**
   * Membership is in-memory for the session only: nothing is streamed, no presence
   * is published, and a reload leaves every session unjoined.
   */
  async joinSession(sessionId) {
    const session = liveSessionSeeds.find((seed) => seed.id === sessionId);
    if (!session) {
      throw new Error('That session is no longer on air.');
    }
    joinedSessionIds.add(sessionId);
    return resolve({ ...session } satisfies LiveSession);
  },
  async leaveSession(sessionId) {
    joinedSessionIds.delete(sessionId);
    return resolve(undefined);
  }
};
/** Standalone fixture helper; not registered in a product runtime. */
export const mockAnalyticsService = {
  async getCreatorAnalytics(profileId: Id, periodId = defaultReportingPeriodId) {
    return resolve({
      profileId,
      periodLabel: getReportingPeriod(periodId).label,
      headlineGazeHours: Number.parseFloat(gazeCapital.value),
      kpiIds: kpisForPeriod(periodId).map((kpi) => kpi.id)
    });
  },
  async getGenerativeCapability() {
    return resolve({
      isAvailable: false,
      reason: 'No generation backend is connected to this prototype, so these actions describe what they would do and produce nothing.'
    } satisfies GenerativeCapability, 80);
  },
  /**
   * NOT IMPLEMENTED: there is no generation backend. These used to resolve void
   * after a delay, which let the UI show a success state for work that was never
   * produced. Each now reports plainly that nothing was generated and nothing was
   * changed. A real implementation dispatches the job and returns its outcome.
   */
  async requestLayoutRevision(projectId: Id) {
    void projectId;
    return resolve({
      didGenerate: false,
      changedContent: false,
      message: 'No layout revision was generated. This action is a prototype: your project and its files are unchanged.'
    } satisfies GenerationOutcome, 700);
  },
  async simulateDraft(files: File[]) {
    // The files are never read, uploaded, or stored.
    void files;
    return resolve({
      didGenerate: false,
      changedContent: false,
      message: 'No performance simulation was run. Your draft files were not uploaded or analysed, and nothing was saved.'
    } satisfies GenerationOutcome, 700);
  },
  async synthesizeCrossMedia(projectIds: Id[]) {
    void projectIds;
    return resolve({
      didGenerate: false,
      changedContent: false,
      message: 'No cross-media synthesis was produced. The projects involved are unchanged.'
    } satisfies GenerationOutcome, 700);
  }
};
/** Standalone fixture helper; not registered in a product runtime. */
export const mockCommerceService = {
  async getProduct(productId: Id) {
    // NOT IMPLEMENTED: commerce data is presentational in the prototype.
    return resolve({
      id: productId,
      title: productId,
      creatorName: '',
      media: {
        kind: 'image',
        label: 'Image'
      }
    } satisfies Product);
  }
};

export { localGeographyService } from '../local';
