/**
 * The engineering boundary.
 *
 * Every interface below is something the UI needs and the prototype currently
 * fakes. Replace each `Mock*` implementation in `services/mocks` with an
 * `Api*` implementation; no component should need to change.
 *
 * Rules of the boundary:
 *  - Everything is async, even where the mock resolves instantly.
 *  - Arguments and results use the domain models in `types/domain.ts`.
 *  - Identifiers are stable ids, never visible labels.
 *  - Services never touch React state or the DOM.
 */

import type { AppearancePreferences, CategoryDeletionCapability, CreateCategoryInput, CreatorAnalytics, FeedCreator, FollowRequest, FollowState, GenerationOutcome, GenerativeCapability, Id, LiveCapability, LiveSession, Location, Notification, PortfolioArrangement, PortfolioCategory, Product, Profile, Project, ProjectArrangement, ProjectDesign, ProjectView, SearchResult, UpdateProfileInput } from '../types/domain';
import type { AssetProcessingStatus, DeleteProjectResult, DraftMetadata, ProcessingCapability, ProjectDraft, PublishProjectInput, PublishResult, StartUploadInput, UpdateProjectInput, UpdateProjectResult, UploadCapability, UploadOperation, UploadOutcome } from '../types/publishing';
import type { EngagementKind, EngagementMutation, ProjectEngagement } from '../types/engagement';
import type { Comment, ProjectComments } from '../types/comments';
import type { AccountDeletionCapability, AccountSecurityCapability, AccountSecurityState, AuthRecoverySession, AuthSession, ChangeEmailInput, ChangeEmailResult, ChangePasswordInput, ChangePasswordResult, DeleteAccountInput, DeleteAccountResult, PasswordResetRequestInput, PasswordResetRequestResult, ResendVerificationInput, ResendVerificationResult, SignInInput, SignUpInput, SignUpResult, UpdatePasswordInput } from '../types/auth';
import type { CreateProfileInput, CreateProfileResult, HandleAvailability } from '../types/profile';
import type { GeographicBounds, GeographicLod, GeographicResult } from '../types/geography';
import type { DiscoverSections, DiscoverySignalKind, ExplorationMode, HomeDiscovery, HomeFeedMode } from '../types/discovery';
import type { ReportingPeriodId } from '../data/studioAnalytics';
import type { ConversationPage, ConversationSummary, DirectMessage, MessageCursor, MessagePage, MessageParticipant, MessageReaction, MessagingPreferences } from '../types/messages';
import type { SaveInsights } from '../types/creatorSaves';

/**
 * Authentication. The dependency direction is
 * `UI → useAuth() → AuthService → implementation`, so a future
 * `SupabaseAuthService` is a one-line swap in `services/index.ts`.
 *
 * Every method either resolves with a domain model from `types/auth.ts` or
 * throws an `AuthServiceError` carrying a branchable code. Nothing here returns
 * or accepts a token: session handling belongs to the implementation.
 */
