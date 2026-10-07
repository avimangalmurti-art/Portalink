/**
 * Domain models for the portalinknetworks frontend.
 *
 * These are the shapes the UI expects. Engineering can satisfy them from any
 * production source (REST, GraphQL, RSC loaders) without touching components.
 * Every entity is keyed by a stable `id`; visible labels are never identifiers.
 *
 * Only fields the current product actually renders are modelled here.
 */

import type { AssetProcessingState } from './publishing';
import type { ProjectRelevance } from './discovery';
export type Id = string;

/* ── People ─────────────────────────────────────────────────────────────── */

/**
 * The signed-in account is NOT modelled here. Authenticated identity lives in
 * `types/auth.ts` (`AuthUser` / `AuthSession`) and is served only by
 * `AuthService`, so nothing else can claim to know who the viewer is.
 */
export type ProfileKind = 'individual' | 'studio' | 'collective';
export type ProfileStat = {
  label: string;
  value: string;
};
export type ProfileLinkAction = 'bio' | 'collaboration' | 'message';
export type ProfileLink = {
  label: string;
  href: string;
  /** Reuses the Portal icon vocabulary; absent legacy records use `globe`. */
  iconName?: string;
  /** Built-in destinations use callbacks, never the external href. */
  action?: ProfileLinkAction;
  /** Preserve removed defaults so they stay removed across devices. */
  hidden?: boolean;
};

export type PublicAppearance = {
  accentColor: string;
  systemGray: string;
  mode: 'light' | 'dark' | 'auto';
};

/** A creator's public identity plus the portfolio structure they own. */
export type PublicCitationEvent = {
 id:string; direction:"incoming"|"outgoing"; item_id:string; label:string;
 other_creator_name:string; other_creator_handle:string; other_project_id:string;
 other_project_title:string; other_profile_id:string; other_category_id:string;
 citing_project_title:string; created_at:string; note:string|null;
};
export type Profile = {
 publicCitationEvents?: PublicCitationEvent[];
  /** Public Journey is explicitly opt-in; absent older columns remain private. */
  portfolioHeadline?: string | null;
  school?: string;
  availability?: string;
  contactEmailPublic?: boolean;
  contactEmail?: string;
  allowPdfDownload?: boolean;
  startHereProjectId?: Id | null;
  showJourney?: boolean;
  showOutgoingCitations?: boolean;
  showIncomingCitations?: boolean;
  thenNow?: { then: Id; now: Id } | null;
  id: Id;
  name: string;
  handle: string;
  headline: string;
  location: string;
  initials: string;
  avatar: string;
  /** Heading shown above this profile's categories in the sidebar. */
  navHeading: string;
  stats: ProfileStat[];
  /** Legacy platform destinations. Migrated into `links` on the next profile save. */
  socialLinks: Record<string, string>;
  /** Creator-defined destinations: any safe URL, label, and Portal icon. */
  links: ProfileLink[];
  categories: PortfolioCategory[];
  projects: Project[];
  /**
   * Whether this profile is withheld from discovery. Optional because existing
   * records predate it: an absent value means public, which is the state every
   * seeded profile is actually in. Enforcement belongs to the services that
   * publish and search — a client cannot make a record private by hiding it.
   */
  isPrivate?: boolean;
  /** Creator branding shared by every public URL; null until first saved. */
  publicAppearance?: PublicAppearance | null;
  /** Owner's saved 2–13 project-card count, shared by Home and the public profile. */
  projectGridColumns?: number;
};
/**
 * Editing an existing profile. Deliberately the same identity fields
 * onboarding collects (see `CreateProfileInput` in `types/profile.ts`), so
 * profile editing reuses one validation vocabulary rather than growing a second
 * model. `avatar` is a prepared, not-yet-uploaded file.
 */
