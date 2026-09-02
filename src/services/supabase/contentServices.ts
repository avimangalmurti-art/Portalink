import type {
  DiscoveryService,
  ProfileService,
  ProjectService,
  SearchService,
} from '../interfaces';
import type {
  CategoryFormat,
  FeedCreator,
  Profile,
  ProfileLink,
  ProfileStat,
  Project,
  ProjectAttachment,
  ProjectDesign,
  ProjectView,
} from '../../types/domain';
import type {
  CreateProfileInput,
  CreateProfileResult,
  HandleAvailability,
} from '../../types/profile';
import {
  CategoryMutationError,
  ProfileServiceError,
} from '../../types/profile';
import type {
  DeleteProjectResult,
  ProjectDraft,
  PublishProjectInput,
  PublishResult,
  UpdateProjectInput,
  UpdateProjectResult,
} from '../../types/publishing';
import { ProjectMutationError, PublishServiceError } from '../../types/publishing';
import { typefaces } from '../../data/typefaces';
import { MAX_PAGES_PER_ROW, MIN_PAGES_PER_ROW } from '../../features/projects/pageLayout';
import { cities } from '../../data/cities';
import { getCountryCode } from '../../data/countryCodes';
import { toLocationId } from '../../utils/location';
import type { DiscoverySignal, ExplorationMode, GeographicScope, HomeFeedMode, ProjectRelevance } from '../../types/discovery';
import {
  buildUserContentSphere,
  deriveProjectRelevance,
  parseExplicitLocationIntent,
  projectRelevanceForPersistence,
  rankDiscoverProjects,
  rankHomeProjects,
} from '../../domain/discovery/ranking';
import { creatorLocationMatches } from '../../domain/contentPlacement';
import { requireSupabase } from './client';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';

export const PROJECT_MEDIA_BUCKET = 'project-media';
export const AVATAR_BUCKET = 'avatars';
const SIGNED_URL_SECONDS = 60 * 60 * 6;

type ProfileRow = {
  id: string;
  account_id: string;
  name: string;
  handle: string;
  headline: string;
  location: string;
  avatar_url: string;
  nav_heading: string;
  stats: unknown;
  social_links: unknown;
  links: unknown;
  is_private: boolean;
};

type CategoryRow = {
  id: string;
  profile_id: string;
  label: string;
  icon_name: string;
  format: string;
  blurb: string;
  position: number;
  is_hidden: boolean;
};

type ProjectRow = {
  id: string;
  profile_id: string;
  category_id: string;
  title: string;
  summary: string;
  design: unknown;
  position: number;
  is_hidden: boolean;
  is_pinned: boolean;
  published_at: string;
  revision: string;
  topic_keys?: string[];
  content_location?: string;
  geographic_scope?: string;
  geography_confidence?: number;
};

type AttachmentRow = {
  id: string;
  project_id: string;
  kind: string;
  file_name: string;
  display_name: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  type_label: string;
  storage_path: string;
  status: string;
  is_cover: boolean;
  position: number;
  metadata: unknown;
};

type DraftRow = {
  id: string;
  profile_id: string;
  category_id: string;
  title: string;
  summary: string;
  created_at: string;
};

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'TP';
}

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, '');
}

function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'upload';
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function asStats(value: unknown): ProfileStat[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ProfileStat =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as { label?: unknown }).label === 'string' &&
      typeof (item as { value?: unknown }).value === 'string',
  );
}

function asLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ProfileLink =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as { label?: unknown }).label === 'string' &&
      typeof (item as { href?: unknown }).href === 'string',
  );
}

function renderedPagePaths(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const pages = (value as { renderedPages?: unknown }).renderedPages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    if (!page || typeof page !== 'object' || Array.isArray(page)) return [];
    const path = (page as { storagePath?: unknown }).storagePath;
    return typeof path === 'string' && path ? [path] : [];
  });
}

function asMetadata(value: unknown, urls: Map<string, string>): ProjectAttachment['metadata'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as {
    durationSeconds?: unknown;
    pageCount?: unknown;
    widthPixels?: unknown;
    heightPixels?: unknown;
    aspectRatio?: unknown;
    processingError?: unknown;
    failedPage?: unknown;
    coverFrame?: unknown;
    renderedPages?: unknown;
  };
  const metadata: NonNullable<ProjectAttachment['metadata']> = {};
  if (typeof candidate.durationSeconds === 'number') metadata.durationSeconds = candidate.durationSeconds;
  if (typeof candidate.pageCount === 'number') metadata.pageCount = candidate.pageCount;
  if (typeof candidate.widthPixels === 'number') metadata.widthPixels = candidate.widthPixels;
  if (typeof candidate.heightPixels === 'number') metadata.heightPixels = candidate.heightPixels;
  if (typeof candidate.aspectRatio === 'number') metadata.aspectRatio = candidate.aspectRatio;
  if (typeof candidate.processingError === 'string') metadata.processingError = candidate.processingError;
  if (typeof candidate.failedPage === 'number') metadata.failedPage = candidate.failedPage;
  if (candidate.coverFrame && typeof candidate.coverFrame === 'object' && !Array.isArray(candidate.coverFrame)) {
    metadata.coverFrame = normalizeProjectCoverFrame(candidate.coverFrame);
  }
  if (Array.isArray(candidate.renderedPages)) {
    metadata.renderedPages = candidate.renderedPages.flatMap((page) => {
      if (!page || typeof page !== 'object' || Array.isArray(page)) return [];
      const item = page as Record<string, unknown>;
      if (
        typeof item.index !== 'number'
        || typeof item.withinDocumentIndex !== 'number'
        || typeof item.attachmentId !== 'string'
        || typeof item.storagePath !== 'string'
        || typeof item.width !== 'number'
        || typeof item.height !== 'number'
        || typeof item.aspectRatio !== 'number'
      ) return [];
      return [{
        index: item.index,
        withinDocumentIndex: item.withinDocumentIndex,
        attachmentId: item.attachmentId,
        storagePath: item.storagePath,
        sourceUrl: urls.get(item.storagePath) ?? null,
        width: item.width,
        height: item.height,
        aspectRatio: item.aspectRatio,
      }];
    });
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function asDesign(value: unknown): ProjectDesign | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as { typefaceId?: unknown; pagesPerRow?: unknown; openingPage?: unknown };
  if (typeof candidate.typefaceId !== 'string') return undefined;
  const pagesPerRow = typeof candidate.pagesPerRow === 'number'
    && Number.isInteger(candidate.pagesPerRow)
    && candidate.pagesPerRow >= MIN_PAGES_PER_ROW
    && candidate.pagesPerRow <= MAX_PAGES_PER_ROW
    ? candidate.pagesPerRow
    : undefined;
  const openingCandidate = candidate.openingPage && typeof candidate.openingPage === 'object' && !Array.isArray(candidate.openingPage)
    ? candidate.openingPage as { attachmentId?: unknown; pageNumber?: unknown }
    : null;
  const openingPage = openingCandidate
    && typeof openingCandidate.attachmentId === 'string'
    && openingCandidate.attachmentId.length > 0
    && typeof openingCandidate.pageNumber === 'number'
    && Number.isInteger(openingCandidate.pageNumber)
    && openingCandidate.pageNumber >= 1
    && openingCandidate.pageNumber <= 10_000
    ? { attachmentId: openingCandidate.attachmentId, pageNumber: openingCandidate.pageNumber }
    : undefined;
  return {
    typefaceId: candidate.typefaceId,
    ...(pagesPerRow ? { pagesPerRow } : {}),
    ...(openingPage ? { openingPage } : {}),
  };
}

function throwProfileError(error: { code?: string; message: string }, fallback: string): never {
  if (error.code === '23505' || error.message.toLowerCase().includes('profiles_handle')) {
    throw new ProfileServiceError('handle_taken', 'That handle is already taken.');
  }
  if (error.code === '42501') {
    throw new ProfileServiceError('permission_denied', 'You do not have permission to change that profile.');
  }
  throw new ProfileServiceError('network', error.message || fallback);
}

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await requireSupabase()
    .storage
    .from(PROJECT_MEDIA_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) throw new Error(error.message);
  const urls = new Map<string, string>();
  (data ?? []).forEach((item) => {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  });
  return urls;
}

