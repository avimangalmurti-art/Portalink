import { validContactEmail } from '../../features/employer/employer';
import { profileSharing } from './profileSharing';
import { mergeProjectDesign, saveProjectCreationDetails, saveProjectJourneyDetails } from './projectCreationDetails';
import { hydrateProjects, throwProfileError, supabaseProfileReadService } from './contentReaders';
import type { ProfileRow, CategoryRow, ProjectRow, AttachmentRow } from './contentReaders';
import { supabaseProjectReadService } from './projectReaders';
import { withProjectLocation } from '../../features/publishing/projectLocation';
import type {
  DiscoveryService,
  ProfileService,
  ProjectService,
} from '../interfaces';
import type {
  CategoryFormat,
  FeedCreator,
  Profile,
  ProjectView,
} from '../../types/domain';
import type {
  CreateProfileInput,
  CreateProfileResult,
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
import { removeStoredMedia } from './multipartMedia';
import { typefaces } from '../../data/typefaces';
import { MAX_PAGES_PER_ROW, MIN_PAGES_PER_ROW } from '../../features/projects/pageLayout';
import { locationDirectory, profileMatchesPlace } from '../../data/locationDirectory';
import type { DiscoverySignal, ExplorationMode, HomeFeedMode, ProjectFeedCursor } from '../../types/discovery';
import {
  buildUserContentSphere,
  deriveProjectRelevance,
  projectRelevanceForPersistence,
  rankDiscoverProjects,
  rankHomeProjects,
} from '../../domain/discovery/ranking';
import { creatorLocationMatches } from '../../domain/contentPlacement';
import { requireSupabase } from './client';
import { refreshProjectCoverThumbnail, removePrivateCoverThumbnails, removeProfilePublicCovers } from './coverThumbnails';
import { validateHandle } from '../../features/profile/validation';
import { createProfileHandle } from '../../utils/profileHandle';
import { normalizePublicAppearance } from '../../utils/publicAppearance';
import { MAX_PROJECT_GRID_COLUMNS, MIN_PROJECT_GRID_COLUMNS, normalizeProjectGridColumns } from '../../utils/projectGridDensity';

export { PROJECT_MEDIA_BUCKET } from './contentReaders';
export const AVATAR_BUCKET = 'avatars';

type DraftRow = {
  id: string;
  profile_id: string;
  category_id: string;
  title: string;
  summary: string;
  created_at: string;
  updated_at?: string;
};

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, '');
}

function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'upload';
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
  ...supabaseProfileReadService,
  ...profileSharing,

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

  async createProfile(accountId, input): Promise<CreateProfileResult> {
    const automaticHandle = input.handle === undefined || input.allowHandleCollisionSuffix === true;
    let handle = input.handle === undefined ? createProfileHandle(input.name) : normalizeHandle(input.handle);
    if (!handle || !input.name.trim()) {
      throw new ProfileServiceError('invalid_input', 'Enter a profile name before continuing.');
    }
    if (validateHandle(handle)) throw new ProfileServiceError('invalid_handle', 'Use 3–30 lowercase letters, numbers or dots.');
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
        handle = createProfileHandle(input.handle ?? input.name, true);
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
    if (input.isPrivate === true) await removeProfilePublicCovers(profileId);
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.headline !== undefined) update.headline = input.headline.trim();
    if (input.location !== undefined) update.location = input.location.trim();
    if (input.handle !== undefined) {
      const current = await this.getProfile(profileId);
      if (normalizeHandle(current.handle) !== normalizeHandle(input.handle)) await profileSharing.claimPublicHandle(profileId, input.handle);
    }
    if (input.links !== undefined) update.links = input.links;
    if (input.socialLinks !== undefined) update.social_links = input.socialLinks;
    if (input.isPrivate !== undefined) update.is_private = input.isPrivate;
    if (input.showOutgoingCitations !== undefined) update.show_outgoing_citations = input.showOutgoingCitations;
    if (input.showIncomingCitations !== undefined) update.show_incoming_citations = input.showIncomingCitations;
    if (input.showJourney !== undefined) update.show_journey = input.showJourney;
    if (input.thenNow !== undefined) update.then_now = input.thenNow;
    for (const [key, column, limit] of [['portfolioHeadline','portfolio_headline',80],['school','school',120],['availability','availability',120]] as const) {
      if (input[key] === undefined) continue;
      const value = input[key]?.trim() ?? null;
      if (value && value.length > limit) throw new Error(`Keep ${key === 'portfolioHeadline' ? 'the headline' : key} to ${limit} characters.`);
      update[column] = value;
    }
    if (input.startHereProjectId !== undefined) update.start_here_project_id = input.startHereProjectId;
    if (input.allowPdfDownload !== undefined) update.allow_pdf_download = input.allowPdfDownload;
    if (input.contactEmailPublic !== undefined) update.contact_email_public = input.contactEmailPublic;
    if (input.contactEmailPublic === false) update.contact_email = null;
    else if (input.contactEmail !== undefined || input.contactEmailPublic === true) {
      const email = input.contactEmail?.trim() ?? '';
      if (!validContactEmail(email)) throw new Error('Enter the contact email you want to show publicly.');
      update.contact_email = email;
    }
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
    if (error && ['42703','PGRST204'].includes(error.code) && /portfolio_headline|school|availability|contact_email|allow_pdf_download|start_here_project_id/.test(error.message)) throw new Error('These portfolio settings are not enabled yet. Your changes have not been saved.');
    if (error && ['42703', 'PGRST204'].includes(error.code) && /show_journey|then_now/.test(error.message)) throw new Error('Journey sharing and pairs are not enabled yet. Your changes have not been saved.');
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
    await removeProfilePublicCovers(profileId, arrangement.hiddenCategoryIds);
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
    updatedAt: row.updated_at,
  };
}