export type UpdateProfileInput = Partial<Pick<Profile, 'name' | 'headline' | 'location' | 'links' | 'socialLinks' | 'isPrivate' | 'publicAppearance' | 'projectGridColumns' | 'showJourney' | 'showOutgoingCitations' | 'showIncomingCitations' | 'thenNow' | 'portfolioHeadline' | 'school' | 'availability' | 'contactEmailPublic' | 'contactEmail' | 'allowPdfDownload' | 'startHereProjectId'>> & {
  /** Normalized without the leading "@"; uniqueness is re-checked on write. */
  handle?: string;
  avatar?: import('./profile').PreparedAvatar;
};

/* ── Portfolio ──────────────────────────────────────────────────────────── */

/** How a category presents its work. Drives which viewer/layout is used. */
export type CategoryFormat = 'grid' | 'gallery' | 'story' | 'feed' | 'video' | 'audio' | 'data';
export type PortfolioCategory = {
  id: Id;
  label: string;
  iconName: string;
  format: CategoryFormat;
  blurb: string;
};

/** Owner-only arrangement of a profile's categories and their icons. */
export type PortfolioArrangement = {
  categoryOrder: Id[];
  hiddenCategoryIds: Id[];
  categoryIcons: Record<Id, string>;
};

/** What a new category needs. Everything else is the implementation's business. */
export type CreateCategoryInput = {
  label: string;
  format?: CategoryFormat;
  iconName?: string;
  blurb?: string;
};

/**
 * Whether this category can be removed, and what removing it takes with it.
 *
 * Shaped like `AccountDeletionCapability`: the implementation answers, because
 * only it knows what its store can do. `blockingProjectCount` lets the UI
 * explain a refusal in terms of the creator's own work rather than a generic
 * error — deleting a category must never quietly take published projects with
 * it, and must never leave them filed under a category that no longer exists.
 */
export type CategoryDeletionCapability = {
  isAvailable: boolean;
  /** Plain sentences naming exactly what deletion removes. */
  removes: readonly string[];
  /** Why it cannot be done, when `isAvailable` is false. */
  reason?: string;
  /** Projects still filed under this category. Zero means it is safe to remove. */
  blockingProjectCount: number;
};
export type CategoryMutationErrorCode = 'label_required' | 'label_too_long' | 'duplicate_label' | 'not_found' | 'category_not_empty' | 'deletion_unavailable' | 'unknown';
export type ProjectMediaKind = 'image' | 'images' | 'pdf' | 'video' | 'audio' | 'case-study' | 'interactive';
export type ProjectOrientation = 'portrait' | 'standard' | 'landscape';

/** What is actually inside a project, and how the preview should be shaped. */
export type ProjectMedia = {
  kind: ProjectMediaKind;
  /** Human-readable indicator, e.g. "PDF · 68 pages". */
  label: string;
  count?: number;
  duration?: string;
};
export type ProjectChapterImage = {
  src: string;
  alt: string;
  caption: string;
};
export type ProjectChapter = {
  title: string;
  body: string;
  image?: string;
  imageAlt?: string;
  images?: ProjectChapterImage[];
};
export type ProjectCredit = {
  label: string;
  value: string;
};

/**
 * How an attachment is RENDERED. Resolved from the file itself — never from the
 * category or region that contains it, so a 3D model inside a music category is
 * still a 3D model.
 */
export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'model3d' | 'unknown';

/**
 * A non-destructive cover crop chosen by the creator.
 *
 * `x` and `y` are normalized focal coordinates (0–1), so the important part of
 * the artwork remains in view when a cover is presented at different responsive
 * sizes. `zoom` is a multiplier applied after the source has filled its frame.
 */
export type ProjectCoverFrame = {
  x: number;
  y: number;
  zoom: number;
  /** Explicit viewport ratio for newly positioned image covers; absent on legacy covers. */
  aspectRatio?: number;
  /** Exported source-relative rectangle, separate from the object-position x/y above. */
  crop?: import('./imageCrop').RelativeImageCrop;
};