async function hydrateProjects(
  projectRows: ProjectRow[],
  categoryRows: Array<Pick<CategoryRow, 'id' | 'label'>>,
  attachmentRows: AttachmentRow[],
): Promise<Map<string, Project>> {
  const urls = await signedUrls(attachmentRows.flatMap((row) => [
    row.storage_path,
    ...renderedPagePaths(row.metadata),
  ]));
  const attachmentsByProject = new Map<string, ProjectAttachment[]>();
  attachmentRows.forEach((row) => {
    const attachment: ProjectAttachment = {
      id: row.id,
      kind: row.kind as ProjectAttachment['kind'],
      fileName: row.file_name,
      displayName: row.display_name,
      extension: row.extension,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      typeLabel: row.type_label,
      sourceUrl: urls.get(row.storage_path) ?? null,
      storagePath: row.storage_path,
      status: row.status as ProjectAttachment['status'],
      isCover: row.is_cover,
      order: row.position,
      metadata: asMetadata(row.metadata, urls),
    };
    attachmentsByProject.set(row.project_id, [
      ...(attachmentsByProject.get(row.project_id) ?? []),
      attachment,
    ]);
  });

  const categoryLabels = new Map(categoryRows.map((row) => [row.id, row.label]));
  return new Map(projectRows.map((row) => {
    const attachments = attachmentsByProject.get(row.id) ?? [];
    const cover = attachments.find((item) => item.isCover && item.sourceUrl)
      ?? attachments.find((item) => item.kind === 'image' && item.sourceUrl)
      ?? attachments[0];
    const storedRelevance: Partial<ProjectRelevance> = {
      topicKeys: Array.isArray(row.topic_keys) ? row.topic_keys : [],
      contentGeography: row.content_location ? { label: row.content_location, city: row.content_location } : null,
      geographicScope: row.geographic_scope as GeographicScope | undefined,
      geographyConfidence: typeof row.geography_confidence === 'number' ? row.geography_confidence : undefined,
    };
    const project: Project = {
      id: row.id,
      categoryId: row.category_id,
      title: row.title,
      summary: row.summary,
      publishedAt: row.published_at,
      relevance: deriveProjectRelevance({
        title: row.title,
        summary: row.summary,
        categoryLabel: categoryLabels.get(row.category_id) ?? '',
        stored: storedRelevance,
      }),
      cover: cover?.sourceUrl ?? '',
      coverAlt: row.title,
      coverKind: cover?.kind === 'video' ? 'video' : cover?.kind === 'document' ? 'document' : undefined,
      coverAspectRatio: cover?.metadata?.widthPixels && cover.metadata.heightPixels
        ? cover.metadata.widthPixels / cover.metadata.heightPixels
        : undefined,
      coverFrame: cover?.metadata?.coverFrame,
      pageCount: cover?.kind === 'document' ? cover.metadata?.pageCount : undefined,
      attachments,
      design: asDesign(row.design),
      sessionOnly: false,
    };
    return [row.id, project];
  }));
}