async function projectProfileId(projectId: string): Promise<string> {
  const { data, error } = await requireSupabase().from('projects').select('profile_id').eq('id', projectId).single();
  if (error) throw new ProjectMutationError('not_found', 'That project could not be found.');
  return (data as unknown as { profile_id: string }).profile_id;
}

export const supabaseProjectService: ProjectService = {
  ...supabaseProjectReadService,

  async updateProjectDesign(projectId, design) {
    if (!typefaces.some((typeface) => typeface.id === design.typefaceId)) {
      throw new ProjectMutationError('invalid_metadata', 'That typeface is not available.');
    }
    if (design.pagesPerRow !== undefined && (!Number.isInteger(design.pagesPerRow) || design.pagesPerRow < MIN_PAGES_PER_ROW || design.pagesPerRow > MAX_PAGES_PER_ROW)) {
      throw new ProjectMutationError('invalid_metadata', `Pages per row must be between ${MIN_PAGES_PER_ROW} and ${MAX_PAGES_PER_ROW}.`);
    }
    await mergeProjectDesign(projectId, design);
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
    await removeProfilePublicCovers(profileId, [categoryId], arrangement.hiddenProjectIds);
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

  updateProjectCreationDetails: saveProjectCreationDetails,
  updateProjectJourneyDetails: saveProjectJourneyDetails,
  async listDrafts(profileId) {
    const client = requireSupabase();
    const { data: identity } = await client.auth.getUser();
    if (!identity.user) throw new PublishServiceError('not_owner', 'Sign in to see your drafts.');
    const { data: owner, error: ownerError } = await client.from('profiles').select('account_id').eq('id', profileId).single();
    if (ownerError || owner?.account_id !== identity.user.id) throw new PublishServiceError('not_owner', 'Only the creator can see these drafts.');
    const { data, error } = await client.from('project_drafts').select('*').eq('profile_id', profileId).order('updated_at', { ascending: false });
    if (error) throw new PublishServiceError('network', error.message);
    return (data ?? []).map(row => draftFromRow(row as unknown as DraftRow));
  },
  async getDraft(draftId) {
    const { data, error } = await requireSupabase().from('project_drafts').select('*').eq('id', draftId).maybeSingle();
    if (error) throw new PublishServiceError('network', error.message);
    return data ? draftFromRow(data as unknown as DraftRow) : null;
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
    if (!input.metadata.title.trim()) {
      throw new PublishServiceError('invalid_metadata', 'A project title is required.');
    }
    if (!input.attachments?.length || input.media?.length) {
      throw new PublishServiceError('invalid_media', 'Upload at least one file before publishing.');
    }
    const categoryResult = await requireSupabase().from('portfolio_categories').select('label').eq('id', input.categoryId).eq('profile_id', input.profileId).single();
    if (categoryResult.error) throw new PublishServiceError('category_not_found', 'That portfolio category could not be found.');
    const relevance = withProjectLocation(input.relevance ?? projectRelevanceForPersistence(input.metadata, String((categoryResult.data as { label?: string }).label ?? '')), input.location);
    const extended = await requireSupabase().rpc('publish_project_citation_fields', {
      p_made_on: input.metadata.madeOn || null,
      p_access_level: input.metadata.accessLevel ?? 'public',
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
    if (needsLegacyRpc) {
      throw new PublishServiceError('network', 'Your project access and date could not be saved. Your draft is still here. Please try again after the database update.');
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
    const projectId = String(data);
    await input.onCommitted?.({ projectId, mediaPersisted: true, sessionOnly: false, creationDetailsPending: Boolean(input.metadata.creationDetails) }).catch(() => undefined);
    let creationDetailsPending = false;
    if (input.metadata.creationDetails) {
      try { await saveProjectCreationDetails(projectId, input.metadata.creationDetails); }
      catch { creationDetailsPending = true; }
    }
    // The publication is already committed; a thumbnail failure must not offer
    // to publish a duplicate project. Surface a recoverable cover-only warning.
    let coverMessage: string | undefined;
    try { coverMessage = await refreshProjectCoverThumbnail(projectId, () => this.getProject(projectId)); }
    catch {
      // A transient decode/upload failure can recover without publishing again.
      // Immutable paths and the manifest revision check keep this retry safe.
      try { coverMessage = await refreshProjectCoverThumbnail(projectId, () => this.getProject(projectId)); }
      catch { coverMessage = 'Published. The cover preview could not be prepared; save the cover again to retry.'; }
    }
    return { projectId, mediaPersisted: true, sessionOnly: false, message: coverMessage, creationDetailsPending };
  },

  async updateProjectTags(projectId, tags) {
    await mergeProjectDesign(projectId, { tags });
  },

  async updateProject(input: UpdateProjectInput): Promise<UpdateProjectResult> {
    if (!input.metadata.title.trim() || (!input.metadata.creationDetails && !input.metadata.summary.trim())) {
      throw new ProjectMutationError('invalid_metadata', 'A title and description are required.');
    }
    const { data, error } = await requireSupabase().rpc('update_project_citation_fields', {
      p_made_on: input.metadata.madeOn ?? null,
      p_access_level: input.metadata.accessLevel ?? null,
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
    let coverMessage: string | undefined;
    try { coverMessage = await refreshProjectCoverThumbnail(input.projectId, () => this.getProject(input.projectId)); }
    catch { coverMessage = 'Your changes were saved, but the cover preview needs another save to retry.'; }
    return {
      project: await this.getProject(input.projectId),
      mediaPersisted: true,
      sessionOnly: false,
      removedAttachmentIds: result?.removedAttachmentIds ?? [],
      message: coverMessage ?? (cleanupFailed
        ? 'Your project was updated, but some removed files still need storage cleanup.'
        : 'Your project has been updated.'),
    };
  },

  async deleteProject(projectId, options): Promise<DeleteProjectResult> {
    const project = await this.getProject(projectId);
    if (options?.profileId && (await projectProfileId(projectId)) !== options.profileId) {
      throw new ProjectMutationError('permission_denied', 'That project belongs to another creator.');
    }
    const profileId = await projectProfileId(projectId);
    await removeProfilePublicCovers(profileId, undefined, [projectId]);
    // Include retired and interrupted hashes, even without a current manifest.
    await removePrivateCoverThumbnails(profileId, projectId);
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

async function allPublicProjectIds(): Promise<string[]> {
  const profileIds: string[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await requireSupabase().from('profiles').select('id').eq('is_private', false).order('id').range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ id: string }>;
    profileIds.push(...rows.map(row => row.id));
    if (rows.length < pageSize) break;
  }
  return projectIdsForProfiles(profileIds);
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
    readFeedPage('global', cursor, scope === 'home' ? 30 : 120),
  ]);
  if (viewerRow.error) throw new Error(viewerRow.error.message);
  if (followResult.error) throw new Error(followResult.error.message);
  if (engagementResult.error) throw new Error(engagementResult.error.message);
  if (signalResult.error && !isMissingDiscoveryTable(signalResult.error)) throw new Error(signalResult.error.message);
  if (preferenceResult.error && !isMissingDiscoveryTable(preferenceResult.error)) throw new Error(preferenceResult.error.message);
  const viewerProfile = viewerRow.data as unknown as Pick<Profile, 'id' | 'location'> | null;
  const followedCreatorIds = ((followResult.data ?? []) as unknown as Array<{ target_profile_id: string }>).map((row) => row.target_profile_id);
  // Home uses the existing public RPC scope, including unfollowed creators.
  // The legacy fallback also reads all public profiles/projects, without a cap.
  const projectIds = page ? [] : scope === 'home'
    ? await allPublicProjectIds()
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
  async listLocationProjects(locationId) {
    const city = await locationDirectory.resolve(locationId);
    if (!city) return [];
    const profileIds: string[] = [];
    let after: string | null = null;
    for (;;) {
      let query = requireSupabase().from('profiles').select('id,location').eq('is_private', false).order('id').limit(500);
      if (after) query = query.gt('id', after);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<Pick<ProfileRow, 'id' | 'location'>>;
      profileIds.push(...rows.filter(row => city.legacy ? creatorLocationMatches(row.location, city.name) : profileMatchesPlace(row.location, city)).map(row => row.id));
      if (rows.length < 500) break;
      after = rows[rows.length - 1].id;
    }
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
  async searchAccounts(query, offset = 0): Promise<FeedCreator[]> {
    const term = query.trim().replace(/^@/, '').slice(0, 80);
    if (!term) return [];
    const pattern = `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`;
    const quoted = `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const { data, error } = await requireSupabase().from('profiles')
      .select('id,name,handle,headline,avatar_url,location').eq('is_private', false)
      .or(`name.ilike.${quoted},handle.ilike.${quoted}`).order('name').order('id')
      .range(Math.max(0, offset), Math.max(0, offset) + 29);
    if (error) throwProfileError(error, 'Accounts could not be searched.');
    return ((data ?? []) as unknown as Array<Pick<ProfileRow, 'id' | 'name' | 'handle' | 'headline' | 'avatar_url' | 'location'>>)
      .map(row => ({ id: row.id, name: row.name, kind: `@${row.handle}`, avatar: row.avatar_url, location: row.location, isPrivate: false }));
  },
};