/**
 * One file inside a project.
 *
 * `sourceUrl` is whatever the renderer can read today: a local object URL in the
 * prototype, a signed storage URL once a real implementation exists. `storagePath`
 * is the persisted object key and stays null until something is actually stored,
 * so presentation can never mistake a local preview for storage.
 */
export type ProjectAttachment = {
  id: Id;
  kind: MediaKind;
  fileName: string;
  displayName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  /** Human-readable type, e.g. "PDF", "3D model". */
  typeLabel: string;
  sourceUrl: string | null;
  storagePath: string | null;
  status: AssetProcessingState;
  isCover: boolean;
  order: number;
  /** Only what the renderer needs and the file actually told us. */
  metadata?: {
    /** Verified browser-playable copy; the original source/storage fields stay intact. */
    playbackVideo?: {
      storagePath: string;
      sourceUrl: string | null;
      mimeType: 'video/mp4';
      sizeBytes: number;
      multipart?: { version: 1; sizeBytes: number; partBytes: number; partCount: number };
    };
    /** Logical original stored as bounded private objects, not separate assets. */
    multipart?: { version: 1; sizeBytes: number; partBytes: number; partCount: number };
    durationSeconds?: number;
    pageCount?: number;
    widthPixels?: number;
    heightPixels?: number;
    aspectRatio?: number;
    processingError?: string;
    failedPage?: number;
    /** One-based PDF page selected by the creator when this asset is the cover. */
    coverPageNumber?: number;
    /** Creator-selected focal point and zoom for this asset when used as cover. */
    coverFrame?: ProjectCoverFrame;
    /** Server-rendered PDF pages; sourceUrl is a short-lived signed URL. */
    renderedPages?: Array<{
      index: number;
      withinDocumentIndex: number;
      attachmentId: Id;
      storagePath: string;
      sourceUrl: string | null;
      width: number;
      height: number;
      aspectRatio: number;
    }>;
  };
};
/**
 * Presentation settings the CREATOR chose for one project.
 *
 * Typography belongs to the project, not to the account that owns it or the
 * category it is filed under: two projects by the same person usually read in
 * different faces. Carrying it on the record is what makes the same project read
 * the same way on the feed, in search, in its category, and in its viewer.
 */
export type ProjectDesign = {
  typefaceId: string;
  /** Creator-selected number of pages per row that viewers initially see. */
  pagesPerRow?: number;
};
/** Immutable, pre-rendered cover artwork; originals remain separate attachments. */
export type ProjectCoverThumbnail = {
  social?: { path: string; width: 1200; height: 630; sourceUrl?: string | null };
  version: 1;
  bucket: 'project-covers' | 'project-media';
  sourceAttachmentId: string;
  sourceKey: string;
  frameBaked: true;
  variants: Array<{
    size: 200 | 400 | 800;
    path: string;
    width: number;
    height: number;
    sourceUrl?: string | null;
  }>;
};
export type ProjectCreationDetails = {
  /** Creator-reviewed month, YYYY-MM. */
  madeIn: string;
  field: string;
  answers: { what: string; did: string; learned: string };
};
export type Project = {
  madeOn?: string;
  citationPermitted?: boolean;
  tags?: string[];
  thenNowCaption?: string;
  /** Known from the stored project and portal visibility; absent on legacy fixtures. */
  isPubliclyVisible?: boolean;
  creationDetails?: ProjectCreationDetails;
  id: Id;
  categoryId: Id;
  title: string;
  summary: string;
  /** Canonical publication time, used for recency without inventing an age. */
  publishedAt?: string;
  /** Published index grouping, readable without loading owner arrangement tools. */
  isPinned?: boolean;
  /** Content-derived discovery metadata; never copied from the creator's home. */
  relevance?: ProjectRelevance;
  cover: string;
  coverAlt: string;
  coverThumbnail?: ProjectCoverThumbnail;
  /** Set when the cover needs a renderer other than a normal image element. */
  coverKind?: 'video' | 'document';
  /**
   * The cover asset's real proportions, carried so every surface can present
   * the work at its own shape without guessing or restating it.
   */
  coverOrientation?: 'portrait' | 'landscape' | 'square';
  /** Exact uploaded-cover ratio when intrinsic dimensions are available. */
  coverAspectRatio?: number;
  /** Creator-selected non-destructive cover crop. */
  coverFrame?: ProjectCoverFrame;
  /** One-based page used when the cover is a multipage document. */
  coverPageNumber?: number;
  pageCount?: number;
  /**
   * The files this project is made of, when it was published through the
   * product. Absent on seeded work, which has no uploaded files — presentation
   * must not invent them.
   */
  attachments?: ProjectAttachment[];
  chapters?: ProjectChapter[];
  credits?: ProjectCredit[];
  /**
   * The creator's presentation choices. Absent means the project has never been
   * given one, and presentation falls back to the interface face rather than
   * inventing a display face for it.
   */
  design?: ProjectDesign;
  /**
   * Published in the current runtime only, with media prepared locally and
   * never uploaded. Presentation uses this to say so rather than implying the
   * work is stored.
   */
  sessionOnly?: boolean;
};

