import type {
  CommentService,
  EngagementService,
  NotificationService,
  SocialService,
} from '../interfaces';
import type { Comment, ProjectComments } from '../../types/comments';
import { CommentServiceError, validateCommentBody } from '../../types/comments';
import type { EngagementKind, ProjectEngagement } from '../../types/engagement';
import { EngagementServiceError } from '../../types/engagement';
import type { FollowRequest, FollowState, Notification } from '../../types/domain';
import { SocialServiceError } from '../../types/social';
import { requireSupabase } from './client';

async function currentAccountId(required: boolean): Promise<string | null> {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error || !data.user) {
    if (required) throw new Error('unauthenticated');
    return null;
  }
  return data.user.id;
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
    const profiles = await requireSupabase().from('profiles').select('id,name,handle,avatar_url').in('id', ids);
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

async function commentFromRow(row: CommentRow, viewerProfileId: string | null): Promise<Comment> {
  const authorName = row.profiles?.name ?? 'Deleted creator';
  return {
    id: row.id,
    projectId: row.project_id,
    author: {
      profileId: row.profiles?.id ?? null,
      name: authorName,
      initials: authorName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''),
      avatarUrl: row.profiles?.avatar_url || undefined,
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
    const comments = await Promise.all((await readCommentRows(projectId)).map((row) => commentFromRow(row, viewerProfileId)));
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

async function engagementSummary(projectId: string): Promise<ProjectEngagement> {
  const accountId = await currentAccountId(false);
  const [summary, own] = await Promise.all([
    requireSupabase().rpc('project_engagement_summary', { p_project_id: projectId }),
    accountId
      ? requireSupabase().from('project_engagement').select('kind').eq('project_id', projectId).eq('account_id', accountId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (summary.error) throw new EngagementServiceError('network', summary.error.message);
  if (own.error) throw new EngagementServiceError('network', own.error.message);
  const counts = summary.data as unknown as { like_count: number; save_count: number; repost_count: number } | null;
  const kinds = new Set(((own.data ?? []) as unknown as Array<{ kind: EngagementKind }>).map((row) => row.kind));
  return {
    projectId,
    isLiked: kinds.has('like'),
    isSaved: kinds.has('save'),
    isReposted: kinds.has('repost'),
    likeCount: Number(counts?.like_count ?? 0),
    saveCount: Number(counts?.save_count ?? 0),
    repostCount: Number(counts?.repost_count ?? 0),
  };
}

export const supabaseEngagementService: EngagementService = {
  getProjectEngagement: engagementSummary,
  async getProjectEngagements(projectIds) {
    return Promise.all(projectIds.map(engagementSummary));
  },
  async setEngagement(mutation) {
    const accountId = await currentAccountId(false);
    if (!accountId) throw new EngagementServiceError('unauthenticated', 'Sign in before engaging with work.');
    const table = requireSupabase().from('project_engagement');
    const result = mutation.engaged
      ? await table.upsert({ account_id: accountId, project_id: mutation.projectId, kind: mutation.kind }, { onConflict: 'account_id,project_id,kind' })
      : await table.delete().eq('account_id', accountId).eq('project_id', mutation.projectId).eq('kind', mutation.kind);
    if (result.error) throw new EngagementServiceError(result.error.code === '42501' ? 'permission_denied' : 'network', result.error.message);
    return engagementSummary(mutation.projectId);
  },
  async listEngagedProjectIds(kind) {
    const accountId = await currentAccountId(false);
    if (!accountId) throw new EngagementServiceError('unauthenticated', 'Sign in to see your activity.');
    const { data, error } = await requireSupabase().from('project_engagement').select('project_id')
      .eq('account_id', accountId).eq('kind', kind).order('created_at', { ascending: false });
    if (error) throw new EngagementServiceError('network', error.message);
    return ((data ?? []) as unknown as Array<{ project_id: string }>).map((row) => row.project_id);
  },
};

export const supabaseNotificationService: NotificationService = {
  async listNotifications(): Promise<Notification[]> {
    const accountId = await currentAccountId(false);
    if (!accountId) return [];
    const { data, error } = await requireSupabase().from('notifications').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Array<{ id: string; body: string; created_at: string; read_at: string | null; kind?: string | null; target_path?: string | null; actor_profile_id?: string | null }>).map((row) => ({
      id: row.id,
      body: row.body,
      timestamp: row.created_at,
      isUnread: row.read_at === null,
      kind: row.kind === 'message' || row.kind === 'reply' || row.kind === 'follow' ? row.kind : 'system',
      targetPath: row.target_path ?? null,
      actorProfileId: row.actor_profile_id ?? null,
    }));
  },
  async markRead(notificationId) {
    const { error } = await requireSupabase().from('notifications')
      .update({ read_at: new Date().toISOString() }).eq('id', notificationId);
    if (error) throw new Error(error.message);
  },
  async markAllRead() {
    const accountId = await currentAccountId(true);
    const { error } = await requireSupabase().from('notifications')
      .update({ read_at: new Date().toISOString() }).eq('account_id', accountId).is('read_at', null);
    if (error) throw new Error(error.message);
  },
  subscribeToNotifications(onChange) {
    const client = requireSupabase();
    let stopped = false;
    let remove: (() => void) | null = null;
    void client.auth.getUser().then(({ data }) => {
      if (stopped || !data.user) return;
      const channel = client.channel(`notifications:${data.user.id}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `account_id=eq.${data.user.id}` }, () => onChange())
        .subscribe();
      remove = () => { void client.removeChannel(channel); };
    });
    return () => { stopped = true; remove?.(); };
  },
};