export interface AuthService {
  /** The session as it stands right now, or null when signed out. */
  getSession(): Promise<AuthSession | null>;
  /** Subscribe to session changes. Returns its own unsubscribe. */
  onAuthStateChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(input: SignInInput): Promise<AuthSession>;
  /** Never returns a session when the address must be confirmed first. */
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signOut(): Promise<void>;
  requestPasswordReset(input: PasswordResetRequestInput): Promise<PasswordResetRequestResult>;
  /** The context a recovery link establishes, or null if it is missing/expired. */
  getRecoverySession(): Promise<AuthRecoverySession | null>;
  updatePassword(input: UpdatePasswordInput): Promise<void>;
  /**
   * Links a newly created profile to the signed-in account and returns the
   * refreshed session. In production the profile row references the auth user,
   * and this re-reads the session rather than mutating it client-side.
   */
  attachProfile(profileId: Id): Promise<AuthSession>;
  /**
   * What deletion would remove, and whether this implementation can perform it
   * at all. Read before any destructive UI is offered, so the product never
   * presents a delete control that cannot do what it claims.
   */
  getAccountDeletionCapability(): Promise<AccountDeletionCapability>;
  /**
   * Requests reversible deletion with a 48-hour grace period. Never signs out
   * or reports an immediate deletion. Permanent cleanup is a separate worker.
   *
   * Throws `AuthServiceError` with `confirmation_mismatch` when the typed
   * confirmation does not match, or `deletion_unavailable` when no backend can
   * carry it out. Never resolves with `isDeleted: true` unless an account was
   * genuinely removed.
   */
  deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult>;
  getAccountDeletionStatus?(): Promise<DeleteAccountResult | null>;
  cancelAccountDeletion?(): Promise<DeleteAccountResult>;
  /**
   * What this implementation can actually do to an authenticated account's
   * credentials. Read before any security control is offered, so the product never
   * presents a change-password or change-email action it cannot carry out.
   */
  getAccountSecurityCapability(): Promise<AccountSecurityCapability>;
  /**
   * The credential state of the signed-in account: its confirmed address, whether
   * that address is verified, any email change still awaiting confirmation, and
   * whether the identity has a password at all.
   *
   * Read as one snapshot rather than assembled by the UI, so the confirmed and
   * pending addresses can never disagree.
   */
  getAccountSecurityState(): Promise<AccountSecurityState>;
  /**
   * Changes the password of the signed-in account. The CURRENT password is
   * verified here — never by the client, which cannot prove a credential.
   *
   * Throws `AuthServiceError` with `invalid_credentials` when the current password
   * is wrong, `weak_password`, `same_password`, `reauthentication_required` when
   * the session is too old for a sensitive operation, `rate_limited`, or
   * `unsupported` for an identity with no password. Resolves with
   * `isChanged: false` only when a real implementation genuinely made no change.
   */
  changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult>;
  /**
   * Requests a new email address for the signed-in account.
   *
   * MUST NOT report the new address as confirmed when verification is outstanding:
   * resolve with `status: 'pending'` so the caller can show it separately and leave
   * the authoritative address alone. Throws `invalid_email`, `email_taken`,
   * `reauthentication_required`, or `rate_limited`.
   */
  requestEmailChange(input: ChangeEmailInput): Promise<ChangeEmailResult>;
  /**
   * Resends confirmation mail for the account's own address or for a pending
   * change. `status: 'sent'` asserts that mail genuinely left, so an
   * implementation without delivery must answer `'unavailable'` instead.
   */
  resendVerification(input: ResendVerificationInput): Promise<ResendVerificationResult>;
}

/**
 * Profiles — public creator identity. Profile CREATION lives here rather than
 * in a parallel onboarding layer, so onboarding and later profile editing share
 * one model, one validation vocabulary, and one service boundary.
 */