/** Owner-only per-project arrangement inside a category. */
export type ProjectArrangement = {
  projectOrder: Id[];
  hiddenProjectIds: Id[];
  /**
   * Work the owner has pinned to the top of the category index. Unlike hiding,
   * this is not a privacy state: a pinned project is published work whose
   * position the owner has fixed, so visitors see the same grouping.
   */
  pinnedProjectIds: Id[];
};

/* ── Discovery ──────────────────────────────────────────────────────────── */

/**
 * How a project is attributed. Always resolved from the profile that owns the
 * canonical project — never stored alongside the project, so attribution cannot
 * drift between the feed, search, and the profile.
 */
export type FeedCreator = {
  id: Id;
  name: string;
  kind: string;
  /** The image chosen on the creator's canonical profile. */
  avatar: string;
  /** Creator-declared city. It qualifies work for Portalink location views. */
  location?: string;
  /** Public discovery must never infer this from missing data. */
  isPrivate?: boolean;
};

/**
 * A canonical project together with the profile that owns it.
 *
 * This is the ONLY project shape discovery, search, and detail hand to the UI.
 * There is no separate feed record: every field here comes from the canonical
 * `Project` and its owning profile, so the same work reads identically wherever
 * it is surfaced.
 */
export type ProjectView = {
  project: Project;
  creator: FeedCreator;
};

/**
 * Where a project lives in the portfolio it belongs to.
 *
 * A project's canonical address is its owning profile and category, so any
 * surface that already holds a resolved `ProjectView` can hand these along and
 * open the work directly at that address — no second lookup, and no second kind
 * of project page. Derived entirely from the canonical record; nothing here is
 * stored or invented.
 */
export type ProjectLocation = {
  profileId: Id;
  categoryId: Id;
};

/**
 * A discovery slot. Curation owns the ordering and which work is surfaced; it
 * owns no project metadata whatsoever.
 */
export type FeedCurationEntry = {
  profileId: Id;
  projectId: Id;
};
export type SearchResultKind = 'profile' | 'project' | 'location';
export type SearchResult = {
  id: Id;
  kind: SearchResultKind;
  title: string;
  subtitle?: string;
  /** Present when this result represents a creator profile. */
  avatar?: string;
};

/* ── Social ─────────────────────────────────────────────────────────────── */

export type FollowState = {
  profileId: Id;
  isFollowing: boolean;
  /**
   * A follow of a PRIVATE profile is a request, not an edge: it waits for the
   * creator to approve it. This reports that the viewer has asked and is
   * waiting — it is never true at the same time as `isFollowing`, because a
   * granted request stops being a request.
   */
  isRequested: boolean;
  followerCount?: number;
};
/**
 * One pending request to follow the viewer's own profile, resolved to the
 * requester's public identity so a list can be read without a second lookup.
 * Only the creator being asked may read these.
 */
