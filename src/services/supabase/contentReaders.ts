import { readEmployerFields } from '../../features/employer/employer';
import { readCreationDetails } from '../../features/publishing/firstProject';
import { readThenNow, readJourneyCaption } from '../../features/journey/journey';
import { readVideoPlayback } from '../../features/media/videoPlayback';
import { resolveStoredMediaKind } from '../../features/publishing/assetTypes';
import type { ProfileService } from '../interfaces';
import type { CategoryFormat, Profile, ProfileLink, ProfileStat, Project, ProjectAttachment, ProjectDesign } from '../../types/domain';
import type { GeographicScope, ProjectRelevance } from '../../types/discovery';
import { ProfileServiceError } from '../../types/profile';
import { multipartSource, readMultipartSpec } from './multipartMedia';
import { MAX_PAGES_PER_ROW, MIN_PAGES_PER_ROW } from '../../features/projects/pageLayout';
import { deriveProjectRelevance } from '../../domain/discovery/ranking';
import { requireSupabase } from './client';
import { signedMediaUrls } from './mediaUrlCache';
import { publicCoverUrl } from '../../features/media/publicMediaUrl';
import { coverThumbnailWithUrls, readCoverThumbnail } from './coverThumbnailReads';
import { readSharedProfileBundle } from './sharedProfileBundle';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';
import { normalizePublicAppearance } from '../../utils/publicAppearance';
import { normalizeProjectGridColumns } from '../../utils/projectGridDensity';

export const PROJECT_MEDIA_BUCKET = 'project-media';

type ProfileRow = {
  portfolio_headline?: string | null; school?: string; availability?: string; contact_email_public?: boolean; contact_email?: string | null; allow_pdf_download?: boolean; start_here_project_id?: string | null;

  show_journey?: boolean;
  show_outgoing_citations?: boolean;
  show_incoming_citations?: boolean;
  then_now?: unknown;
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
  then_now_caption?: string | null;
  made_in?: string | null;
  field?: string | null;
  story_answers?: unknown;
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
  made_on?: string;
  citation_permitted?: boolean;
  revision: string;
  cover_thumbnail?: unknown;
  topic_keys?: string[];
  content_location?: string | null;
  page_count?: number;
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

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'TP';
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
    return typeof path === 'string' && path && !publicCoverUrl(path) ? [path] : [];
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
        sourceUrl: publicCoverUrl(item.storagePath) || urls.get(item.storagePath) || null,
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

async function signedUrls(paths: string[], singleBatch = false): Promise<Map<string, string>> {
  return signedMediaUrls(PROJECT_MEDIA_BUCKET, paths, 0, singleBatch);
}

async function hydrateProjects(
  projectRows: ProjectRow[],
  categoryRows: Array<Pick<CategoryRow, 'id' | 'label'> & Partial<Pick<CategoryRow, 'is_hidden'>>>,
  attachmentRows: AttachmentRow[],
  mode: 'full' | 'cover' = 'full',
): Promise<Map<string, Project>> {
  const thumbnails = new Map(projectRows.map(row => [row.id, readCoverThumbnail(row.cover_thumbnail, row.profile_id, row.id)]));
  const rawAttachments = new Map(attachmentRows.map(row => [row.id, row]));
  if (mode === 'cover') {
    // Stored bitmap grids never resolve originals, multipart manifests or PDF pages.
    attachmentRows = attachmentRows.filter(row => !thumbnails.get(row.project_id));
    // Feed cards need one selected PDF page, not signed URLs for every page.
    attachmentRows = attachmentRows.map((row) => {
      if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) return row;
      const metadata = row.metadata as Record<string, unknown>;
      const pageNumber = typeof metadata.coverPageNumber === 'number' && Number.isInteger(metadata.coverPageNumber) && metadata.coverPageNumber > 0 ? metadata.coverPageNumber : 1;
      return { ...row, metadata: { ...metadata, renderedPages: Array.isArray(metadata.renderedPages)
        ? metadata.renderedPages.filter((page) => page?.attachmentId === row.id && page?.withinDocumentIndex === pageNumber) : [] } };
    });
  }
  const thumbnailPaths = [...thumbnails.values()].flatMap(thumbnail => thumbnail?.bucket === 'project-media' ? [...thumbnail.variants.map(variant => variant.path), ...(thumbnail.social ? [thumbnail.social.path] : [])] : []);
  const urls = await signedUrls([...thumbnailPaths, ...attachmentRows.flatMap((row) => {
    const playback = readVideoPlayback(row.metadata, row.storage_path, row.project_id);
    return [row.storage_path, ...renderedPagePaths(row.metadata), ...(playback ? [playback.storagePath] : [])];
  })], mode === 'cover');
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
    const thumbnail = thumbnails.get(row.id);
    const thumbnailSize = thumbnail?.variants.find(variant => variant.size === 800);
    const thumbnailSource = thumbnail ? rawAttachments.get(thumbnail.sourceAttachmentId) : undefined;
    const sourceMetadata = thumbnailSource?.metadata && typeof thumbnailSource.metadata === 'object'
      ? thumbnailSource.metadata as Record<string, unknown> : undefined;
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
      tags: row.design && typeof row.design === 'object' && Array.isArray((row.design as { tags?: unknown }).tags)
        ? ((row.design as { tags: unknown[] }).tags).filter((tag): tag is string => typeof tag === 'string') : undefined,
      creationDetails: readCreationDetails(row),
      thenNowCaption: readJourneyCaption(row),
      isPubliclyVisible: !row.is_hidden && categoryRows.some(category => category.id === row.category_id && !category.is_hidden),
      publishedAt: row.published_at,
      madeOn: row.made_on ?? row.published_at.slice(0,10),
      citationPermitted: row.citation_permitted === true,
      isPinned: row.is_pinned,
      relevance: deriveProjectRelevance({
        title: row.title,
        summary: row.summary,
        categoryLabel: categoryLabels.get(row.category_id) ?? '',
        stored: storedRelevance,
      }),
      cover: coverPreview?.sourceUrl ?? cover?.metadata?.playbackVideo?.sourceUrl ?? cover?.sourceUrl ?? '',
      coverAlt: row.title,
      coverThumbnail: thumbnail ? coverThumbnailWithUrls(thumbnail, urls) : undefined,
      coverKind: thumbnailSource?.kind === 'document' ? 'document' : thumbnailSource?.kind === 'video' ? 'video'
        : coverPreview ? undefined : cover?.kind === 'video' ? 'video' : cover?.kind === 'document' ? 'document' : undefined,
      coverAspectRatio: thumbnailSize ? thumbnailSize.width / thumbnailSize.height : coverPreview?.aspectRatio ?? (cover?.metadata?.widthPixels && cover.metadata.heightPixels
        ? cover.metadata.widthPixels / cover.metadata.heightPixels
        : undefined),
      coverFrame: cover?.metadata?.coverFrame,
      coverPageNumber: typeof sourceMetadata?.coverPageNumber === 'number' ? sourceMetadata.coverPageNumber
        : cover?.kind === 'document' ? cover.metadata?.coverPageNumber : undefined,
      pageCount: row.page_count ?? (typeof sourceMetadata?.pageCount === 'number' ? sourceMetadata.pageCount
        : cover?.kind === 'document' ? cover.metadata?.pageCount : undefined),
      attachments,
      design: asDesign(row.design),
      sessionOnly: false,
    };
    return [row.id, project];
  }));
}

