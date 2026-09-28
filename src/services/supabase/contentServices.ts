import { readVideoPlayback } from '../../features/media/videoPlayback';
import { withProjectLocation } from '../../features/publishing/projectLocation';
import { resolveStoredMediaKind } from '../../features/publishing/assetTypes';
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
import { multipartSource, readMultipartSpec, removeStoredMedia } from './multipartMedia';
import { typefaces } from '../../data/typefaces';
import { MAX_PAGES_PER_ROW, MIN_PAGES_PER_ROW } from '../../features/projects/pageLayout';
import { cities } from '../../data/cities';
import { getCountryCode } from '../../data/countryCodes';
import { toLocationId } from '../../utils/location';
import type { DiscoverySignal, ExplorationMode, GeographicScope, HomeFeedMode, ProjectFeedCursor, ProjectRelevance } from '../../types/discovery';
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
import { signedMediaUrls } from './mediaUrlCache';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';
import { createProfileHandle } from '../../utils/profileHandle';
import { normalizePublicAppearance } from '../../utils/publicAppearance';
import { MAX_PROJECT_GRID_COLUMNS, MIN_PROJECT_GRID_COLUMNS, normalizeProjectGridColumns } from '../../utils/projectGridDensity';

export const PROJECT_MEDIA_BUCKET = 'project-media';
export const AVATAR_BUCKET = 'avatars';

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
  public_appearance?: unknown;
  project_grid_columns?: number;
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
    multipart?: unknown;
    durationSeconds?: unknown;
    pageCount?: unknown;
    widthPixels?: unknown;
    heightPixels?: unknown;
    aspectRatio?: unknown;
    processingError?: unknown;
    failedPage?: unknown;
    coverPageNumber?: unknown;
    coverFrame?: unknown;
    renderedPages?: unknown;
  };
  const metadata: NonNullable<ProjectAttachment['metadata']> = {};
  const multipart = readMultipartSpec(candidate.multipart);
  if (multipart) metadata.multipart = multipart;
  if (typeof candidate.durationSeconds === 'number') metadata.durationSeconds = candidate.durationSeconds;
  if (typeof candidate.pageCount === 'number') metadata.pageCount = candidate.pageCount;
  if (typeof candidate.widthPixels === 'number') metadata.widthPixels = candidate.widthPixels;
  if (typeof candidate.heightPixels === 'number') metadata.heightPixels = candidate.heightPixels;
  if (typeof candidate.aspectRatio === 'number') metadata.aspectRatio = candidate.aspectRatio;
  if (typeof candidate.processingError === 'string') metadata.processingError = candidate.processingError;
  if (typeof candidate.failedPage === 'number') metadata.failedPage = candidate.failedPage;
  if (typeof candidate.coverPageNumber === 'number' && Number.isInteger(candidate.coverPageNumber) && candidate.coverPageNumber > 0) {
    metadata.coverPageNumber = candidate.coverPageNumber;
  }
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
  const candidate = value as { typefaceId?: unknown; pagesPerRow?: unknown };
  if (typeof candidate.typefaceId !== 'string') return undefined;
  const pagesPerRow = typeof candidate.pagesPerRow === 'number'
    && Number.isInteger(candidate.pagesPerRow)
    && candidate.pagesPerRow >= MIN_PAGES_PER_ROW
    && candidate.pagesPerRow <= MAX_PAGES_PER_ROW
    ? candidate.pagesPerRow
    : undefined;
  return {
    typefaceId: candidate.typefaceId,
    ...(pagesPerRow ? { pagesPerRow } : {}),
  };
}

function throwProfileError(error: { code?: string; message: string }, fallback: string): never {
  if (error.code === '23505' && error.message.includes('profiles_handle_key')) {
    throw new ProfileServiceError('handle_taken', 'That handle is already taken.');
  }
  if (error.code === '42501') {
    throw new ProfileServiceError('permission_denied', 'You do not have permission to change that profile.');
  }
  throw new ProfileServiceError('network', error.message || fallback);
}

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  return signedMediaUrls(PROJECT_MEDIA_BUCKET, paths);
}