export interface ProfileService {
  /**
   * Rejects when the id names no profile. Absence must be an error rather than a
   * substituted record: a caller resolving a creator by id has to be able to
   * distinguish "no such profile" from a profile it can open.
   */
  getProfile(profileId: Id): Promise<Profile>;
  /** The profile owned by an account, or null when it has not been created yet. */
  getProfileForAccount(accountId: Id): Promise<Profile | null>;
  listProfiles(): Promise<Profile[]>;
  /**
   * Usability check only. Authoritative uniqueness belongs to the database, so
   * `createProfile` must still be able to reject with `handle_taken`.
   */
  checkHandleAvailability(handle: string): Promise<HandleAvailability>;
  /** Establishes the initial profile for an account. Throws `ProfileServiceError`. */
  createProfile(accountId: Id, input: CreateProfileInput): Promise<CreateProfileResult>;
  updateProfile(profileId: Id, input: UpdateProfileInput): Promise<Profile>;
  /** Owner-only: category order, hidden categories, chosen icons. */
  getPortfolioArrangement(profileId: Id): Promise<PortfolioArrangement>;
  savePortfolioArrangement(profileId: Id, arrangement: PortfolioArrangement): Promise<void>;
  /** Owner-only. Throws `CategoryMutationError`. */
  createCategory(profileId: Id, input: CreateCategoryInput): Promise<PortfolioCategory>;
  renameCategory(profileId: Id, categoryId: Id, label: string): Promise<PortfolioCategory>;
  setCategoryIcon(profileId: Id, categoryId: Id, iconName: string): Promise<PortfolioCategory>;
  /**
   * Asked BEFORE offering deletion, so the answer about the creator's work comes
   * from the store rather than being guessed by the UI.
   */
  getCategoryDeletionCapability(profileId: Id, categoryId: Id): Promise<CategoryDeletionCapability>;
  /**
   * Removes a category. Must never delete or orphan the projects filed under it:
   * an implementation that cannot move them rejects with `category_not_empty`
   * rather than destroying work or leaving it pointing at a missing category.
   */
  deleteCategory(profileId: Id, categoryId: Id): Promise<void>;
}
export interface ProjectService {
  getProject(projectId: Id): Promise<Project>;
  /**
   * The canonical project plus the profile that owns it — the shape every
   * surface uses to present a piece of work. Attribution is resolved here so no
   * caller ever carries its own copy of it.
   */
  getProjectView(projectId: Id): Promise<ProjectView>;
  /**
   * Resolves several projects by id, in the order asked for. Ids that no longer
   * name a project are omitted rather than substituted, so a stale curation
   * entry can never surface invented work.
   */
  listProjectViews(projectIds: Id[]): Promise<ProjectView[]>;
  listProjects(profileId: Id, categoryId?: Id): Promise<Project[]>;
  /* ── Project design settings ─────────────────────────────────────────── */
  /**
   * The presentation settings a project carries. Typography is a property of the
   * work, so it is read from the record rather than held in component state where
   * two surfaces could disagree about the same project's face.
   */
  getProjectDesign(projectId: Id): Promise<ProjectDesign>;
  /**
   * Several projects at once, keyed by id — a category index needs every row's
   * face, and asking per row would be one request per project.
   */
  listProjectDesigns(projectIds: Id[]): Promise<Record<Id, ProjectDesign>>;
  /**
   * Owner-only. Rejects a face the product does not offer, so an unknown id can
   * never be written to a project and silently fall back at render time.
   */
  updateProjectDesign(projectId: Id, design: ProjectDesign): Promise<ProjectDesign>;
  /** Owner-only order for the project cards on the profile overview. */
  saveProfileProjectOrder(profileId: Id, projectIds: Id[]): Promise<void>;
  getProjectArrangement(profileId: Id, categoryId: Id): Promise<ProjectArrangement>;
  saveProjectArrangement(profileId: Id, categoryId: Id, arrangement: ProjectArrangement): Promise<void>;
  /** "Upload work" / "Add document": no storage backend exists yet. */
  uploadProjectMedia(profileId: Id, categoryId: Id, files: File[]): Promise<Project>;
  /* ── Publishing ──────────────────────────────────────────────────────── */
  /** Starts an unpublished draft inside a category the account owns. */
  createDraft(profileId: Id, categoryId: Id): Promise<ProjectDraft>;
  updateDraft(draftId: Id, metadata: DraftMetadata): Promise<ProjectDraft>;
  discardDraft(draftId: Id): Promise<void>;
  /**
   * Publishes a draft. Media is still local, so the result reports
   * `mediaPersisted: false` until a storage backend exists. Throws
   * `PublishServiceError`.
   */
  publishProject(input: PublishProjectInput): Promise<PublishResult>;
  /* ── Published-project lifecycle ─────────────────────────────────────── */
  /**
   * Updates an ALREADY-PUBLISHED project: its public metadata, its attachment
   * titles, their order, and which one is the cover. The same canonical record —
   * there is no separate "editable project".
   *
   * Two rules an implementation must honour:
   *
   * 1. **The update commits first.** Attachments absent from `input.attachments`
   *    are removed from the record, and only then may their stored objects be
   *    cleaned up — behind this boundary. A failed update must leave the currently
   *    published project and every file it uses completely intact.
   * 2. **Authorization is real.** Owner-only controls in the UI are UX; this
   *    method must independently refuse a caller who does not own the project,
   *    with `permission_denied`.
   *
   * Throws `ProjectMutationError` (`not_found`, `permission_denied`,
   * `invalid_metadata`, `invalid_media`, `conflict`, `network`).
   */
  updateProject(input: UpdateProjectInput): Promise<UpdateProjectResult>;
  /**
   * Deletes a published project. Resolves ONLY once the record is genuinely gone,
   * so nothing may be removed from the UI before this returns. `storageDeleted`
   * reports whether the stored objects were actually removed, so an implementation
   * that cannot reach storage cannot imply that it did.
   *
   * Throws `ProjectMutationError`.
   */
  deleteProject(projectId: Id, options?: {
    profileId?: Id;
    expectedRevision?: string;
  }): Promise<DeleteProjectResult>;
}

