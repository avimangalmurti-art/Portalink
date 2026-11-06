import { likesCapability } from '../../features/engagement/capabilities';
import type {
  CommentService,
  EngagementService,
  NotificationService,
  NotificationDeleteTarget,
  SocialService,
} from '../interfaces';
import type { Comment, ProjectComments } from '../../types/comments';
import { CommentServiceError, validateCommentBody } from '../../types/comments';
import type { ProjectEngagement } from '../../types/engagement';
import { EngagementServiceError } from '../../types/engagement';
import type { FollowRequest, FollowState, Notification } from '../../types/domain';
import { SocialServiceError } from '../../types/social';
import { requireSupabase } from './client';

async function currentAccountId(required: boolean): Promise<string | null> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error || !data.session?.user) {
    if (required) throw new Error('unauthenticated');
    return null;
  }
  return data.session.user.id;
}

async function currentProfileId(required: boolean): Promise<string | null> {
  const accountId = await currentAccountId(required);
  if (!accountId) return null;
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as unknown as { id: string } | null;
  if (!row && required) throw new Error('profile_required');
  return row?.id ?? null;
}

async function followerCount(profileId: string): Promise<number | undefined> {
  const { data, error } = await requireSupabase().rpc('follower_count', { p_profile_id: profileId });
  return error ? undefined : Number(data ?? 0);
}

async function followState(profileId: string): Promise<FollowState> {
  const accountId = await currentAccountId(false);
  if (!accountId) {
    return { profileId, isFollowing: false, isRequested: false, followerCount: await followerCount(profileId) };
  }
  const { data, error } = await requireSupabase()
    .from('profile_follows')
    .select('status')
    .eq('follower_account_id', accountId)
    .eq('target_profile_id', profileId)
    .maybeSingle();
  if (error) throw new SocialServiceError('network', error.message);
  const row = data as unknown as { status: 'following' | 'pending' } | null;
  return {
    profileId,
    isFollowing: row?.status === 'following',
    isRequested: row?.status === 'pending',
    followerCount: await followerCount(profileId),
  };
}

