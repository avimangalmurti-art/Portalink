import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { requireSupabase } from '../../services/supabase/client';

export type MediaEngagementKind = 'like' | 'save' | 'repost';

export type MediaInteractionTarget = {
  projectId: string;
  attachmentId: string;
  /** Zero-based position inside an image sequence or document. */
  pageIndex: number;
  label: string;
};

export type MediaComment = {
  id: string;
  body: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  canDelete: boolean;
};

type MediaInteractionRecord = {
  engaged: Record<MediaEngagementKind, boolean>;
  counts: Record<MediaEngagementKind, number>;
  comments: MediaComment[];
};

type PendingMediaAction = {
  targetKey: string;
  action: MediaEngagementKind | 'comment';
};

const PENDING_ACTION_KEY = 'portalink.pendingMediaAction';
const EMPTY_RECORD: MediaInteractionRecord = {
  engaged: { like: false, save: false, repost: false },
  counts: { like: 0, save: 0, repost: 0 },
  comments: []
};

function targetKey(target: MediaInteractionTarget): string {
  return `${target.projectId}:${target.attachmentId}:${target.pageIndex}`;
}

export function mediaDeepLink(target: MediaInteractionTarget): URL {
  const url = new URL(window.location.href);
  url.searchParams.set('media', target.attachmentId);
  url.searchParams.set('page', String(target.pageIndex + 1));
  return url;
}

function rememberPendingAction(action: PendingMediaAction): void {
  try {
    window.sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
  } catch {
    // The sign-in route still returns to the exact page when storage is blocked.
  }
}

function takePendingAction(key: string): PendingMediaAction | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingMediaAction>;
    if (parsed.targetKey !== key || !['like', 'save', 'repost', 'comment'].includes(parsed.action ?? '')) return null;
    window.sessionStorage.removeItem(PENDING_ACTION_KEY);
    return parsed as PendingMediaAction;
  } catch {
    return null;
  }
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await requireSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit, requireAccount = false): Promise<T> {
  const token = await accessToken();
  if (requireAccount && !token) throw new Error('Sign in to continue.');
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (init?.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error || 'This page activity is temporarily unavailable.');
  if (!payload) throw new Error('This page activity is temporarily unavailable.');
  return payload;
}

export function useMediaInteractions(target: MediaInteractionTarget) {
  const auth = useAuth();
  const key = targetKey(target);
  const [record, setRecord] = useState<MediaInteractionRecord>(EMPTY_RECORD);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingKind, setPendingKind] = useState<MediaEngagementKind | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [commentResumeToken, setCommentResumeToken] = useState(0);
  const [shareState, setShareState] = useState<'idle' | 'shared'>('idle');
  const loadTokenRef = useRef(0);

  const targetQuery = useMemo(() => {
    const query = new URLSearchParams({
      projectId: target.projectId,
      attachmentId: target.attachmentId,
      pageIndex: String(target.pageIndex)
    });
    return query.toString();
  }, [target.attachmentId, target.pageIndex, target.projectId]);

  const load = useCallback(async () => {
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setIsLoading(true);
    setFailure(null);
    try {
      const next = await apiRequest<MediaInteractionRecord>(`/api/media-interactions?${targetQuery}`);
      if (loadTokenRef.current === token) setRecord(next);
    } catch (error) {
      if (loadTokenRef.current === token) setFailure(error instanceof Error ? error.message : 'This page activity is temporarily unavailable.');
    } finally {
      if (loadTokenRef.current === token) setIsLoading(false);
    }
  }, [targetQuery]);

  useEffect(() => {
    setRecord(EMPTY_RECORD);
    void load();
  }, [key, load]);

  const gateGuest = useCallback((action: PendingMediaAction['action']) => {
    const url = mediaDeepLink(target);
    rememberPendingAction({ targetKey: key, action });
    auth.requestAuthenticatedDestination({
      kind: 'route',
      path: `${url.pathname}${url.search}`,
      label: `${action === 'save' ? 'bookmark' : action} ${target.label}`
    });
  }, [auth, key, target]);

  const setEngagement = useCallback(async (kind: MediaEngagementKind, engaged: boolean, replayed = false) => {
    if (!auth.isAuthenticated && !replayed) {
      gateGuest(kind);
      return;
    }
    const before = record;
    setPendingKind(kind);
    setFailure(null);
    setRecord((current) => ({
      ...current,
      engaged: { ...current.engaged, [kind]: engaged },
      counts: { ...current.counts, [kind]: Math.max(0, current.counts[kind] + (engaged ? 1 : -1)) }
    }));
    try {
      const next = await apiRequest<MediaInteractionRecord>('/api/media-interactions/engagement', {
        method: 'POST',
        body: JSON.stringify({ ...target, kind, engaged })
      }, true);
      setRecord(next);
    } catch (error) {
      setRecord(before);
      setFailure(error instanceof Error ? error.message : 'That action could not be completed.');
    } finally {
      setPendingKind(null);
    }
  }, [auth.isAuthenticated, gateGuest, record, target]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const pending = takePendingAction(key);
    if (!pending) return;
    if (pending.action === 'comment') {
      setCommentResumeToken((value) => value + 1);
      return;
    }
    void setEngagement(pending.action, true, true);
  }, [auth.isAuthenticated, key, setEngagement]);

  const postComment = useCallback(async (body: string): Promise<boolean> => {
    if (!auth.isAuthenticated) {
      gateGuest('comment');
      return false;
    }
    const trimmed = body.trim();
    if (!trimmed) {
      setFailure('Write something before posting.');
      return false;
    }
    setIsPostingComment(true);
    setFailure(null);
    try {
      const next = await apiRequest<MediaInteractionRecord>('/api/media-interactions/comments', {
        method: 'POST',
        body: JSON.stringify({ ...target, body: trimmed })
      }, true);
      setRecord(next);
      return true;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Your comment could not be posted.');
      return false;
    } finally {
      setIsPostingComment(false);
    }
  }, [auth.isAuthenticated, gateGuest, target]);

  const deleteComment = useCallback(async (commentId: string) => {
    setFailure(null);
    const before = record;
    setRecord((current) => ({ ...current, comments: current.comments.filter((comment) => comment.id !== commentId) }));
    try {
      const next = await apiRequest<MediaInteractionRecord>(`/api/media-interactions/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        body: JSON.stringify(target)
      }, true);
      setRecord(next);
    } catch (error) {
      setRecord(before);
      setFailure(error instanceof Error ? error.message : 'That comment could not be removed.');
    }
  }, [record, target]);

  const share = useCallback(async () => {
    const url = mediaDeepLink(target).toString();
    setShareState('shared');
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: target.label, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // The pressed state still confirms the requested action.
      }
    }
  }, [target]);

  return {
    record,
    isLoading,
    pendingKind,
    isPostingComment,
    failure,
    retry: load,
    dismissFailure: () => setFailure(null),
    toggle: (kind: MediaEngagementKind) => void setEngagement(kind, !record.engaged[kind]),
    postComment,
    deleteComment,
    share,
    shareState,
    commentResumeToken
  };
}