/**
 * The media transport boundary, declared now so presentation never learns
 * about storage. A future `SupabaseMediaService` implements upload with
 * progress, cancellation, retry, and deletion behind exactly this interface;
 * the prototype only answers that uploading is unavailable.
 */
export interface MediaService {
  /**
   * Whether bytes can actually be persisted right now. The caller must not enter
   * any uploading state when this reports unavailable.
   */
  getUploadCapability(): Promise<UploadCapability>;
  /**
   * Begins an upload and returns the LIVE operation: its id, available while the
   * transfer is running, plus a promise that settles when it ends. The id is
   * deliberately not deferred to the result — an id that arrives with the outcome
   * cannot cancel the thing that produced it.
   *
   * Rejects with `UploadServiceError` (code `unavailable`) when no storage backend
   * is connected. Progress is emitted only from real transport events.
   */
  startUpload(input: StartUploadInput): Promise<UploadOperation>;
  /**
   * Requests cancellation and resolves only once the transport has CONFIRMED it,
   * reporting anything that landed first so the caller can clean it up. The
   * operation's own `completion` also settles as `cancelled`.
   */
  cancelUpload(uploadId: Id): Promise<UploadOutcome>;
  /**
   * Removes a persisted object by the id the service issued in `PersistedMedia`.
   * Only ever called for objects with a real `storagePath`; a local object URL is
   * not storage and is never passed here. Rejects while nothing has been stored.
   */
  deleteMedia(objectId: Id): Promise<void>;
  /**
   * Whether a server-side processing pipeline exists, and whether a failed job can
   * be re-run. Asked before any processing state is presented, so the product
   * never implies a conversion service it does not have.
   */
  getProcessingCapability(): Promise<ProcessingCapability>;
  /**
   * Re-queries the processing state of already-persisted assets, by the stable
   * object ids issued in `PersistedMedia`. This is the ONLY way a `processing`
   * asset becomes `ready`: no implementation may advance a state on a timer, and
   * the product never assumes a job finished because time passed.
   *
   * Returns an entry only for ids it recognises; an unknown id is simply absent
   * rather than reported as ready. Rejects with `ProcessingServiceError`.
   */
  getProcessingStatus(objectIds: Id[]): Promise<AssetProcessingStatus[]>;
  /**
   * Re-runs the processing job for ONE stored object. Distinct from re-uploading:
   * the bytes are already in storage, so nothing is sent again. Resolves with the
   * state the job is in after being queued — usually `processing`, never `ready`
   * unless the service genuinely finished. Rejects with `ProcessingServiceError`
   * (`unavailable` when there is no pipeline, `not_found` for an unknown object).
   */
  retryProcessing(objectId: Id): Promise<AssetProcessingStatus>;
}
/**
 * Discovery owns ranking and curation, never project metadata. It returns
 * canonical `ProjectView`s resolved through `ProjectService`, so the feed cannot
 * disagree with a profile about the same work.
 */