export const supabaseSocialService: SocialService = {
  async getProfileConnectionCounts(profileId) {
    const { data, error } = await requireSupabase().rpc('profile_connection_counts', { p_profile_id: profileId });
    if (error) throw new SocialServiceError('network', 'Couldn’t load connection counts.');
    const counts = data as { followers: number; following: number } | null;
    if (!counts || ![counts.followers, counts.following].every(value => Number.isSafeInteger(value) && value >= 0)) throw new SocialServiceError('network', 'Connection counts are unavailable.');
    const permission = await requireSupabase().rpc('can_view_profile_connections', { p_profile_id: profileId });
    return { ...counts, canViewConnections: !permission.error && permission.data === true };
  },
  async listProfileConnections(profileId, kind, offset = 0) {
    const ownerId = await currentProfileId(false);
    if (ownerId !== profileId) {
      const { data: allowed, error } = await requireSupabase().rpc('can_view_profile_connections', { p_profile_id: profileId });
      if (error || allowed !== true) throw new SocialServiceError('permission_denied', 'Only the owner and mutual followers can view this list.');
    }
    const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const pageSize = 54;
    const incoming = kind === 'followers';
    const personColumn = incoming ? 'follower_profile_id' : 'target_profile_id';
    const subjectColumn = incoming ? 'target_profile_id' : 'follower_profile_id';
    const client = requireSupabase();
    const edges = await client.from('profile_follows').select(personColumn, { count: 'exact' })
      .eq(subjectColumn, profileId).eq('status', 'following')
      .order('created_at', { ascending: false }).order(personColumn, { ascending: true })
      .range(start, start + pageSize - 1);
    if (edges.error) throw new SocialServiceError('network', 'Couldn’t load this list. Please try again.');
    const ids = ((edges.data ?? []) as unknown as Array<Record<string, string>>).map((row) => row[personColumn]);
    const total = edges.count ?? 0;
    if (ids.length === 0) return { items: [], total, nextOffset: null };
    const people = await client.rpc('profile_identities', { p_profile_ids: ids });
    if (people.error) throw new SocialServiceError('network', 'Couldn’t load these profiles. Please try again.');
    const byId = new Map(((people.data ?? []) as unknown as Array<{ id: string; name: string; avatar_url: string }>).map((person) => [person.id, person]));
    return {
      items: ids.flatMap((id) => {
        const person = byId.get(id);
        return person ? [{ profileId: person.id, name: person.name, avatar: person.avatar_url }] : [];
      }),
      total,
      nextOffset: start + ids.length < total ? start + ids.length : null,
    };
  },
  getFollowState: followState,

  async followProfile(profileId) {
    let accountId: string;
    let followerProfileId: string;
    try {
      accountId = (await currentAccountId(true))!;
      followerProfileId = (await currentProfileId(true))!;
    } catch {
      throw new SocialServiceError('unauthenticated', 'Sign in and create a profile before following creators.');
    }
    if (followerProfileId === profileId) throw new SocialServiceError('permission_denied', 'You cannot follow yourself.');
    const { data, error } = await requireSupabase().rpc('follow_status_for_target', {
      p_profile_id: profileId,
    });
    if (error) throw new SocialServiceError('network', error.message);
    const status = data === 'pending' || data === 'following' ? data : null;
    if (!status) throw new SocialServiceError('not_found', 'That creator could not be found.');
    const { error: writeError } = await requireSupabase().from('profile_follows').insert({
      follower_account_id: accountId,
      follower_profile_id: followerProfileId,
      target_profile_id: profileId,
      status,
    });
    if (writeError) throw new SocialServiceError(writeError.code === '42501' ? 'permission_denied' : 'network', writeError.message);
    return followState(profileId);
  },

  async unfollowProfile(profileId) {
    const accountId = await currentAccountId(false);
    if (!accountId) throw new SocialServiceError('unauthenticated', 'Sign in before unfollowing a creator.');
    const { error } = await requireSupabase().from('profile_follows').delete()
      .eq('follower_account_id', accountId).eq('target_profile_id', profileId).eq('status', 'following');
    if (error) throw new SocialServiceError('network', error.message);
    return followState(profileId);
  },

  async cancelFollowRequest(profileId) {
    const accountId = await currentAccountId(false);
    if (!accountId) throw new SocialServiceError('unauthenticated', 'Sign in before withdrawing a request.');
    const { error } = await requireSupabase().from('profile_follows').delete()
      .eq('follower_account_id', accountId).eq('target_profile_id', profileId).eq('status', 'pending');
    if (error) throw new SocialServiceError('network', error.message);
    return followState(profileId);
  },

  async listFollowRequests(): Promise<FollowRequest[]> {
    const profileId = await currentProfileId(false);
    if (!profileId) throw new SocialServiceError('unauthenticated', 'Sign in to read follow requests.');
    const { data, error } = await requireSupabase().from('profile_follows')
      .select('follower_profile_id').eq('target_profile_id', profileId).eq('status', 'pending');
    if (error) throw new SocialServiceError('network', error.message);
    const ids = ((data ?? []) as unknown as Array<{ follower_profile_id: string }>).map((row) => row.follower_profile_id);
    if (ids.length === 0) return [];
    const profiles = await requireSupabase().rpc('profile_identities', { p_profile_ids: ids });
    if (profiles.error) throw new SocialServiceError('network', profiles.error.message);
    return ((profiles.data ?? []) as unknown as Array<{ id: string; name: string; handle: string; avatar_url: string }>).map((row) => ({
      profileId: row.id,
      name: row.name,
      handle: `@${row.handle}`,
      initials: row.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''),
      avatar: row.avatar_url,
    }));
  },

  async approveFollowRequest(requesterProfileId) {
    const profileId = await currentProfileId(false);
    if (!profileId) throw new SocialServiceError('unauthenticated', 'Sign in to approve follow requests.');
    const { error } = await requireSupabase().from('profile_follows').update({ status: 'following' })
      .eq('target_profile_id', profileId).eq('follower_profile_id', requesterProfileId).eq('status', 'pending');
    if (error) throw new SocialServiceError('network', error.message);
    return this.listFollowRequests();
  },

  async declineFollowRequest(requesterProfileId) {
    const profileId = await currentProfileId(false);
    if (!profileId) throw new SocialServiceError('unauthenticated', 'Sign in to decline follow requests.');
    const { error } = await requireSupabase().from('profile_follows').delete()
      .eq('target_profile_id', profileId).eq('follower_profile_id', requesterProfileId).eq('status', 'pending');
    if (error) throw new SocialServiceError('network', error.message);
    return this.listFollowRequests();
  },
};