async function loadProfiles(profileId?: string, publicOnly = false): Promise<Profile[]> {
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
    .filter((row) => publicOnly ? !row.is_private : Boolean(profileId) || !row.is_private || row.account_id === viewerAccountId);
  if (profileRows.length === 0) return [];

  const profileIds = profileRows.map((row) => row.id);
  const [categoryResult, projectResult] = await Promise.all([
    client.from('portfolio_categories').select('*').in('profile_id', profileIds).order('position'),
    client.from('projects').select('*').in('profile_id', profileIds).order('published_at', { ascending: false }),
  ]);
  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (projectResult.error) throw new Error(projectResult.error.message);
  const categoryRows = ((categoryResult.data ?? []) as unknown as CategoryRow[]).filter(row => !publicOnly || !row.is_hidden);
  const publicCategoryIds = new Set(categoryRows.map(row => row.id));
  const projectRows = ((projectResult.data ?? []) as unknown as ProjectRow[]).filter(row => !publicOnly || (!row.is_hidden && publicCategoryIds.has(row.category_id)));
  const projectIds = projectRows.map((row) => row.id);
  const attachmentResult = projectIds.length > 0
    ? await client.from('project_attachments').select('*').in('project_id', projectIds).order('position')
    : { data: [], error: null };
  if (attachmentResult.error) throw new Error(attachmentResult.error.message);
  const attachmentRows = (attachmentResult.data ?? []) as unknown as AttachmentRow[];
  const projectsById = await hydrateProjects(projectRows, categoryRows, attachmentRows, publicOnly ? 'cover' : 'full');

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

  const ownerIds = !publicOnly ? profileRows.filter(row => row.account_id === viewerAccountId).map(row => row.id) : [];
  const privatePairs = new Map<string, unknown>();
  let privatePairsAvailable = false;
  if (ownerIds.length) {
    const result = await client.from('profile_journey_pairs').select('profile_id,pair').in('profile_id', ownerIds);
    const missing = result.error && ['42P01', 'PGRST205'].includes(result.error.code) && /profile_journey_pairs/.test(result.error.message);
    if (result.error && !missing) throw new Error(result.error.message);
    if (!result.error) {
      privatePairsAvailable = true;
      for (const entry of result.data ?? []) privatePairs.set(entry.profile_id, entry.pair);
    }
  }

  return profileRows.map((row) => {
    const isOwner = !publicOnly && viewerAccountId !== null && row.account_id === viewerAccountId;
    const visibleCategories = categoryRows.filter((category) => category.profile_id === row.id && (isOwner || !category.is_hidden));
    const visibleCategoryIds = new Set(visibleCategories.map((category) => category.id));
    const visibleProjectIds = new Set(projectRows
      .filter((project) => project.profile_id === row.id && (isOwner || (!project.is_hidden && visibleCategoryIds.has(project.category_id))))
      .map((project) => project.id));
    const pair = readThenNow(isOwner && privatePairsAvailable ? privatePairs.get(row.id) : row.then_now);
    return {
    ...readEmployerFields(row),
    startHereProjectId: !row.is_private && (projectsByProfile.get(row.id) ?? []).some(project => project.id === row.start_here_project_id && project.isPubliclyVisible !== false) ? row.start_here_project_id ?? null : null,
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
    showJourney: row.show_journey === true,
    showOutgoingCitations: row.show_outgoing_citations !== false,
    showIncomingCitations: row.show_incoming_citations !== false,
    thenNow: (isOwner || row.show_journey === true) && [pair?.then, pair?.now].every(id => id && visibleProjectIds.has(id)) ? pair : null,
    projectGridColumns: normalizeProjectGridColumns(row.project_grid_columns),
    };
  });
}