export type FollowRequest = {
  /** The profile that asked. Its canonical id, so it can be opened. */
  profileId: Id;
  name: string;
  handle: string;
  initials: string;
  avatar: string;
};
/**
 * Engagement — like, save, repost — lives in `types/engagement.ts`, together with
 * its service contract. `ActivityKind` and `ActivityItem` used to be declared here
 * as a parallel vocabulary for the same three facts (with `bookmark` where the
 * engagement domain says `save`), and have been removed so there is one name per
 * fact.
 */
export type Notification = {
  id: Id;
  body: string;
  timestamp: string;
  isUnread: boolean;
  kind?: 'message' | 'reply' | 'follow' | 'system' | 'citation';
  targetPath?: string | null;
  actorProfileId?: Id | null;
};

/* ── Live / locations ───────────────────────────────────────────────────── */

/** A location-bound live session, as surfaced by Portalink. */
export type LiveSession = {
  id: Id;
  /** Stable location id; the visible city name is not an identifier. */
  locationId: Id;
  title: string;
  hostName: string;
  isLive: boolean;
};
/**
 * What joining a session actually gets you. The implementation answers, so the UI
 * never implies audio, presence, or membership that survives a reload when none of
 * that exists.
 */
export type LiveCapability = {
  /** True only when there is a real stream or realtime connection. */
  isRealtime: boolean;
  /** True only when membership outlives the browser session. */
  isDurable: boolean;
  /** What joining does in this implementation, in its own words. */
  reason?: string;
};
export type Location = {
  id: Id;
  name: string;
  countryCode: string;
  timeZone: string;
  /** Real stored coordinates, used to orient the city's globe. */
  latitude: number;
  longitude: number;
  /**
   * Location identity accent, resolved from the id via `getCityAccentToken`.
   * Identity only — never status. Optional so a location without a mapping
   * renders on the neutral fallback token.
   */
  accentToken?: string;
};

/* ── Commerce ───────────────────────────────────────────────────────────── */

export type Product = {
  id: Id;
  title: string;
  creatorName: string;
  price?: string;
  media: ProjectMedia;
};

/* ── Analytics ──────────────────────────────────────────────────────────── */

export type MetricTrendPoint = {
  label: string;
  value: number;
};
export type MetricDelta = {
  /** Signed, pre-formatted for display, e.g. "+18%". */
  value: string;
  direction: 'up' | 'down' | 'flat';
};
export type CreatorAnalytics = {
  profileId: Id;
  periodLabel: string;
  headlineGazeHours: number;
  kpiIds: Id[];
};

/* ── Studio's generative actions ────────────────────────────────────────── */

/**
 * Whether generation can actually run. Same shape as the upload and deletion
 * capabilities: the implementation answers, because only it knows what backend it
 * has, and it supplies the sentence explaining the answer.
 */
export type GenerativeCapability = {
  isAvailable: boolean;
  reason?: string;
};
/**
 * What a generative request actually did. `didGenerate` is the only claim that
 * matters, and a prototype must report false: an action that resolves silently is
 * indistinguishable from one that produced work, which is the failure this type
 * exists to prevent.
 */
export type GenerationOutcome = {
  /** True only when a backend genuinely produced output. */
  didGenerate: boolean;
  /** True only when stored content was created or modified. */
  changedContent: boolean;
  /** What happened, in the implementation's own words. */
  message: string;
};

/* ── Appearance ─────────────────────────────────────────────────────────── */

export type AppearanceMode = 'light' | 'dark' | 'auto';
export type AppearancePreferences = {
  mode: AppearanceMode;
  accentColor: string;
  highContrast: boolean;
  reduceTranslucency: boolean;
};

/* ── Async contract shared by every server-backed action ────────────────── */

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';