export interface DiscoveryService {
  /** One coherent Home snapshot: ranking, hero, and the sphere that produced it. */
  getHomeDiscovery(): Promise<HomeDiscovery>;
  /** Persists an understandable Home objective, never raw scoring weights. */
  setHomeFeedMode(mode: HomeFeedMode): Promise<HomeDiscovery>;
  /** Bounded, separately ranked Discover zones. */
  getDiscoverSections(mode: ExplorationMode): Promise<DiscoverSections>;
  /** Only an explicit "show me more" action writes a discovery signal. */
  recordProjectSignal(projectId: Id, kind: DiscoverySignalKind): Promise<void>;
  /** Null when the curated hero no longer names a canonical project. */
  getFeaturedProject(): Promise<ProjectView | null>;
  listFeedProjects(): Promise<ProjectView[]>;
  /**
   * Public work whose creator explicitly chose the requested Portalink city.
   * Project prose and the viewer's Home relationships never qualify this list.
   */
  listLocationProjects(locationId: Id): Promise<ProjectView[]>;
  listAccountsToExplore(): Promise<FeedCreator[]>;
}
export interface SearchService {
  search(query: string): Promise<SearchResult[]>;
}
/**
 * The follow graph.
 *
 * Implementation contract, and the reason each rule is here rather than in the UI:
 *
 * 1. **Follows are keyed by ACCOUNT.** The follower is the verified viewer, taken
 *    from the session and never from an argument, so one account's follows are
 *    never visible to another.
 * 2. **`getFollowState` is readable by a guest** and answers `isFollowing: false`.
 *    Whether a creator can be followed is public; the answer for someone with no
 *    account is simply "you do not".
 * 3. **`followProfile` / `unfollowProfile` refuse an unauthenticated call** with
 *    `SocialServiceError('unauthenticated', …)`. The UI's sign-in gate is UX and
 *    must not be what makes this safe.
 * 4. **The target must exist**, or the call fails `not_found` — a follow edge
 *    pointing at nothing is worse than a refusal.
 * 5. **Nobody follows themselves.** That is refused with `permission_denied` at
 *    this boundary, not merely hidden by a component that declines to render a
 *    button.
 * 6. **Every method returns the resulting state**, so the UI never has to assume
 *    what a mutation did.
 * 7. **A PRIVATE profile is followed by request.** `followProfile` records a
 *    pending request and answers `isFollowing: false, isRequested: true` rather
 *    than creating the edge; only the creator's approval grants it. Whether a
 *    follow is immediate or a request is decided HERE, from the target's own
 *    visibility — a client must never infer it, or a private profile reached
 *    through a stale record would be followed outright.
 * 8. **A pending request can be withdrawn** with `cancelFollowRequest`, which
 *    returns the profile to `isFollowing: false, isRequested: false`. It refuses
 *    `not_found` when there is no request to withdraw, rather than silently
 *    reporting success for something that never happened.
 * 9. **Incoming requests are readable only by the creator being asked.**
 *    `listFollowRequests` takes no argument: the profile is the verified
 *    viewer's own, taken from the session, so one creator can never enumerate
 *    another's pending requests. It refuses `unauthenticated` for a guest.
 * 10. **Approving grants the edge; declining grants nothing.** Both consume the
 *    request, so it cannot be acted on twice, and both refuse `not_found` when
 *    no such request is pending. Each returns the requests that REMAIN, so the
 *    UI never has to compute the new count itself.
 */
export interface SocialService {
  /** Confirmed connections only; the service enforces who can read the list. */
  listProfileConnections(profileId: Id, kind: import('../types/social').ProfileConnectionKind, offset?: number): Promise<import('../types/social').ProfileConnectionPage>;
  getFollowState(profileId: Id): Promise<FollowState>;
  followProfile(profileId: Id): Promise<FollowState>;
  unfollowProfile(profileId: Id): Promise<FollowState>;
  cancelFollowRequest(profileId: Id): Promise<FollowState>;
  /** Pending requests to follow the SIGNED-IN viewer's own profile. */
  listFollowRequests(): Promise<FollowRequest[]>;
  /** `requesterProfileId` is the profile that asked. Returns what remains. */
  approveFollowRequest(requesterProfileId: Id): Promise<FollowRequest[]>;
  declineFollowRequest(requesterProfileId: Id): Promise<FollowRequest[]>;
}
/**
 * Comments and replies on a project.
 *
 * Implementation contract:
 *
 * 1. **Reading is public.** `listComments` is open to guests, because a comment on
 *    a published project is published too. `canDelete` is resolved per viewer and
 *    is false for everyone who did not write the comment.
 * 2. **Writing and deleting are authenticated, enforced HERE.** The UI's sign-in
 *    gate is UX; an unauthenticated call must be refused with `unauthenticated`.
 * 3. **The target must exist, and a reply names BOTH its project and its parent.**
 *    `createReply` takes the project id explicitly rather than inferring it from
 *    the parent, so the caller states which conversation it believes it is writing
 *    into and the service can disagree. It verifies the project exists, the parent
 *    exists, and the parent belongs to exactly that project — otherwise
 *    `not_found`. That last check is what catches a reply composed against a stale
 *    list: a comment deleted, or a viewer who has since moved to another project.
 * 4. **Only the author may delete their own comment.** Anything else is
 *    `permission_denied`. Broader moderation is not part of this contract.
 * 5. **Bodies are validated independently** of the client, with `validation`.
 * 6. **Author identity is resolved on read** from the canonical profile, never
 *    frozen onto the comment, so a renamed author reads correctly everywhere.
 */