async function hydrateProjects(
  projectRows: ProjectRow[],
  categoryRows: Array<Pick<CategoryRow, 'id' | 'label'>>,
  attachmentRows: AttachmentRow[],
  mode: 'full' | 'cover' = 'full',
): Promise<Map<string, Project>> {
  if (mode === 'cover') {
    // Feed cards need one selected PDF page, not signed URLs for every page.
    attachmentRows = attachmentRows.map((row) => {
      if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) return row;
      const metadata = row.metadata as Record<string, unknown>;
      const pageNumber = typeof metadata.coverPageNumber === 'number' && Number.isInteger(metadata.coverPageNumber) && metadata.coverPageNumber > 0 ? metadata.coverPageNumber : 1;
      return { ...row, metadata: { ...metadata, renderedPages: Array.isArray(metadata.renderedPages)
        ? metadata.renderedPages.filter((page) => page?.attachmentId === row.id && page?.withinDocumentIndex === pageNumber) : [] } };
    });
  }
  const urls = await signedUrls(attachmentRows.flatMap((row) => {
    const playback = readVideoPlayback(row.metadata, row.storage_path, row.project_id);
    return [row.storage_path, ...renderedPagePaths(row.metadata), ...(playback ? [playback.storagePath] : [])];
  }));
  const attachmentsByProject = new Map<string, ProjectAttachment[]>();
  await Promise.all(attachmentRows.map(async (row) => {
    let metadata = asMetadata(row.metadata, urls);
    const playback = readVideoPlayback(row.metadata, row.storage_path, row.project_id);
    if (playback) {
      let playbackUrl = urls.get(playback.storagePath) ?? null;
      if (playback.multipart) {
        try { playbackUrl = await multipartSource(playback.storagePath, playback.multipart, 'video.mp4', 'video/mp4'); }
        catch { playbackUrl = null; }
      }
      metadata = { ...metadata, playbackVideo: { ...playback, sourceUrl: playbackUrl } };
    }
    let sourceUrl = urls.get(row.storage_path) ?? null;
    if (metadata?.multipart && !(mode === 'cover' && metadata.renderedPages?.some((page) => page.sourceUrl))) {
      try {
        sourceUrl = await multipartSource(row.storage_path, metadata.multipart, row.file_name, row.mime_type);
      } catch {
        // An unavailable individual file must not prevent the profile/feed from
        // loading, and its JSON manifest must never be shown as the original.
        sourceUrl = null;
      }
    }
    const attachment: ProjectAttachment = {
      id: row.id,
      kind: playback ? 'video' : resolveStoredMediaKind(row.kind as ProjectAttachment['kind'], row.file_name, row.mime_type),
      fileName: row.file_name,
      displayName: row.display_name,
      extension: row.extension,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      typeLabel: row.type_label,
      sourceUrl,
      storagePath: row.storage_path,
      status: row.status as ProjectAttachment['status'],
      isCover: row.is_cover,
      order: row.position,
      metadata,
    };
    attachmentsByProject.set(row.project_id, [
      ...(attachmentsByProject.get(row.project_id) ?? []),
      attachment,
    ]);
  }));
  attachmentsByProject.forEach((attachments) => attachments.sort((a, b) => a.order - b.order));

  const categoryLabels = new Map(categoryRows.map((row) => [row.id, row.label]));
  return new Map(projectRows.map((row) => {
    const attachments = attachmentsByProject.get(row.id) ?? [];
    const cover = attachments.find((item) => item.isCover && (item.metadata?.playbackVideo?.sourceUrl || item.sourceUrl))
      ?? attachments.find((item) => item.kind === 'image' && item.sourceUrl)
      ?? attachments[0];
    const coverPreview = mode === 'cover' && cover?.kind === 'document'
      ? cover.metadata?.renderedPages?.find((page) => page.sourceUrl)
      : undefined;
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
      cover: coverPreview?.sourceUrl ?? cover?.metadata?.playbackVideo?.sourceUrl ?? cover?.sourceUrl ?? '',
      coverAlt: row.title,
      coverKind: coverPreview ? undefined : cover?.kind === 'video' ? 'video' : cover?.kind === 'document' ? 'document' : undefined,
      coverAspectRatio: coverPreview?.aspectRatio ?? (cover?.metadata?.widthPixels && cover.metadata.heightPixels
        ? cover.metadata.widthPixels / cover.metadata.heightPixels
        : undefined),
      coverFrame: cover?.metadata?.coverFrame,
      coverPageNumber: cover?.kind === 'document' ? cover.metadata?.coverPageNumber : undefined,
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
  let profileQuery = client.from('profiles').select('*').order('created_at', { ascending: false });
  if (profileId) profileQuery = profileQuery.eq('id', profileId);
  // Local session identity is only a presentation hint; database RLS continues
  // to authorize every profile/project row. Avoid a separate Auth HTTP request.
  const [{ data: authData }, { data: profileData, error: profileError }] = await Promise.all([
    client.auth.getSession(),
    profileQuery,
  ]);
  const viewerAccountId = authData.session?.user.id ?? null;
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
    publicAppearance: normalizePublicAppearance(row.public_appearance),
    projectGridColumns: normalizeProjectGridColumns(row.project_grid_columns),
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
  // Project RLS and category RLS are separate. A hidden category must not become
  // visible merely because its project id is known. Owners can read their own
  // hidden categories through the existing category policy.
  const readableCategories = new Set(categoryRows.map((row) => row.id));
  const readableCreators = new Set(creatorRows.map((row) => row.id));
  const readableProjects = projectRows.filter((row) => readableCategories.has(row.category_id) && readableCreators.has(row.profile_id));
  const readableIds = new Set(readableProjects.map((row) => row.id));
  const attachmentRows = ((attachmentResult.data ?? []) as unknown as AttachmentRow[]).filter((row) => readableIds.has(row.project_id));
  const projectsById = await hydrateProjects(readableProjects, categoryRows, attachmentRows);
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

async function uploadAvatar(accountId: string, input: CreateProfileInput['avatar'], creationKey?: string): Promise<string> {
  if (!input) return '';
  const stableKey = creationKey && /^[a-f0-9-]{36}$/i.test(creationKey) ? creationKey : null;
  // A retry reuses identical bytes; a different selection cannot overwrite a
  // profile another tab has already completed with the same registration id.
  const digest = stableKey ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await input.file.arrayBuffer())))
    .map(byte => byte.toString(16).padStart(2, '0')).join('') : null;
  const path = stableKey ? `${accountId}/registration-${stableKey}-${digest}` : `${accountId}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
  const bucket = requireSupabase().storage.from(AVATAR_BUCKET);
  const { error } = await bucket.upload(path, input.file, {
    contentType: input.file.type || 'application/octet-stream',
    upsert: Boolean(stableKey),
  });
  if (error) throw new ProfileServiceError('network', `Your avatar could not be uploaded: ${error.message}`);
  return bucket.getPublicUrl(path).data.publicUrl;
}

export const supabaseProfileService: ProfileService = {
  async getProjectGridLayout(profileId) {
    const { data, error } = await requireSupabase().from('profiles').select('id,project_grid_columns').eq('id', profileId).single();
    if (error) throwProfileError(error, 'Your project layout could not be loaded.');
    return { id: data.id, projectGridColumns: normalizeProjectGridColumns(data.project_grid_columns) };
  },

  async updateProjectGridLayout(profileId, columns) {
    if (!Number.isInteger(columns) || columns < MIN_PROJECT_GRID_COLUMNS || columns > MAX_PROJECT_GRID_COLUMNS) {
      throw new ProfileServiceError('invalid_input', `Projects per row must be between ${MIN_PROJECT_GRID_COLUMNS} and ${MAX_PROJECT_GRID_COLUMNS}.`);
    }
    const client = requireSupabase();
    const { data: authData } = await client.auth.getSession();
    if (!authData.session?.user) throw new ProfileServiceError('permission_denied', 'Sign in before changing your project layout.');
    const { data, error } = await client.from('profiles').update({ project_grid_columns: columns })
      .eq('id', profileId).eq('account_id', authData.session.user.id).select('id,project_grid_columns').single();
    if (error) throwProfileError(error, 'Your project layout could not be saved.');
    return { id: data.id, projectGridColumns: normalizeProjectGridColumns(data.project_grid_columns) };
  },

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
    const automaticHandle = input.handle === undefined;
    let handle = automaticHandle ? createProfileHandle(input.name) : normalizeHandle(input.handle ?? '');
    if (!handle || !input.name.trim()) {
      throw new ProfileServiceError('invalid_input', 'Enter a profile name before continuing.');
    }
    const avatarUrl = await uploadAvatar(accountId, input.avatar, input.creationKey);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await requireSupabase()
        .from('profiles')
        .insert({
          account_id: accountId,
          name: input.name.trim(),
          handle,
          headline: input.headline?.trim() ?? '',
          location: input.location?.trim() ?? '',
          avatar_url: avatarUrl,
          is_private: input.isPrivate === true,
          ...(input.publicAppearance ? { public_appearance: normalizePublicAppearance(input.publicAppearance) } : {}),
        })
        .select('id')
        .single();
      if (error?.code === '23505' && automaticHandle && error.message.includes('profiles_handle_key') && attempt < 2) {
        handle = createProfileHandle(input.name);
        continue;
      }
      if (error?.code === '23505' && error.message.includes('profiles_account_id_key')) {
        throw new ProfileServiceError('invalid_input', 'This account already has a profile. Open your profile to continue.');
      }
      if (error) throwProfileError(error, 'Your creator profile could not be created.');
      const row = data as unknown as { id: string };
      return {
        profile: await this.getProfile(row.id),
        accountId,
        avatarPersisted: Boolean(input.avatar && avatarUrl),
      };
    }
    throw new ProfileServiceError('network', 'Your profile could not be created. Please try again.');
  },

  async updateProfile(profileId, input) {
    const { data: authData } = await requireSupabase().auth.getSession();
    if (!authData.session?.user) throw new ProfileServiceError('permission_denied', 'Sign in before changing your profile.');
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.headline !== undefined) update.headline = input.headline.trim();
    if (input.location !== undefined) update.location = input.location.trim();
    if (input.handle !== undefined) update.handle = normalizeHandle(input.handle);
    if (input.links !== undefined) update.links = input.links;
    if (input.socialLinks !== undefined) update.social_links = input.socialLinks;
    if (input.isPrivate !== undefined) update.is_private = input.isPrivate;
    if (input.projectGridColumns !== undefined) {
      if (!Number.isInteger(input.projectGridColumns) || input.projectGridColumns < MIN_PROJECT_GRID_COLUMNS || input.projectGridColumns > MAX_PROJECT_GRID_COLUMNS) {
        throw new ProfileServiceError('invalid_input', `Projects per row must be between ${MIN_PROJECT_GRID_COLUMNS} and ${MAX_PROJECT_GRID_COLUMNS}.`);
      }
      update.project_grid_columns = input.projectGridColumns;
    }
    if (input.publicAppearance !== undefined) {
      const appearance = normalizePublicAppearance(input.publicAppearance);
      if (!appearance) throw new ProfileServiceError('invalid_input', 'Choose a valid appearance.');
      update.public_appearance = appearance;
    }
    if (input.avatar) update.avatar_url = await uploadAvatar(authData.session.user.id, input.avatar);
    if (Object.keys(update).length === 0) return this.getProfile(profileId);
    const { error } = await requireSupabase().from('profiles').update(update).eq('id', profileId).eq('account_id', authData.session.user.id).select('id').single();
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
    const { error: rpcError } = await client.rpc('save_portfolio_arrangement', {
      p_profile_id: profileId,
      p_category_order: arrangement.categoryOrder,
      p_hidden_category_ids: arrangement.hiddenCategoryIds,
      p_category_icons: arrangement.categoryIcons,
    });
    if (!rpcError) return;
    // Existing deployments keep their proven write path until the reviewed
    // atomic RPC migration is applied. Never retry a permission/write failure.
    if (rpcError.code !== 'PGRST202' && rpcError.code !== '42883') throw new Error(rpcError.message);
    const writes = arrangement.categoryOrder.map((categoryId, position) =>
      client
        .from('portfolio_categories')
        .update({
          position,
          is_hidden: arrangement.hiddenCategoryIds.includes(categoryId),
          icon_name: arrangement.categoryIcons[categoryId] ?? 'FolderIcon',
        })
        .eq('id', categoryId)
        .eq('profile_id', profileId).select('id').single(),
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
    const { data, error } = await requireSupabase()
      .from('portfolio_categories')
      .update({ label: label.trim() })
      .eq('id', categoryId)
      .eq('profile_id', profileId).select('id,label,icon_name,format,blurb').single();
    if (error) throw new CategoryMutationError(error.code === '23505' ? 'duplicate_label' : 'unknown', error.message);
    const row = data as unknown as CategoryRow;
    return { id: row.id, label: row.label, iconName: row.icon_name, format: row.format as CategoryFormat, blurb: row.blurb };
  },

  async setCategoryIcon(profileId, categoryId, iconName) {
    const { data, error } = await requireSupabase()
      .from('portfolio_categories')
      .update({ icon_name: iconName })
      .eq('id', categoryId)
      .eq('profile_id', profileId).select('id,label,icon_name,format,blurb').single();
    if (error) throw new CategoryMutationError('unknown', error.message);
    const row = data as unknown as CategoryRow;
    return { id: row.id, label: row.label, iconName: row.icon_name, format: row.format as CategoryFormat, blurb: row.blurb };
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
    return (await this.getProjectView(projectId)).project;
  },

  async getProjectView(projectId) {
    const view = (await loadRequestedProjectViews([projectId]))[0];
    if (!view) throw new ProjectMutationError('not_found', 'That project could not be found.');
    return view;
  },

  async listProjectViews(projectIds) {
    return loadRequestedProjectViews(projectIds);
  },

  async listProjects(profileId, categoryId) {
    const projects = (await supabaseProfileService.getProfile(profileId)).projects;
    return categoryId ? projects.filter((project) => project.categoryId === categoryId) : projects;
  },

  async getProjectDesign(projectId) {
    const designs = await this.listProjectDesigns([projectId]);
    if (!designs[projectId]) throw new ProjectMutationError('not_found', 'That project could not be found.');
    return designs[projectId];
  },

  async listProjectDesigns(projectIds) {
    if (projectIds.length === 0) return {};
    const client = requireSupabase();
    const { data, error } = await client.from('projects').select('id,category_id,design').in('id', [...new Set(projectIds)]);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<Pick<ProjectRow, 'id' | 'category_id' | 'design'>>;
    if (rows.length === 0) return {};
    const categories = await client.from('portfolio_categories').select('id').in('id', [...new Set(rows.map((row) => row.category_id))]);
    if (categories.error) throw new Error(categories.error.message);
    const readableIds = new Set((categories.data ?? []).map((row) => row.id));
    return Object.fromEntries(rows.filter((row) => readableIds.has(row.category_id)).map((row) => [row.id, asDesign(row.design) ?? { typefaceId: 'default' }]));
  },

  async updateProjectDesign(projectId, design) {
    if (!typefaces.some((typeface) => typeface.id === design.typefaceId)) {
      throw new ProjectMutationError('invalid_metadata', 'That typeface is not available.');
    }
    if (design.pagesPerRow !== undefined && (!Number.isInteger(design.pagesPerRow) || design.pagesPerRow < MIN_PAGES_PER_ROW || design.pagesPerRow > MAX_PAGES_PER_ROW)) {
      throw new ProjectMutationError('invalid_metadata', `Pages per row must be between ${MIN_PAGES_PER_ROW} and ${MAX_PAGES_PER_ROW}.`);
    }
    const { error } = await requireSupabase().from('projects').update({ design }).eq('id', projectId).select('id').single();
    if (error) throw new ProjectMutationError(error.code === '42501' ? 'permission_denied' : 'network', error.message);
    return design;
  },

  async saveProfileProjectOrder(profileId, projectIds) {
    const client = requireSupabase();
    const { error: rpcError } = await client.rpc('save_profile_project_order', {
      p_profile_id: profileId,
      p_project_ids: projectIds,
    });
    if (!rpcError) return;
    if (rpcError.code !== 'PGRST202' && rpcError.code !== '42883') throw new Error(rpcError.message);
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
      .eq('profile_id', profileId).select('id').single()));
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
    const { error: rpcError } = await client.rpc('save_project_arrangement', {
      p_profile_id: profileId,
      p_category_id: categoryId,
      p_project_order: arrangement.projectOrder,
      p_hidden_project_ids: arrangement.hiddenProjectIds,
      p_pinned_project_ids: arrangement.pinnedProjectIds,
    });
    if (!rpcError) return;
    if (rpcError.code !== 'PGRST202' && rpcError.code !== '42883') throw new Error(rpcError.message);
    const { data: profileData, error: profileError } = await client
      .from('projects')
      .select('id,category_id,position')
      .eq('profile_id', profileId)
      .order('position');
    if (profileError) throw new Error(profileError.message);
    const profileRows = (profileData ?? []) as unknown as Array<{ id: string; category_id: string; position: number }>;
    const categoryRows = profileRows.filter((row) => row.category_id === categoryId);
    const categoryIds = categoryRows.map((row) => row.id);
    if (arrangement.projectOrder.length !== categoryIds.length || new Set(arrangement.projectOrder).size !== categoryIds.length || arrangement.projectOrder.some((projectId) => !categoryIds.includes(projectId))) {
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
        return client.from('projects').update(update).eq('id', projectId).eq('profile_id', profileId).select('id').single();
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
      }).eq('id', projectId).eq('profile_id', profileId).eq('category_id', categoryId).select('id').single(),
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
    const relevance = withProjectLocation(input.relevance ?? projectRelevanceForPersistence(input.metadata, String((categoryResult.data as { label?: string }).label ?? '')), input.location);
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
    const needsLegacyRpc = extended.error && (extended.error.code === 'PGRST202' || extended.error.message.includes('function'));
    if (needsLegacyRpc && input.location !== undefined) {
      throw new PublishServiceError('network', 'Your project location could not be saved. Your draft is still here. Please try again later.');
    }
    const result = needsLegacyRpc
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
    let cleanupFailed = false;
    try { await removeStoredMedia(removedStoragePaths); } catch { cleanupFailed = true; }
    return {
      project: await this.getProject(input.projectId),
      mediaPersisted: true,
      sessionOnly: false,
      removedAttachmentIds: result?.removedAttachmentIds ?? [],
      message: cleanupFailed
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
      item.metadata?.playbackVideo?.storagePath,
      ...(item.metadata?.renderedPages ?? []).map((page) => page.storagePath),
    ]).filter((path): path is string => Boolean(path));
    let storageDeleted = paths.length === 0;
    if (paths.length > 0) {
      try { await removeStoredMedia(paths); storageDeleted = true; } catch { storageDeleted = false; }
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

type FeedRow = {
  project: ProjectRow;
  creator: Pick<ProfileRow, 'id' | 'name' | 'headline' | 'avatar_url' | 'location' | 'is_private'>;
  category: Pick<CategoryRow, 'id' | 'label'>;
  cover: AttachmentRow | null;
};

async function readFeedPage(scope: 'global' | 'home', cursor?: ProjectFeedCursor, limit = 30) {
  const { data, error } = await requireSupabase().rpc('project_feed_page', {
    p_scope: scope,
    p_before_date: cursor?.publishedAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit + 1,
  });
  // A frontend release can precede the separately approved SQL migration.
  // Other errors remain visible; permission/network failures are not fallbacks.
  if (error?.code === 'PGRST202' || error?.code === '42883') return null;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FeedRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1]?.project;
  return { rows: page, nextCursor: rows.length > limit && last ? { publishedAt: last.published_at, id: last.id } : null };
}

async function feedViews(rows: FeedRow[], withCovers: boolean): Promise<ProjectView[]> {
  const projects = await hydrateProjects(rows.map((row) => row.project), rows.map((row) => row.category),
    withCovers ? rows.flatMap((row) => row.cover ? [row.cover] : []) : [], 'cover');
  return rows.map((row) => {
    const project = projects.get(row.project.id);
    if (!project) throw new Error('This project could not be loaded. Please try again.');
    return { project, creator: { id: row.creator.id, name: row.creator.name, kind: row.creator.headline,
      avatar: row.creator.avatar_url, location: row.creator.location, isPrivate: row.creator.is_private } };
  });
}

async function discoveryContext(scope: 'global' | 'home' = 'global', cursor?: ProjectFeedCursor) {
  const client = requireSupabase();
  const { data: authData } = await client.auth.getSession();
  const accountId = authData.session?.user.id ?? null;
  if (!accountId) {
    // Global Search remains public. Home is account-specific and therefore has
    // no invented fallback content for a guest.
    const page = scope === 'global' ? await readFeedPage(scope, cursor, 120) : { rows: [], nextCursor: null };
    const projectIds = !page && scope === 'global' ? await latestProjectIds(120) : [];
    const availableProjects = page ? await feedViews(page.rows, false) : await projectViewsForIds(projectIds);
    return {
      availableProjects,
      feedRows: page?.rows ?? null,
      nextCursor: page?.nextCursor ?? null,
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

  const [viewerRow, followResult, engagementResult, signalResult, preferenceResult, page] = await Promise.all([
    client.from('profiles').select('id,location').eq('account_id', accountId).maybeSingle(),
    client.from('profile_follows').select('target_profile_id').eq('follower_account_id', accountId).eq('status', 'following'),
    client.from('project_engagement').select('project_id,kind,created_at').eq('account_id', accountId),
    client.from('discovery_signals').select('topic_key,interest_weight,curiosity_weight,last_interest_at,last_curiosity_at').eq('account_id', accountId),
    client.from('discovery_preferences').select('home_mode').eq('account_id', accountId).maybeSingle(),
    readFeedPage(scope, cursor, scope === 'home' ? 30 : 120),
  ]);
  if (viewerRow.error) throw new Error(viewerRow.error.message);
  if (followResult.error) throw new Error(followResult.error.message);
  if (engagementResult.error) throw new Error(engagementResult.error.message);
  if (signalResult.error && !isMissingDiscoveryTable(signalResult.error)) throw new Error(signalResult.error.message);
  if (preferenceResult.error && !isMissingDiscoveryTable(preferenceResult.error)) throw new Error(preferenceResult.error.message);
  const viewerProfile = viewerRow.data as unknown as Pick<Profile, 'id' | 'location'> | null;
  const viewerId = viewerProfile?.id;
  const followedCreatorIds = ((followResult.data ?? []) as unknown as Array<{ target_profile_id: string }>).map((row) => row.target_profile_id);
  // Search can stay bounded to the recent global discovery pool. Home instead
  // asks the indexed project table for the viewer and every followed creator,
  // so older work and multiple projects from one creator are not silently lost.
  const projectIds = page ? [] : scope === 'home'
    ? await projectIdsForProfiles([...(viewerId ? [viewerId] : []), ...followedCreatorIds])
    : await latestProjectIds(120);
  const availableProjects = page ? await feedViews(page.rows, scope === 'home') : await projectViewsForIds(projectIds);
  // Ranking only needs identity and location. Reloading the complete portfolio
  // here would repeat projects, attachments and signing after the feed is ready.
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
    feedRows: page?.rows ?? null,
    nextCursor: page?.nextCursor ?? null,
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
  async getHomeDiscovery(cursor) {
    const context = await discoveryContext('home', cursor);
    return { ...rankHomeProjects(context.availableProjects, context.sphere, new Date(), context.homeMode), nextCursor: context.nextCursor };
  },
  async setHomeFeedMode(mode) {
    const client = requireSupabase();
    const { data } = await client.auth.getSession();
    if (!data.session?.user) {
      guestHomeFeedMode = mode;
    } else {
      const { error } = await client.from('discovery_preferences').upsert({
        account_id: data.session.user.id,
        home_mode: mode,
      }, { onConflict: 'account_id' });
      if (error && !isMissingDiscoveryTable(error)) throw new Error(error.message);
      if (error) guestHomeFeedMode = mode;
    }
    const context = await discoveryContext('home');
    return { ...rankHomeProjects(context.availableProjects, context.sphere, new Date(), mode), nextCursor: context.nextCursor };
  },
  async getDiscoverSections(mode: ExplorationMode) {
    const context = await discoveryContext();
    const sections = rankDiscoverProjects(context.availableProjects, context.sphere, mode);
    if (!context.feedRows) return sections;
    const selected = [...sections.yourWorld, ...sections.adjacent, ...sections.outside];
    const ids = new Set(selected.map((view) => view.project.id));
    const hydrated = new Map((await feedViews(context.feedRows.filter((row) => ids.has(row.project.id)), true))
      .map((view) => [view.project.id, view]));
    const withCovers = (views: typeof sections.yourWorld) => views.map((view) => ({ ...view, ...hydrated.get(view.project.id) }));
    return { ...sections, yourWorld: withCovers(sections.yourWorld), adjacent: withCovers(sections.adjacent), outside: withCovers(sections.outside) };
  },
  async recordProjectSignal(projectId, kind) {
    const client = requireSupabase();
    const { data, error: projectError } = await client.from('projects').select('title,summary,topic_keys,category_id').eq('id', projectId).single();
    if (projectError) throw new ProjectMutationError('not_found', 'That project could not be found.');
    const row = data as unknown as Pick<ProjectRow, 'title' | 'summary' | 'topic_keys' | 'category_id'>;
    const category = await client.from('portfolio_categories').select('label').eq('id', row.category_id).single();
    if (category.error) throw new ProjectMutationError('not_found', 'That project could not be found.');
    // Preserve inferred topics for older records without hydrating any media.
    const topics = deriveProjectRelevance({ title: row.title, summary: row.summary, categoryLabel: category.data.label, stored: { topicKeys: row.topic_keys ?? [] } }).topicKeys;
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
    const normalizedTerm = normalized(term);
    const locationRows = cities.filter((city) => {
      const cityName = normalized(city.name);
      if (explicitLocation) return cityName === normalized(explicitLocation.label);
      const words = cityName.split(' ');
      return cityName === normalizedTerm || words.some((word) => word === normalizedTerm || (normalizedTerm.length >= 4 && word.startsWith(normalizedTerm)));
    }).slice(0, 20);
    const locationResults = locationRows.map((city) => ({ id: toLocationId(city.name), kind: 'location' as const, title: city.name, subtitle: getCountryCode(city.name) }));
    const search = await client.rpc('search_public_content', { p_terms: semanticTokens, p_location: explicitLocation?.label ?? null });
    if (!search.error) {
      const rows = (search.data ?? []) as unknown as Array<{ id: string; kind: 'profile' | 'project'; title: string; subtitle: string; avatar: string | null }>;
      return [...rows.map((row) => ({ ...row, avatar: row.avatar ?? undefined })), ...locationResults];
    }
    if (search.error.code !== 'PGRST202' && search.error.code !== '42883') throw new Error(search.error.message);
    // Compatibility until the separately approved search migration is applied.
    const [profiles, projects, categories] = await Promise.all([
      client.from('profiles').select('id,name,handle,headline,location,avatar_url').eq('is_private', false).limit(100),
      client.from('projects').select('id,profile_id,category_id,title,summary,topic_keys').eq('is_hidden', false).order('published_at', { ascending: false }).limit(120),
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
    return [
      ...matchingProfiles.map((row) => ({ id: row.id, kind: 'profile' as const, title: row.name, subtitle: `@${row.handle}`, avatar: row.avatar_url })),
      ...matchingProjects.map((row) => ({ id: row.id, kind: 'project' as const, title: row.title, subtitle: row.summary || categoryLabels.get(row.category_id) })),
      ...locationResults,
    ];
  },
};