async function loadProfiles(profileId?: string): Promise<Profile[]> {
  const client = requireSupabase();
  const { data: authData } = await client.auth.getUser();
  const viewerAccountId = authData.user?.id ?? null;
  let profileQuery = client.from('profiles').select('*').order('created_at', { ascending: false });
  if (profileId) profileQuery = profileQuery.eq('id', profileId);
  const { data: profileData, error: profileError } = await profileQuery;
  if (profileError) throwProfileError(profileError, 'Profiles could not be loaded.');
  const profileRows = ((profileData ?? []) as unknown as ProfileRow[])
    .filter((row) => Boolean(profileId) || !row.is_private || row.account_id === viewerAccountId);
  if (profileRows.length === 0) return [];

  const profileIds = profileRows.map((row) => row.id);
  const [categoryResult, projectResult] = await Promise.all([
    client.from('portfolio_categories').select('*').in('profile_id', profileIds).order('position'),
    client.from('projects').select('*').in('profile_id', profileIds).order('published_at', { ascending: false }),
  ]);
  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (projectResult.error) throw new Error(projectResult.error.message);
  const categoryRows = (categoryResult.data ?? []) as unknown as CategoryRow[];
  const projectRows = (projectResult.data ?? []) as unknown as ProjectRow[];
  const projectIds = projectRows.map((row) => row.id);
  const attachmentResult = projectIds.length > 0
    ? await client.from('project_attachments').select('*').in('project_id', projectIds).order('position')
    : { data: [], error: null };
  if (attachmentResult.error) throw new Error(attachmentResult.error.message);
  const attachmentRows = (attachmentResult.data ?? []) as unknown as AttachmentRow[];
  const projectsById = await hydrateProjects(projectRows, categoryRows, attachmentRows);

  const projectsByProfile = new Map<string, Project[]>();
  profileIds.forEach((currentProfileId) => {
    const rows = projectRows.filter((row) => row.profile_id === currentProfileId);
    // Negative positions are the explicit profile-wall ordering marker. Older
    // records use per-category non-negative positions, often with duplicates,
    // so they retain the established newest-first profile presentation until
    // the owner deliberately arranges their wall.
    const orderedRows = rows.some((row) => row.position < 0)
      ? [...rows].sort((a, b) => a.position - b.position || b.published_at.localeCompare(a.published_at))
      : rows;
    projectsByProfile.set(currentProfileId, orderedRows
      .map((row) => projectsById.get(row.id))
      .filter((project): project is Project => Boolean(project)));
  });

  return profileRows.map((row) => {
    const isOwner = viewerAccountId !== null && row.account_id === viewerAccountId;
    const visibleCategories = categoryRows.filter((category) => category.profile_id === row.id && (isOwner || !category.is_hidden));
    const visibleCategoryIds = new Set(visibleCategories.map((category) => category.id));
    const visibleProjectIds = new Set(projectRows
      .filter((project) => project.profile_id === row.id && (isOwner || (!project.is_hidden && visibleCategoryIds.has(project.category_id))))
      .map((project) => project.id));
    return {
    id: row.id,
    name: row.name,
    handle: `@${row.handle}`,
    headline: row.headline,
    location: row.location,
    initials: deriveInitials(row.name),
    avatar: row.avatar_url,
    navHeading: row.nav_heading,
    stats: asStats(row.stats),
    socialLinks: asStringRecord(row.social_links),
    links: asLinks(row.links),
    categories: visibleCategories.map((category) => ({
        id: category.id,
        label: category.label,
        iconName: category.icon_name,
        format: category.format as CategoryFormat,
        blurb: category.blurb,
      })),
    projects: (projectsByProfile.get(row.id) ?? []).filter((project) => visibleProjectIds.has(project.id)),
    isPrivate: row.is_private,
    };
  });
}

async function loadRequestedProjectViews(projectIds: string[]): Promise<ProjectView[]> {
  const requestedIds = [...new Set(projectIds)];
  if (requestedIds.length === 0) return [];
  const client = requireSupabase();
  const projectResult = await client
    .from('projects')
    .select('*')
    .in('id', requestedIds);
  if (projectResult.error) throw new Error(projectResult.error.message);
  const projectRows = (projectResult.data ?? []) as unknown as ProjectRow[];
  if (projectRows.length === 0) return [];

  const profileIds = [...new Set(projectRows.map((row) => row.profile_id))];
  const categoryIds = [...new Set(projectRows.map((row) => row.category_id))];
  const [profileResult, categoryResult, attachmentResult] = await Promise.all([
    client.from('profiles').select('id,name,headline,avatar_url,location,is_private').in('id', profileIds),
    client.from('portfolio_categories').select('id,label').in('id', categoryIds),
    client.from('project_attachments').select('*').in('project_id', requestedIds).order('position'),
  ]);
  if (profileResult.error) throwProfileError(profileResult.error, 'Project creators could not be loaded.');
  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (attachmentResult.error) throw new Error(attachmentResult.error.message);

  const creatorRows = (profileResult.data ?? []) as unknown as Array<Pick<ProfileRow, 'id' | 'name' | 'headline' | 'avatar_url' | 'location' | 'is_private'>>;
  const categoryRows = (categoryResult.data ?? []) as unknown as Array<Pick<CategoryRow, 'id' | 'label'>>;
  const attachmentRows = (attachmentResult.data ?? []) as unknown as AttachmentRow[];
  const projectsById = await hydrateProjects(projectRows, categoryRows, attachmentRows);
  const creatorsById = new Map(creatorRows.map((row) => [row.id, {
    id: row.id,
    name: row.name,
    kind: row.headline,
    avatar: row.avatar_url,
    location: row.location,
    isPrivate: row.is_private,
  }]));
  const viewsById = new Map<string, ProjectView>();
  projectRows.forEach((row) => {
    const project = projectsById.get(row.id);
    const creator = creatorsById.get(row.profile_id);
    if (project && creator) viewsById.set(row.id, { project, creator });
  });
  return projectIds.map((id) => viewsById.get(id)).filter((view): view is ProjectView => Boolean(view));
}