export interface CommentService {
  listComments(projectId: Id): Promise<ProjectComments>;
  createComment(projectId: Id, body: string): Promise<Comment>;
  createReply(projectId: Id, parentCommentId: Id, body: string): Promise<Comment>;
  deleteComment(commentId: Id): Promise<void>;
}

/**
 * Project engagement: like, save, repost.
 *
 * This is the ONE authority on those facts. An earlier `ActivityService` also
 * claimed them — a second contract over the same domain, which could only ever
 * disagree with this one — and has been removed rather than left beside it.
 *
 * Every method RETURNS the project's full engagement as the service sees it, so
 * the UI never has to assume what a mutation did — the confirmed record replaces
 * the optimistic one, including counts.
 *
 * Implementation contract:
 *
 * 1. **Reads are viewer-scoped, and state is keyed by ACCOUNT.** The viewer's
 *    identity comes from the verified session, never from an argument, and one
 *    account's engagement is never visible to another. For a guest, every `is*`
 *    flag on a project read is false — that is a truthful answer, not an error.
 * 2. **`listEngagedProjectIds` REJECTS a guest** with `unauthenticated`. An
 *    activity collection is private account data, and there is no such thing as a
 *    guest's collection; answering `[]` would read as "you have engaged with
 *    nothing", which is a different and misleading claim.
 * 3. **Mutations are authenticated, and this is where that is enforced.** The UI's
 *    sign-in gate is UX and must not be relied on: `setEngagement` independently
 *    refuses an unauthenticated call with `unauthenticated`.
 * 4. **`setEngagement` is idempotent.** Asking for a state the viewer is already
 *    in must succeed without double-counting.
 * 5. **A count that cannot be reported is `null`, never `0`.**
 */