type CommentRow = {
  id: string;
  project_id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
  root_id: string | null;
  profiles: { id: string; name: string; avatar_url: string } | null;
};

async function commentFromRow(row: CommentRow, viewerProfileId: string | null, resolved?: Map<string, NonNullable<CommentRow['profiles']>>): Promise<Comment> {
  let identity = row.profiles ?? resolved?.get(row.author_profile_id) ?? null;
  if (!identity && row.author_profile_id && !resolved) {
    const result = await requireSupabase().rpc('profile_identities', { p_profile_ids: [row.author_profile_id] });
    identity = result.data?.[0] ?? null;
  }
  const authorName = identity?.name ?? 'Creator';
  return {
    id: row.id,
    projectId: row.project_id,
    author: {
      profileId: identity?.id ?? null,
      name: authorName,
      initials: authorName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''),
      avatarUrl: identity?.avatar_url || undefined,
    },
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at !== row.created_at ? row.updated_at : undefined,
    parentId: row.parent_id,
    rootId: row.root_id,
    canDelete: viewerProfileId === row.author_profile_id,
  };
}

async function readCommentRows(projectId: string): Promise<CommentRow[]> {
  const { data, error } = await requireSupabase().from('project_comments')
    .select('*,profiles!project_comments_author_profile_id_fkey(id,name,avatar_url)')
    .eq('project_id', projectId).order('created_at');
  if (error) throw new CommentServiceError('network', error.message);
  return (data ?? []) as unknown as CommentRow[];
}

export const supabaseCommentService: CommentService = {
  async listComments(projectId): Promise<ProjectComments> {
    const viewerProfileId = await currentProfileId(false);
    const rows = await readCommentRows(projectId);
    const missingIds = [...new Set(rows.filter(row => !row.profiles).map(row => row.author_profile_id))];
    const identities = new Map<string, NonNullable<CommentRow['profiles']>>();
    if (missingIds.length) {
      const result = await requireSupabase().rpc('profile_identities', { p_profile_ids: missingIds });
      if (result.error) throw new CommentServiceError('network', 'Comment authors could not be loaded.');
      for (const person of (result.data ?? []) as Array<NonNullable<CommentRow['profiles']>>) identities.set(person.id, person);
    }
    const comments = await Promise.all(rows.map(row => commentFromRow(row, viewerProfileId, identities)));
    const roots = comments.filter((comment) => comment.parentId === null);
    return {
      projectId,
      threads: roots.map((comment) => ({
        comment,
        replies: comments.filter((reply) => reply.rootId === comment.id),
      })),
      totalCount: comments.length,
    };
  },

  async createComment(projectId, body) {
    const validation = validateCommentBody(body);
    if (validation) throw new CommentServiceError('validation', validation);
    const authorProfileId = await currentProfileId(false);
    if (!authorProfileId) throw new CommentServiceError('unauthenticated', 'Sign in and create a profile before commenting.');
    const { data, error } = await requireSupabase().from('project_comments').insert({
      project_id: projectId,
      author_profile_id: authorProfileId,
      body: body.trim(),
    }).select('*,profiles!project_comments_author_profile_id_fkey(id,name,avatar_url)').single();
    if (error) throw new CommentServiceError(error.code === '42501' ? 'permission_denied' : 'network', error.message);
    return commentFromRow(data as unknown as CommentRow, authorProfileId);
  },

  async createReply(projectId, parentCommentId, body) {
    const validation = validateCommentBody(body);
    if (validation) throw new CommentServiceError('validation', validation);
    const authorProfileId = await currentProfileId(false);
    if (!authorProfileId) throw new CommentServiceError('unauthenticated', 'Sign in and create a profile before replying.');
    const parentResult = await requireSupabase().from('project_comments').select('id,project_id,root_id').eq('id', parentCommentId).single();
    if (parentResult.error) throw new CommentServiceError('not_found', 'That comment is no longer available.');
    const parent = parentResult.data as unknown as { id: string; project_id: string; root_id: string | null };
    if (parent.project_id !== projectId) throw new CommentServiceError('not_found', 'That comment is not part of this project.');
    const { data, error } = await requireSupabase().from('project_comments').insert({
      project_id: projectId,
      author_profile_id: authorProfileId,
      body: body.trim(),
      parent_id: parent.id,
      root_id: parent.root_id ?? parent.id,
    }).select('*,profiles!project_comments_author_profile_id_fkey(id,name,avatar_url)').single();
    if (error) throw new CommentServiceError(error.code === '42501' ? 'permission_denied' : 'network', error.message);
    return commentFromRow(data as unknown as CommentRow, authorProfileId);
  },

  async deleteComment(commentId) {
    const { error } = await requireSupabase().from('project_comments').delete().eq('id', commentId);
    if (error) throw new CommentServiceError(error.code === '42501' ? 'permission_denied' : 'network', error.message);
  },
};