async function uploadAvatar(accountId: string, input: CreateProfileInput['avatar']): Promise<string> {
  if (!input) return '';
  const path = `${accountId}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
  const bucket = requireSupabase().storage.from(AVATAR_BUCKET);
  const { error } = await bucket.upload(path, input.file, {
    contentType: input.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new ProfileServiceError('network', `Your avatar could not be uploaded: ${error.message}`);
  return bucket.getPublicUrl(path).data.publicUrl;
}

export const supabaseProfileService: ProfileService = {
  async getProfile(profileId) {
    const profiles = await loadProfiles(profileId);
    const profile = profiles[0];
    if (!profile) throw new ProfileServiceError('not_found', 'That creator profile could not be found.');
    return profile;
  },

  async getProfileForAccount(accountId) {
    const { data, error } = await requireSupabase()
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throwProfileError(error, 'Your creator profile could not be loaded.');
    const row = data as unknown as { id: string } | null;
    return row ? this.getProfile(row.id) : null;
  },

  listProfiles() {
    return loadProfiles();
  },

  async checkHandleAvailability(handle): Promise<HandleAvailability> {
    const normalized = normalizeHandle(handle);
    const { count, error } = await requireSupabase()
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('handle', normalized);
    if (error) throwProfileError(error, 'Handle availability could not be checked.');
    return {
      handle: normalized,
      isAvailable: count === 0,
      reason: count === 0 ? undefined : 'That handle is already taken.',
    };
  },

  async createProfile(accountId, input): Promise<CreateProfileResult> {
    const handle = normalizeHandle(input.handle);
    if (!handle || !input.name.trim() || !input.headline.trim()) {
      throw new ProfileServiceError('invalid_input', 'A valid handle, name, and headline are required.');
    }
    const avatarUrl = await uploadAvatar(accountId, input.avatar);
    const { data, error } = await requireSupabase()
      .from('profiles')
      .insert({
        account_id: accountId,
        name: input.name.trim(),
        handle,
        headline: input.headline.trim(),
        location: input.location?.trim() ?? '',
        avatar_url: avatarUrl,
      })
      .select('id')
      .single();
    if (error) throwProfileError(error, 'Your creator profile could not be created.');
    const row = data as unknown as { id: string };
    return {
      profile: await this.getProfile(row.id),
      accountId,
      avatarPersisted: Boolean(input.avatar && avatarUrl),
    };
  },

  async updateProfile(profileId, input) {
    const current = await this.getProfile(profileId);
    const { data: authData } = await requireSupabase().auth.getUser();
    if (!authData.user) throw new ProfileServiceError('permission_denied', 'Sign in before changing your profile.');
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.headline !== undefined) update.headline = input.headline.trim();
    if (input.location !== undefined) update.location = input.location.trim();
    if (input.handle !== undefined) update.handle = normalizeHandle(input.handle);
    if (input.links !== undefined) update.links = input.links;
    if (input.socialLinks !== undefined) update.social_links = input.socialLinks;
    if (input.isPrivate !== undefined) update.is_private = input.isPrivate;
    if (input.avatar) update.avatar_url = await uploadAvatar(authData.user.id, input.avatar);
    if (Object.keys(update).length === 0) return current;
    const { error } = await requireSupabase().from('profiles').update(update).eq('id', profileId);
    if (error) throwProfileError(error, 'Your profile changes could not be saved.');
    return this.getProfile(profileId);
  },

  async getPortfolioArrangement(profileId) {
    const { data, error } = await requireSupabase()
      .from('portfolio_categories')
      .select('id,icon_name,is_hidden')
      .eq('profile_id', profileId)
      .order('position');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ id: string; icon_name: string; is_hidden: boolean }>;
    return {
      categoryOrder: rows.map((row) => row.id),
      hiddenCategoryIds: rows.filter((row) => row.is_hidden).map((row) => row.id),
      categoryIcons: Object.fromEntries(rows.map((row) => [row.id, row.icon_name])),
    };
  },

  async savePortfolioArrangement(profileId, arrangement) {
    const client = requireSupabase();
    const writes = arrangement.categoryOrder.map((categoryId, position) =>
      client
        .from('portfolio_categories')
        .update({
          position,
          is_hidden: arrangement.hiddenCategoryIds.includes(categoryId),
          icon_name: arrangement.categoryIcons[categoryId] ?? 'FolderIcon',
        })
        .eq('id', categoryId)
        .eq('profile_id', profileId),
    );
    const results = await Promise.all(writes);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);
  },

  async createCategory(profileId, input) {
    const { data: existing, error: readError } = await requireSupabase()
      .from('portfolio_categories')
      .select('position')
      .eq('profile_id', profileId)
      .order('position', { ascending: false })
      .limit(1);
    if (readError) throw new CategoryMutationError('unknown', readError.message);
    const rows = (existing ?? []) as unknown as Array<{ position: number }>;
    const { data, error } = await requireSupabase()
      .from('portfolio_categories')
      .insert({
        profile_id: profileId,
        label: input.label.trim(),
        icon_name: input.iconName ?? 'FolderIcon',
        format: input.format ?? 'grid',
        blurb: input.blurb?.trim() ?? '',
        position: (rows[0]?.position ?? -1) + 1,
      })
      .select('*')
      .single();
    if (error) {
      const code = error.code === '23505' ? 'duplicate_label' : error.code === '42501' ? 'deletion_unavailable' : 'unknown';
      throw new CategoryMutationError(code, error.message);
    }
    const row = data as unknown as CategoryRow;
    return {
      id: row.id,
      label: row.label,
      iconName: row.icon_name,
      format: row.format as CategoryFormat,
      blurb: row.blurb,
    };
  },

  async renameCategory(profileId, categoryId, label) {
    const { error } = await requireSupabase()
      .from('portfolio_categories')
      .update({ label: label.trim() })
      .eq('id', categoryId)
      .eq('profile_id', profileId);
    if (error) throw new CategoryMutationError(error.code === '23505' ? 'duplicate_label' : 'unknown', error.message);
    const profile = await this.getProfile(profileId);
    const category = profile.categories.find((item) => item.id === categoryId);
    if (!category) throw new CategoryMutationError('not_found', 'That category no longer exists.');
    return category;
  },

  async setCategoryIcon(profileId, categoryId, iconName) {
    const { error } = await requireSupabase()
      .from('portfolio_categories')
      .update({ icon_name: iconName })
      .eq('id', categoryId)
      .eq('profile_id', profileId);
    if (error) throw new CategoryMutationError('unknown', error.message);
    const profile = await this.getProfile(profileId);
    const category = profile.categories.find((item) => item.id === categoryId);
    if (!category) throw new CategoryMutationError('not_found', 'That category no longer exists.');
    return category;
  },

  async getCategoryDeletionCapability(profileId, categoryId) {
    const { count, error } = await requireSupabase()
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('category_id', categoryId);
    if (error) throw new CategoryMutationError('unknown', error.message);
    const blockingProjectCount = count ?? 0;
    return blockingProjectCount > 0
      ? {
          isAvailable: false,
          removes: [],
          reason: 'Move or delete the work in this category before removing it.',
          blockingProjectCount,
        }
      : {
          isAvailable: true,
          removes: ['This category and its position in your portfolio.'],
          blockingProjectCount: 0,
        };
  },

  async deleteCategory(profileId, categoryId) {
    const capability = await this.getCategoryDeletionCapability(profileId, categoryId);
    if (!capability.isAvailable) {
      throw new CategoryMutationError('category_not_empty', capability.reason ?? 'That category is not empty.', capability.blockingProjectCount);
    }
    const { error } = await requireSupabase()
      .from('portfolio_categories')
      .delete()
      .eq('id', categoryId)
      .eq('profile_id', profileId);
    if (error) throw new CategoryMutationError('unknown', error.message);
  },
};

function draftFromRow(row: DraftRow): ProjectDraft {
  return {
    id: row.id,
    profileId: row.profile_id,
    categoryId: row.category_id,
    metadata: { title: row.title, summary: row.summary },
    createdAt: row.created_at,
  };
}

async function projectProfileId(projectId: string): Promise<string> {
  const { data, error } = await requireSupabase().from('projects').select('profile_id').eq('id', projectId).single();
  if (error) throw new ProjectMutationError('not_found', 'That project could not be found.');
  return (data as unknown as { profile_id: string }).profile_id;
}

export const supabaseProjectService: ProjectService = {
  async getProject(projectId) {
    const profile = await supabaseProfileService.getProfile(await projectProfileId(projectId));
    const project = profile.projects.find((item) => item.id === projectId);
    if (!project) throw new ProjectMutationError('not_found', 'That project could not be found.');
    return project;
  },

  async getProjectView(projectId) {
    const profile = await supabaseProfileService.getProfile(await projectProfileId(projectId));
    const project = profile.projects.find((item) => item.id === projectId);
    if (!project) throw new ProjectMutationError('not_found', 'That project could not be found.');
    return { project, creator: { id: profile.id, name: profile.name, kind: profile.headline, avatar: profile.avatar, location: profile.location, isPrivate: profile.isPrivate === true } };
  },

  async listProjectViews(projectIds) {
    return loadRequestedProjectViews(projectIds);
  },

  async listProjects(profileId, categoryId) {
    const projects = (await supabaseProfileService.getProfile(profileId)).projects;
    return categoryId ? projects.filter((project) => project.categoryId === categoryId) : projects;
  },

  async getProjectDesign(projectId) {
    return (await this.getProject(projectId)).design ?? { typefaceId: 'default' };
  },

  async listProjectDesigns(projectIds) {
    const views = await this.listProjectViews(projectIds);
    return Object.fromEntries(views.map((view) => [view.project.id, view.project.design ?? { typefaceId: 'default' }]));
  },

  async updateProjectDesign(projectId, design) {
    if (!typefaces.some((typeface) => typeface.id === design.typefaceId)) {
      throw new ProjectMutationError('invalid_metadata', 'That typeface is not available.');
    }
    if (design.pagesPerRow !== undefined && (!Number.isInteger(design.pagesPerRow) || design.pagesPerRow < MIN_PAGES_PER_ROW || design.pagesPerRow > MAX_PAGES_PER_ROW)) {
      throw new ProjectMutationError('invalid_metadata', `Pages per row must be between ${MIN_PAGES_PER_ROW} and ${MAX_PAGES_PER_ROW}.`);
    }
    if (design.openingPage !== undefined && (!design.openingPage.attachmentId || !Number.isInteger(design.openingPage.pageNumber) || design.openingPage.pageNumber < 1 || design.openingPage.pageNumber > 10_000)) {
      throw new ProjectMutationError('invalid_metadata', 'The opening page is not valid.');
    }
    const { error } = await requireSupabase().from('projects').update({ design }).eq('id', projectId);
    if (error) throw new ProjectMutationError(error.code === '42501' ? 'permission_denied' : 'network', error.message);
    return design;
  },

  async saveProfileProjectOrder(profileId, projectIds) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('projects')
      .select('id,position,published_at')
      .eq('profile_id', profileId)
      .order('published_at', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ id: string; position: number; published_at: string }>;
    const liveIds = rows.map((row) => row.id);
    const unique = [...new Set(projectIds)];
    if (unique.length !== projectIds.length || unique.some((projectId) => !liveIds.includes(projectId))) {
      throw new Error('That order contains a project this profile does not own.');
    }
    const current = rows.some((row) => row.position < 0)
      ? [...rows].sort((a, b) => a.position - b.position || b.published_at.localeCompare(a.published_at)).map((row) => row.id)
      : liveIds;
    const next = [...unique, ...current.filter((projectId) => !unique.includes(projectId))];
    // Negative positions distinguish the profile-wide wall order from legacy
    // per-category positions without requiring a second persistence column.
    const results = await Promise.all(next.map((projectId, index) => client
      .from('projects')
      .update({ position: index - next.length })
      .eq('id', projectId)
      .eq('profile_id', profileId)));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);
  },

  async getProjectArrangement(profileId, categoryId) {
    const { data, error } = await requireSupabase()
      .from('projects')
      .select('id,is_hidden,is_pinned')
      .eq('profile_id', profileId)
      .eq('category_id', categoryId)
      .order('position');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ id: string; is_hidden: boolean; is_pinned: boolean }>;
    return {
      projectOrder: rows.map((row) => row.id),
      hiddenProjectIds: rows.filter((row) => row.is_hidden).map((row) => row.id),
      pinnedProjectIds: rows.filter((row) => row.is_pinned).map((row) => row.id),
    };
  },

  async saveProjectArrangement(profileId, categoryId, arrangement) {
    const client = requireSupabase();
    const { data: profileData, error: profileError } = await client
      .from('projects')
      .select('id,category_id,position')
      .eq('profile_id', profileId)
      .order('position');
    if (profileError) throw new Error(profileError.message);
    const profileRows = (profileData ?? []) as unknown as Array<{ id: string; category_id: string; position: number }>;
    const categoryRows = profileRows.filter((row) => row.category_id === categoryId);
    const categoryIds = categoryRows.map((row) => row.id);
    if (arrangement.projectOrder.length !== categoryIds.length || arrangement.projectOrder.some((projectId) => !categoryIds.includes(projectId))) {
      throw new Error('That arrangement refers to work this category does not hold.');
    }

    if (profileRows.some((row) => row.position < 0)) {
      let categoryIndex = 0;
      const mergedOrder = profileRows.map((row) => row.category_id === categoryId
        ? arrangement.projectOrder[categoryIndex++]
        : row.id);
      const results = await Promise.all(mergedOrder.map((projectId, index) => {
        const update = categoryIds.includes(projectId)
          ? {
              position: index - mergedOrder.length,
              is_hidden: arrangement.hiddenProjectIds.includes(projectId),
              is_pinned: arrangement.pinnedProjectIds.includes(projectId),
            }
          : { position: index - mergedOrder.length };
        return client.from('projects').update(update).eq('id', projectId).eq('profile_id', profileId);
      }));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw new Error(failed.error.message);
      return;
    }

    const results = await Promise.all(arrangement.projectOrder.map((projectId, position) =>
      client.from('projects').update({
        position,
        is_hidden: arrangement.hiddenProjectIds.includes(projectId),
        is_pinned: arrangement.pinnedProjectIds.includes(projectId),
      }).eq('id', projectId).eq('profile_id', profileId).eq('category_id', categoryId),
    ));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);
  },

  async uploadProjectMedia() {
    throw new ProjectMutationError('invalid_media', 'Use the publishing flow to upload and publish work.');
  },

  async createDraft(profileId, categoryId) {
    const { data, error } = await requireSupabase()
      .from('project_drafts')
      .insert({ profile_id: profileId, category_id: categoryId })
      .select('*')
      .single();
    if (error) throw new PublishServiceError(error.code === '42501' ? 'not_owner' : 'network', error.message);
    return draftFromRow(data as unknown as DraftRow);
  },

  async updateDraft(draftId, metadata) {
    const { data, error } = await requireSupabase()
      .from('project_drafts')
      .update({ title: metadata.title.trim(), summary: metadata.summary.trim() })
      .eq('id', draftId)
      .select('*')
      .single();
    if (error) throw new PublishServiceError(error.code === 'PGRST116' ? 'draft_not_found' : 'network', error.message);
    return draftFromRow(data as unknown as DraftRow);
  },

  async discardDraft(draftId) {
    const { error } = await requireSupabase().from('project_drafts').delete().eq('id', draftId);
    if (error) throw new PublishServiceError('network', error.message);
  },

  async publishProject(input: PublishProjectInput): Promise<PublishResult> {
    if (!input.metadata.title.trim() || !input.metadata.summary.trim()) {
      throw new PublishServiceError('invalid_metadata', 'A title and description are required.');
    }
    if (!input.attachments?.length || input.media?.length) {
      throw new PublishServiceError('invalid_media', 'Upload at least one file before publishing.');
    }
    const categoryResult = await requireSupabase().from('portfolio_categories').select('label').eq('id', input.categoryId).eq('profile_id', input.profileId).single();
    if (categoryResult.error) throw new PublishServiceError('category_not_found', 'That portfolio category could not be found.');
    const relevance = input.relevance ?? projectRelevanceForPersistence(input.metadata, String((categoryResult.data as { label?: string }).label ?? ''));
    const extended = await requireSupabase().rpc('publish_project', {
      p_draft_id: input.draftId,
      p_profile_id: input.profileId,
      p_category_id: input.categoryId,
      p_title: input.metadata.title.trim(),
      p_summary: input.metadata.summary.trim(),
      p_attachments: input.attachments,
      p_topic_keys: relevance.topicKeys,
      p_content_location: relevance.contentGeography?.label ?? '',
      p_geographic_scope: relevance.geographicScope,
      p_geography_confidence: relevance.geographyConfidence,
    });
    // Deployments can roll forward safely: until the migration is applied, use
    // the existing RPC and derive the same metadata when the project is read.
    const result = extended.error && (extended.error.code === 'PGRST202' || extended.error.message.includes('function'))
      ? await requireSupabase().rpc('publish_project', {
          p_draft_id: input.draftId,
          p_profile_id: input.profileId,
          p_category_id: input.categoryId,
          p_title: input.metadata.title.trim(),
          p_summary: input.metadata.summary.trim(),
          p_attachments: input.attachments,
        })
      : extended;
    const { data, error } = result;
    if (error) {
      const normalized = error.message.toLowerCase();
      const code = normalized.includes('owner') ? 'not_owner' : normalized.includes('category') ? 'category_not_found' : normalized.includes('draft') ? 'draft_not_found' : 'network';
      throw new PublishServiceError(code, error.message);
    }
    return { projectId: String(data), mediaPersisted: true, sessionOnly: false };
  },

  async updateProject(input: UpdateProjectInput): Promise<UpdateProjectResult> {
    if (!input.metadata.title.trim() || !input.metadata.summary.trim()) {
      throw new ProjectMutationError('invalid_metadata', 'A title and description are required.');
    }
    const { data, error } = await requireSupabase().rpc('update_project', {
      p_project_id: input.projectId,
      p_profile_id: input.profileId,
      p_title: input.metadata.title.trim(),
      p_summary: input.metadata.summary.trim(),
      p_kept: input.attachments,
      p_added: input.addedAttachments ?? [],
      p_expected_revision: input.expectedRevision ?? null,
    });
    if (error) {
      const normalized = error.message.toLowerCase();
      const code = normalized.includes('revision') ? 'conflict' : normalized.includes('owner') ? 'permission_denied' : normalized.includes('media') ? 'invalid_media' : 'network';
      throw new ProjectMutationError(code, error.message);
    }
    const result = data as unknown as {
      removedAttachmentIds?: string[];
      removedStoragePaths?: string[];
    } | null;
    const removedStoragePaths = result?.removedStoragePaths ?? [];
    const cleanup = removedStoragePaths.length > 0
      ? await requireSupabase().storage.from(PROJECT_MEDIA_BUCKET).remove(removedStoragePaths)
      : { error: null };
    return {
      project: await this.getProject(input.projectId),
      mediaPersisted: true,
      sessionOnly: false,
      removedAttachmentIds: result?.removedAttachmentIds ?? [],
      message: cleanup.error
        ? 'Your project was updated, but some removed files still need storage cleanup.'
        : 'Your project has been updated.',
    };
  },

  async deleteProject(projectId, options): Promise<DeleteProjectResult> {
    const project = await this.getProject(projectId);
    if (options?.profileId && (await projectProfileId(projectId)) !== options.profileId) {
      throw new ProjectMutationError('permission_denied', 'That project belongs to another creator.');
    }
    const stored = (project.attachments ?? []).filter((item) => item.storagePath);
    const { error } = await requireSupabase().from('projects').delete().eq('id', projectId);
    if (error) throw new ProjectMutationError(error.code === '42501' ? 'permission_denied' : 'network', error.message);
    const paths = stored.flatMap((item) => [
      item.storagePath,
      ...(item.metadata?.renderedPages ?? []).map((page) => page.storagePath),
    ]).filter((path): path is string => Boolean(path));
    let storageDeleted = paths.length === 0;
    if (paths.length > 0) {
      const removal = await requireSupabase().storage.from(PROJECT_MEDIA_BUCKET).remove(paths);
      storageDeleted = !removal.error;
    }
    return {
      projectId,
      removedAttachmentIds: stored.map((item) => item.id),
      storageDeleted,
      message: storageDeleted
        ? 'The project and its stored files have been deleted.'
        : 'The project was deleted, but some stored files still need cleanup.',
    };
  },
};

async function visibleCategoryIdsForProfiles(profileIds: string[]): Promise<string[]> {
  const uniqueProfileIds = [...new Set(profileIds.filter(Boolean))];
  if (uniqueProfileIds.length === 0) return [];
  const { data, error } = await requireSupabase()
    .from('portfolio_categories')
    .select('id')
    .in('profile_id', uniqueProfileIds)
    .eq('is_hidden', false);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{ id: string }>).map((row) => row.id);
}

async function latestProjectIds(limit = 60): Promise<string[]> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id')
    .eq('is_private', false)
    .limit(500);
  if (error) throw new Error(error.message);
  const publicProfileIds = ((data ?? []) as unknown as Array<{ id: string }>).map((row) => row.id);
  return (await projectIdsForProfiles(publicProfileIds)).slice(0, limit);
}

async function projectIdsForProfiles(profileIds: string[]): Promise<string[]> {
  const uniqueProfileIds = [...new Set(profileIds.filter(Boolean))];
  if (uniqueProfileIds.length === 0) return [];
  const pageSize = 500;
  const profileBatchSize = 100;
  const projectIds: string[] = [];
  for (let profileStart = 0; profileStart < uniqueProfileIds.length; profileStart += profileBatchSize) {
    const profileBatch = uniqueProfileIds.slice(profileStart, profileStart + profileBatchSize);
    const visibleCategoryIds = await visibleCategoryIdsForProfiles(profileBatch);
    if (visibleCategoryIds.length === 0) continue;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await requireSupabase()
        .from('projects')
        .select('id')
        .in('profile_id', profileBatch)
        .in('category_id', visibleCategoryIds)
        .eq('is_hidden', false)
        .order('published_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<{ id: string }>;
      projectIds.push(...rows.map((row) => row.id));
      if (rows.length < pageSize) break;
    }
  }
  return projectIds;
}

async function projectViewsForIds(projectIds: string[]): Promise<ProjectView[]> {
  const batchSize = 100;
  const viewsById = new Map<string, ProjectView>();
  // Keep REST `in(...)` URLs bounded, and cap concurrent hydration groups so an
  // account with a long history does not fan one Home request into an unbounded
  // burst of database and signed-URL calls.
  for (let windowStart = 0; windowStart < projectIds.length; windowStart += batchSize * 4) {
    const windowIds = projectIds.slice(windowStart, windowStart + batchSize * 4);
    const batches = Array.from({ length: Math.ceil(windowIds.length / batchSize) }, (_, index) =>
      windowIds.slice(index * batchSize, (index + 1) * batchSize));
    const views = await Promise.all(batches.map((ids) => supabaseProjectService.listProjectViews(ids)));
    views.flat().forEach((view) => viewsById.set(view.project.id, view));
  }
  return projectIds.map((id) => viewsById.get(id)).filter((view): view is ProjectView => Boolean(view));
}

function isMissingDiscoveryTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('discovery_signals') || error.message?.includes('discovery_preferences')));
}

const HOME_FEED_MODES: HomeFeedMode[] = ['balanced', 'following', 'nearby', 'latest'];
let guestHomeFeedMode: HomeFeedMode = 'balanced';

function asHomeFeedMode(value: unknown): HomeFeedMode {
  return typeof value === 'string' && HOME_FEED_MODES.includes(value as HomeFeedMode) ? value as HomeFeedMode : 'balanced';
}

async function discoveryContext(scope: 'global' | 'home' = 'global') {
  const client = requireSupabase();
  const { data: authData } = await client.auth.getUser();
  const accountId = authData.user?.id ?? null;
  if (!accountId) {
    // Global Search remains public. Home is account-specific and therefore has
    // no invented fallback content for a guest.
    const projectIds = scope === 'global' ? await latestProjectIds(120) : [];
    const availableProjects = await projectViewsForIds(projectIds);
    return {
      availableProjects,
      homeMode: guestHomeFeedMode,
      sphere: buildUserContentSphere({
        viewerProfile: null,
        availableProjects,
        followedCreatorIds: [],
        engagement: [],
        explicitSignals: [],
      }),
    };
  }

  const [viewerRow, followResult, engagementResult, signalResult, preferenceResult] = await Promise.all([
    client.from('profiles').select('id').eq('account_id', accountId).maybeSingle(),
    client.from('profile_follows').select('target_profile_id').eq('follower_account_id', accountId).eq('status', 'following'),
    client.from('project_engagement').select('project_id,kind,created_at').eq('account_id', accountId),
    client.from('discovery_signals').select('topic_key,interest_weight,curiosity_weight,last_interest_at,last_curiosity_at').eq('account_id', accountId),
    client.from('discovery_preferences').select('home_mode').eq('account_id', accountId).maybeSingle(),
  ]);
  if (viewerRow.error) throw new Error(viewerRow.error.message);
  if (followResult.error) throw new Error(followResult.error.message);
  if (engagementResult.error) throw new Error(engagementResult.error.message);
  if (signalResult.error && !isMissingDiscoveryTable(signalResult.error)) throw new Error(signalResult.error.message);
  if (preferenceResult.error && !isMissingDiscoveryTable(preferenceResult.error)) throw new Error(preferenceResult.error.message);
  const viewerId = (viewerRow.data as unknown as { id: string } | null)?.id;
  const followedCreatorIds = ((followResult.data ?? []) as unknown as Array<{ target_profile_id: string }>).map((row) => row.target_profile_id);
  // Search can stay bounded to the recent global discovery pool. Home instead
  // asks the indexed project table for the viewer and every followed creator,
  // so older work and multiple projects from one creator are not silently lost.
  const projectIds = scope === 'home'
    ? await projectIdsForProfiles([...(viewerId ? [viewerId] : []), ...followedCreatorIds])
    : await latestProjectIds(120);
  const availableProjects = await projectViewsForIds(projectIds);
  const viewerProfile = viewerId ? await supabaseProfileService.getProfile(viewerId) : null;
  const explicitSignals: DiscoverySignal[] = signalResult.error ? [] : ((signalResult.data ?? []) as unknown as Array<{
    topic_key: string;
    interest_weight: number;
    curiosity_weight: number;
    last_interest_at: string | null;
    last_curiosity_at: string | null;
  }>).map((row) => ({
    topicKey: row.topic_key,
    interestWeight: Number(row.interest_weight),
    curiosityWeight: Number(row.curiosity_weight),
    lastInterestAt: row.last_interest_at,
    lastCuriosityAt: row.last_curiosity_at,
  }));
  return {
    availableProjects,
    homeMode: preferenceResult.error ? guestHomeFeedMode : asHomeFeedMode((preferenceResult.data as unknown as { home_mode?: string } | null)?.home_mode),
    sphere: buildUserContentSphere({
      viewerProfile,
      availableProjects,
      followedCreatorIds,
      engagement: ((engagementResult.data ?? []) as unknown as Array<{ project_id: string; kind: 'like' | 'save' | 'repost'; created_at: string }>).map((row) => ({
        projectId: row.project_id,
        kind: row.kind,
        createdAt: row.created_at,
      })),
      explicitSignals,
    }),
  };
}

export const supabaseDiscoveryService: DiscoveryService = {
  async getHomeDiscovery() {
    const context = await discoveryContext('home');
    return rankHomeProjects(context.availableProjects, context.sphere, new Date(), context.homeMode);
  },
  async setHomeFeedMode(mode) {
    const client = requireSupabase();
    const { data } = await client.auth.getUser();
    if (!data.user) {
      guestHomeFeedMode = mode;
    } else {
      const { error } = await client.from('discovery_preferences').upsert({
        account_id: data.user.id,
        home_mode: mode,
      }, { onConflict: 'account_id' });
      if (error && !isMissingDiscoveryTable(error)) throw new Error(error.message);
      if (error) guestHomeFeedMode = mode;
    }
    const context = await discoveryContext('home');
    return rankHomeProjects(context.availableProjects, context.sphere, new Date(), mode);
  },
  async getDiscoverSections(mode: ExplorationMode) {
    const context = await discoveryContext();
    return rankDiscoverProjects(context.availableProjects, context.sphere, mode);
  },
  async recordProjectSignal(projectId, kind) {
    const view = await supabaseProjectService.getProjectView(projectId);
    const topics = view.project.relevance?.topicKeys ?? [];
    if (topics.length === 0) return;
    const { error } = await requireSupabase().rpc('record_discovery_signal', {
      p_topic_keys: topics,
      p_signal_kind: kind,
    });
    if (error) throw new Error(isMissingDiscoveryTable(error) ? 'Discovery preferences are not available yet.' : error.message);
  },
  async getFeaturedProject() {
    return (await this.getHomeDiscovery()).featured;
  },
  async listFeedProjects() {
    return (await this.getHomeDiscovery()).projects;
  },
  async listLocationProjects(locationId) {
    const city = cities.find((entry) => toLocationId(entry.name) === locationId);
    if (!city) return [];
    const { data, error } = await requireSupabase()
      .from('profiles')
      .select('id,location')
      .eq('is_private', false)
      .limit(500);
    if (error) throw new Error(error.message);
    const profileIds = ((data ?? []) as unknown as Array<Pick<ProfileRow, 'id' | 'location'>>)
      .filter((row) => creatorLocationMatches(row.location, city.name))
      .map((row) => row.id);
    const projectIds = await projectIdsForProfiles(profileIds);
    return projectViewsForIds(projectIds);
  },
  async listAccountsToExplore(): Promise<FeedCreator[]> {
    const { data, error } = await requireSupabase()
      .from('profiles')
      .select('id,name,headline,avatar_url,location')
      .eq('is_private', false)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throwProfileError(error, 'Creators could not be loaded.');
    return ((data ?? []) as unknown as Array<Pick<ProfileRow, 'id' | 'name' | 'headline' | 'avatar_url' | 'location'>>)
      .map((row) => ({ id: row.id, name: row.name, kind: row.headline, avatar: row.avatar_url, location: row.location, isPrivate: false }));
  },
};

export const supabaseSearchService: SearchService = {
  async search(query) {
    const term = query.trim().replace(/[^\p{L}\p{N}\s_-]/gu, ' ').replace(/\s+/g, ' ');
    if (!term) return [];
    const client = requireSupabase();
    const explicitLocation = parseExplicitLocationIntent(term);
    const normalized = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const locationWords = new Set(normalized(explicitLocation?.label ?? '').split(/\s+/).filter(Boolean));
    const semanticTokens = normalized(term).split(/\s+/).filter((token) => token.length > 1 && token !== 'in' && token !== 'near' && !locationWords.has(token));
    const [profiles, projects, categories] = await Promise.all([
      client.from('profiles').select('*').eq('is_private', false).limit(100),
      client.from('projects').select('*').eq('is_hidden', false).order('published_at', { ascending: false }).limit(120),
      client.from('portfolio_categories').select('id, label').eq('is_hidden', false).limit(240),
    ]);
    if (profiles.error) throw new Error(profiles.error.message);
    if (projects.error) throw new Error(projects.error.message);
    if (categories.error) throw new Error(categories.error.message);
    const profileRows = (profiles.data ?? []) as unknown as ProfileRow[];
    const projectRows = (projects.data ?? []) as unknown as ProjectRow[];
    const categoryRows = (categories.data ?? []) as unknown as Array<Pick<CategoryRow, 'id' | 'label'>>;
    const publicProfileIds = new Set(profileRows.map((row) => row.id));
    const categoryLabels = new Map(categoryRows.map((row) => [row.id, row.label]));
    const profilesById = new Map(profileRows.map((row) => [row.id, row]));
    const matchesSemantic = (value: string) => {
      const words = normalized(value).split(/\s+/).filter(Boolean);
      return semanticTokens.length === 0 || semanticTokens.every((token) => words.some((word) => word === token || (token.length >= 4 && word.startsWith(token))));
    };
    const matchingProfiles = profileRows.filter((row) => {
      const text = `${row.name} ${row.handle} ${row.headline} ${row.location}`;
      if (explicitLocation && !creatorLocationMatches(row.location, explicitLocation.label)) return false;
      return matchesSemantic(text);
    }).slice(0, 20);
    const matchingProjects = projectRows.filter((row) => {
      if (!publicProfileIds.has(row.profile_id)) return false;
      if (!categoryLabels.has(row.category_id)) return false;
      const categoryLabel = categoryLabels.get(row.category_id) ?? '';
      const topicLabels = (row.topic_keys ?? []).map((topic) => topic.replace(/[-_]+/g, ' ')).join(' ');
      const creator = profilesById.get(row.profile_id);
      const placeMatches = !explicitLocation || Boolean(creator && creatorLocationMatches(creator.location, explicitLocation.label));
      return placeMatches && matchesSemantic(`${row.title} ${row.summary} ${categoryLabel} ${topicLabels}`);
    }).slice(0, 30);
    const normalizedTerm = normalized(term);
    const locationRows = cities.filter((city) => {
      const cityName = normalized(city.name);
      if (explicitLocation) return cityName === normalized(explicitLocation.label);
      const words = cityName.split(' ');
      return cityName === normalizedTerm || words.some((word) => word === normalizedTerm || (normalizedTerm.length >= 4 && word.startsWith(normalizedTerm)));
    }).slice(0, 20);
    return [
      ...matchingProfiles.map((row) => ({ id: row.id, kind: 'profile' as const, title: row.name, subtitle: `@${row.handle}`, avatar: row.avatar_url })),
      ...matchingProjects.map((row) => ({ id: row.id, kind: 'project' as const, title: row.title, subtitle: row.summary || categoryLabels.get(row.category_id) })),
      ...locationRows.map((city) => ({ id: toLocationId(city.name), kind: 'location' as const, title: city.name, subtitle: getCountryCode(city.name) })),
    ];
  },
};