export interface EngagementService {
  getProjectEngagement(projectId: Id): Promise<ProjectEngagement>;
  /** One read for many projects, so a feed does not issue one request per card. */
  getProjectEngagements(projectIds: Id[]): Promise<ProjectEngagement[]>;
  setEngagement(mutation: EngagementMutation): Promise<ProjectEngagement>;
  /** The projects the viewer has engaged with, for their own activity surfaces. */
  listEngagedProjectIds(kind: EngagementKind): Promise<Id[]>;
}
export interface NotificationService {
  listNotifications(): Promise<Notification[]>;
  markRead(notificationId: Id): Promise<void>;
  markAllRead(): Promise<void>;
  subscribeToNotifications(onChange: () => void): () => void;
}
/** Private bookmarks; identity comes from the session, never an argument. */
export interface CreatorSaveService {
  getCreatorSave(profileId: Id): Promise<boolean>;
  setCreatorSave(profileId: Id, saved: boolean): Promise<boolean>;
  listSavedCreatorIds(): Promise<Id[]>;
  getSaveInsights(): Promise<SaveInsights>;
}
/** Private, durable one-to-one conversations between creator profiles. */
export interface MessagingService {
  listConversations(options?: { offset?: number; limit?: number }): Promise<ConversationPage>;
  getConversation(conversationId: Id): Promise<ConversationSummary>;
  getOrCreateConversation(otherProfileId: Id): Promise<ConversationSummary>;
  listMessages(conversationId: Id, options?: { before?: MessageCursor | null; limit?: number }): Promise<MessagePage>;
  searchConversations(query: string, options?: { limit?: number }): Promise<ConversationSummary[]>;
  /** Empty queries list people the viewer follows; name/username searches include other visible profiles. */
  searchRecipients(query: string, options?: { offset?: number; limit?: number }): Promise<MessageParticipant[]>;
  sendMessage(conversationId: Id, body: string, attachments?: File[]): Promise<DirectMessage>;
  editMessage(messageId: Id, body: string): Promise<DirectMessage>;
  deleteMessage(messageId: Id): Promise<void>;
  toggleReaction(messageId: Id, emoji: string): Promise<MessageReaction[]>;
  /** Marks only messages through the supplied server-authored timestamp as read. */
  markConversationRead(conversationId: Id, throughCreatedAt: string): Promise<void>;
  /** Supabase Realtime when available; callers retain a refresh fallback. */
  subscribeToMessages(conversationId: Id, onMessage: (message: DirectMessage) => void, onStatus?: (connected: boolean) => void, onRefresh?: () => void): () => void;
  subscribeToConversationChanges(onChange: () => void): () => void;
  subscribeToTyping(conversationId: Id, onTyping: (profileId: Id, isTyping: boolean) => void): () => void;
  broadcastTyping(conversationId: Id, profileId: Id, isTyping: boolean): void;
  getPreferences(): Promise<MessagingPreferences>;
  updatePreferences(preferences: MessagingPreferences): Promise<MessagingPreferences>;
  acceptRequest(conversationId: Id): Promise<ConversationSummary>;
  /** Removes an incoming request from this inbox without deleting the sender's copy. */
  deleteRequest(conversationId: Id): Promise<void>;
  setMuted(conversationId: Id, muted: boolean): Promise<void>;
  archiveConversation(conversationId: Id): Promise<void>;
  blockParticipant(conversationId: Id): Promise<void>;
  listBlockedPeople(): Promise<import('../types/messages').BlockedPerson[]>;
  unblockParticipant(profileId: Id): Promise<void>;
  reportConversation(conversationId: Id, reason: string): Promise<void>;
}
export interface LiveService {
  listLocations(): Promise<Location[]>;
  /** Omit the location to list every session the network is carrying. */
  listSessions(locationId?: Id): Promise<LiveSession[]>;
  /** What joining actually does here, asked before a session is offered. */
  getLiveCapability(): Promise<LiveCapability>;
  /**
   * RETURNS the joined session rather than resolving void, so membership is only
   * ever claimed on the service's own answer.
   */
  joinSession(sessionId: Id): Promise<LiveSession>;
  leaveSession(sessionId: Id): Promise<void>;
}
export interface AnalyticsService {
  /** The reporting window is a query parameter, not a client-side filter. */
  getCreatorAnalytics(profileId: Id, periodId?: ReportingPeriodId): Promise<CreatorAnalytics>;
  /**
   * Whether generation can run at all. Asked before an action is offered, so the
   * UI never presents a generative control as though it will produce work.
   */
  getGenerativeCapability(): Promise<GenerativeCapability>;
  /**
   * Studio's generative actions. Each RETURNS what it did rather than resolving
   * void: a void promise cannot distinguish "generated" from "did nothing", which
   * is exactly how a prototype ends up claiming output it never produced.
   */
  requestLayoutRevision(projectId: Id): Promise<GenerationOutcome>;
  simulateDraft(files: File[]): Promise<GenerationOutcome>;
  synthesizeCrossMedia(projectIds: Id[]): Promise<GenerationOutcome>;
}
export interface CommerceService {
  getProduct(productId: Id): Promise<Product>;
}

/**
 * The globe's data boundary. Today the dataset is local and small, so the globe
 * renders from `readLocalGeography()` synchronously. `getVisibleGeography` is the
 * shape a spatial service, vector-tile source, or server-side clustering
 * endpoint should implement — swapping it must not change the globe's visuals or
 * its navigation contract.
 */
export interface GeographyService {
  readLocalGeography(): GeographicResult;
  getVisibleGeography(bounds: GeographicBounds, lod: GeographicLod): Promise<GeographicResult>;
}

/** Appearance is the one service already persisted locally, by design. */
export interface PreferencesService {
  readAppearance(): AppearancePreferences;
  writeAppearance(preferences: Partial<AppearancePreferences>): void;
}

/** The single registry components resolve services from. */
export type Services = {
  // `auth` is the only authority on who is signed in.
  auth: AuthService;
  profiles: ProfileService;
  projects: ProjectService;
  media: MediaService;
  discovery: DiscoveryService;
  search: SearchService;
  social: SocialService;
  engagement: EngagementService;
  creatorSaves: CreatorSaveService;
  comments: CommentService;
  notifications: NotificationService;
  messaging: MessagingService;
  live: LiveService;
  analytics: AnalyticsService;
  commerce: CommerceService;
  geography: GeographyService;
  preferences: PreferencesService;
};