async function legacyEngagementSummary(projectId: string): Promise<ProjectEngagement> {
  const accountId = await currentAccountId(false);
  const [summary, own] = await Promise.all([
    requireSupabase().rpc('project_engagement_summary', { p_project_id: projectId }),
    accountId
      ? requireSupabase().from('project_engagement').select('kind').eq('project_id', projectId).eq('account_id', accountId).in('kind', ['like', 'save'])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (summary.error) throw new EngagementServiceError('network', summary.error.message);
  if (own.error) throw new EngagementServiceError('network', own.error.message);
  const counts = summary.data as unknown as { like_count: number; save_count: number; repost_count: number } | null;
  // Older deployments still return retired summary fields alongside active kinds.
  const kinds = new Set(((own.data ?? []) as unknown as Array<{ kind: string }>).map((row) => row.kind));
  return {
    projectId,
    isLiked: kinds.has('like'),
    isSaved: kinds.has('save'),
    isReposted: false,
    likeCount: Number(counts?.like_count ?? 0),
    saveCount: Number(counts?.save_count ?? 0),
    repostCount: Number(counts?.repost_count ?? 0),
  };
}

type EngagementSummaryRow = {
  project_id: string;
  viewer_liked: boolean; viewer_saved: boolean; viewer_reposted: boolean;
  like_count: number; save_count: number; repost_count: number;
};

async function engagementSummaries(projectIds: string[]): Promise<ProjectEngagement[]> {
  const ids = [...new Set(projectIds)];
  const records: ProjectEngagement[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const page = ids.slice(offset, offset + 200);
    const { data, error } = await requireSupabase().rpc('project_engagement_summaries', { p_project_ids: page });
    if (error?.code === 'PGRST202' || error?.code === '42883') {
      // Source may be deployed before the separately approved RPC migration.
      records.push(...await Promise.all(page.map(legacyEngagementSummary)));
    } else {
      if (error) throw new EngagementServiceError('network', error.message);
      records.push(...((data ?? []) as EngagementSummaryRow[]).map((row) => ({
        projectId: row.project_id, isLiked: row.viewer_liked, isSaved: row.viewer_saved, isReposted: row.viewer_reposted,
        likeCount: Number(row.like_count), saveCount: Number(row.save_count), repostCount: Number(row.repost_count),
      })));
    }
  }
  return records;
}

type PendingEngagement = { id: string; resolve: (value: ProjectEngagement) => void; reject: (error: unknown) => void };
const pendingEngagements = new Map<string | null, PendingEngagement[]>();

async function engagementSummary(projectId: string): Promise<ProjectEngagement> {
  const account = await currentAccountId(false);
  return new Promise((resolve, reject) => {
    const pending = pendingEngagements.get(account);
    if (pending) { pending.push({ id: projectId, resolve, reject }); return; }
    const queued = [{ id: projectId, resolve, reject }];
    pendingEngagements.set(account, queued);
    setTimeout(() => {
      pendingEngagements.delete(account);
      void (async () => {
        try {
          if (await currentAccountId(false) !== account) throw new Error('Your account changed. Please try again.');
          const rows = await engagementSummaries(queued.map((item) => item.id));
          if (await currentAccountId(false) !== account) throw new Error('Your account changed. Please try again.');
          const byId = new Map(rows.map((row) => [row.projectId, row]));
          for (const item of queued) {
            const row = byId.get(item.id);
            if (row) item.resolve(row);
            else item.reject(new EngagementServiceError('permission_denied', 'This project is not available.'));
          }
        } catch (error) { for (const item of queued) item.reject(error); }
      })();
    }, 12);
  });
}

export const supabaseEngagementService: EngagementService = {
  async listProjectParticipants(projectId, kind, offset = 0) {
    if (kind !== 'like' && kind !== 'save') throw new EngagementServiceError('permission_denied', 'This engagement action is unavailable.');
    const { data, error } = await requireSupabase().rpc('project_engagement_participants', { p_project_id: projectId, p_kind: kind, p_offset: offset });
    if (error) throw new EngagementServiceError('network', 'People who engaged could not be loaded.');
    return (data ?? []).map((row: { profile_id: string; name: string; avatar_url: string }) => ({ id: row.profile_id, name: row.name, avatar: row.avatar_url }));
  },
  getProjectEngagement: engagementSummary,
  getProjectEngagements: engagementSummaries,
  async setEngagement(mutation) {
    if (mutation.kind !== 'like' && mutation.kind !== 'save') throw new EngagementServiceError('permission_denied', 'This engagement action is unavailable.');
    if(mutation.kind === 'like' && !likesCapability) throw new EngagementServiceError('permission_denied','Likes are unavailable.');
    const accountId = await currentAccountId(false);
    if (!accountId) throw new EngagementServiceError('unauthenticated', 'Sign in before engaging with work.');
    const table = requireSupabase().from('project_engagement');
    const result = mutation.engaged
      ? await table.upsert({ account_id: accountId, project_id: mutation.projectId, kind: mutation.kind }, { onConflict: 'account_id,project_id,kind' })
      : await table.delete().eq('account_id', accountId).eq('project_id', mutation.projectId).eq('kind', mutation.kind);
    if (result.error) throw new EngagementServiceError(result.error.code === '42501' ? 'permission_denied' : 'network', result.error.message);
    const [record] = await engagementSummaries([mutation.projectId]);
    if (!record) throw new EngagementServiceError('permission_denied', 'This project is not available.');
    return record;
  },
  async listSavedProjectEntries() {
    const accountId = await currentAccountId(false);
    if (!accountId) throw new EngagementServiceError('unauthenticated', 'Sign in to see bookmarks.');
    const { data, error } = await requireSupabase().from('project_engagement').select('project_id,created_at').eq('account_id', accountId).eq('kind','save').order('created_at',{ascending:false});
    if (error) throw new EngagementServiceError('network',error.message);
    return (data ?? []).map(row=>({projectId: String(row.project_id),savedAt:String(row.created_at)}));
  },
  async listEngagedProjectIds(kind) {
    if (kind !== 'like' && kind !== 'save') throw new EngagementServiceError('permission_denied', 'This activity collection is unavailable.');
    const accountId = await currentAccountId(false);
    if (!accountId) throw new EngagementServiceError('unauthenticated', 'Sign in to see your activity.');
    const { data, error } = await requireSupabase().from('project_engagement').select('project_id')
      .eq('account_id', accountId).eq('kind', kind).order('created_at', { ascending: false });
    if (error) throw new EngagementServiceError('network', error.message);
    return ((data ?? []) as unknown as Array<{ project_id: string }>).map((row) => row.project_id);
  },
};

export const supabaseNotificationService: NotificationService = {
  async deleteNotifications(targets) {
    if (!targets.length) return [];
    if (targets.length > 200 || targets.some(target => !target || typeof target.id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(target.id)
      || typeof target.timestamp !== 'string' || !Number.isFinite(Date.parse(target.timestamp)))) throw new Error('Invalid notification selection.');
    const selected = [...new Map(targets.map(({ id, timestamp }) => [JSON.stringify([id, timestamp]), { id, timestamp }])).values()];
    const accountId = await currentAccountId(true);
    const results: Array<PromiseSettledResult<NotificationDeleteTarget | null>> = [];
    for (let offset = 0; offset < selected.length; offset += 8) {
      if (offset && await currentAccountId(false) !== accountId) return [];
      results.push(...await Promise.allSettled(selected.slice(offset, offset + 8).map(async target => {
        const { data, error } = await requireSupabase().from('notifications').delete()
          .eq('account_id', accountId).eq('id', target.id).eq('created_at', target.timestamp).select('id');
        if (error) throw new Error(error.message);
        return (data ?? []).some(row => row.id === target.id) ? target : null;
      })));
    }
    if (await currentAccountId(false) !== accountId) return [];
    const removed: NotificationDeleteTarget[] = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    if (!removed.length && results.every(result => result.status === 'rejected')) throw new Error('Notifications could not be deleted. Please try again.');
    return removed;
  },
  async listNotifications(): Promise<Notification[]> {
    const accountId = await currentAccountId(false);
    if (!accountId) return [];
    const { data, error } = await requireSupabase().from('notifications').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false }).limit(100);
    if (error && !(['42703','PGRST204'].includes(error.code) && /read_at/.test(error.message))) throw new Error(error.message);
    return ((data ?? []) as unknown as Array<{ id: string; body: string; created_at: string; read_at: string | null; kind?: string | null; target_path?: string | null; actor_profile_id?: string | null }>).map((row) => ({
      id: row.id,
      body: row.body,
      timestamp: row.created_at,
      isUnread: row.read_at === null,
      kind: row.kind === 'message' || row.kind === 'reply' || row.kind === 'follow' || row.kind === 'citation' ? row.kind : 'system',
      targetPath: row.target_path ?? null,
      actorProfileId: row.actor_profile_id ?? null,
    }));
  },
  async markRead(notificationId) {
    const { error } = await requireSupabase().from('notifications')
      .update({ read_at: new Date().toISOString() }).eq('id', notificationId);
    if (error && !(['42703','PGRST204'].includes(error.code) && /read_at/.test(error.message))) throw new Error(error.message);
  },
  async markAllRead() {
    const accountId = await currentAccountId(true);
    const { error } = await requireSupabase().from('notifications')
      .update({ read_at: new Date().toISOString() }).eq('account_id', accountId).is('read_at', null);
    if (error && !(['42703','PGRST204'].includes(error.code) && /read_at/.test(error.message))) throw new Error(error.message);
  },
  subscribeToNotifications(onChange, onStatus) {
    const client = requireSupabase();
    let stopped = false;
    let remove: (() => void) | null = null;
    void client.auth.getSession().then(({ data }) => {
      if (stopped) return;
      if (!data.session?.user) { onStatus?.(false); return; }
      const channel = client.channel(`notifications:${data.session.user.id}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `account_id=eq.${data.session.user.id}` }, () => onChange())
        .subscribe((status) => { if (!stopped) onStatus?.(status === 'SUBSCRIBED'); });
      remove = () => { void client.removeChannel(channel); };
    }).catch(() => { if (!stopped) onStatus?.(false); });
    return () => { stopped = true; remove?.(); };
  },
};