export const supabaseProfileReadService: Required<Pick<ProfileService, 'getProjectGridLayout' | 'getProfile' | 'getSharedProfile' | 'getProfileForAccount' | 'listProfiles'>> = {
async getProjectGridLayout(profileId) {
    const { data, error } = await requireSupabase().from('profiles').select('id,project_grid_columns').eq('id', profileId).single();
    if (error) throwProfileError(error, 'Your project layout could not be loaded.');
    return { id: data.id, projectGridColumns: normalizeProjectGridColumns(data.project_grid_columns) };
  },

async getProfile(profileId) {
    const profiles = await loadProfiles(profileId);
    const profile = profiles[0];
    if (!profile) throw new ProfileServiceError('not_found', 'That creator profile could not be found.');
    return profile;
  },

async getSharedProfile(profileId) {
    const response = await readSharedProfileBundle(requireSupabase(), profileId);
    if (response.status === 'unsupported') {
      const profile = (await loadProfiles(profileId, true))[0];
      if (!profile) throw new ProfileServiceError('not_found', 'That creator profile could not be found.');
      return profile;
    }
    if (!response.bundle) throw new ProfileServiceError('not_found', 'That creator profile could not be found.');
    const { profile: row, categories, projects, attachments, citations } = response.bundle;
    const hydrated = await hydrateProjects(projects, categories, attachments, 'cover');
    const ordered = projects.some(project => project.position < 0)
      ? [...projects].sort((a, b) => a.position - b.position || b.published_at.localeCompare(a.published_at)) : projects;
    return {
      ...readEmployerFields(row),
      publicCitationEvents: citations,
      id: row.id, name: row.name, handle: `@${row.handle}`, headline: row.headline, location: row.location,
      initials: deriveInitials(row.name), avatar: row.avatar_url, navHeading: row.nav_heading,
      stats: asStats(row.stats), socialLinks: asStringRecord(row.social_links), links: asLinks(row.links),
      categories: categories.map(category => ({ id: category.id, label: category.label, iconName: category.icon_name, format: category.format as CategoryFormat, blurb: category.blurb })),
      projects: ordered.flatMap(project => { const item = hydrated.get(project.id); return item ? [item] : []; }), isPrivate: false,
      publicAppearance: normalizePublicAppearance(row.public_appearance), projectGridColumns: normalizeProjectGridColumns(row.project_grid_columns),
      showJourney: row.show_journey === true,
    showOutgoingCitations: row.show_outgoing_citations !== false,
    showIncomingCitations: row.show_incoming_citations !== false,
      thenNow: row.show_journey === true ? readThenNow(row.then_now) : null,
    };
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
  }
};

export { hydrateProjects, loadProfiles, asDesign, throwProfileError };
export type { ProfileRow, CategoryRow, ProjectRow, AttachmentRow };
