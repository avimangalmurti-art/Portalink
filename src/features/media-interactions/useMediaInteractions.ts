import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { mediaInteractionRequest as apiRequest } from './mediaInteractionRequest';
import { readMediaInteraction } from './mediaInteractionBatch';
import { readSharedReturnPath } from '../auth/registration';

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

export type MediaInteractionRecord = {
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

export function useMediaInteractions(target: MediaInteractionTarget, enabled = true) {
  const auth = useAuth();
  const key = targetKey(target);
  const [record, setRecord] = useState<MediaInteractionRecord>(EMPTY_RECORD);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pendingKind, setPendingKind] = useState<MediaEngagementKind | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [commentResumeToken, setCommentResumeToken] = useState(0);
  const [shareState, setShareState] = useState<'idle' | 'shared'>('idle');
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setIsLoading(true);
    setFailure(null);
    try {
      const next = await readMediaInteraction(target, auth.user?.id ?? null);
      if (loadTokenRef.current === token) { setRecord(next); setHasLoaded(true); }
    } catch (error) {
      if (loadTokenRef.current === token) setFailure(error instanceof Error ? error.message : 'This page activity is temporarily unavailable.');
    } finally {
      if (loadTokenRef.current === token) setIsLoading(false);
    }
  }, [target, auth.user?.id]);

  useEffect(() => {
    setRecord(EMPTY_RECORD);
    setHasLoaded(false);
    if (enabled) void load();
    return () => { loadTokenRef.current += 1; };
  }, [auth.user?.id, key, load, enabled]);

  const gateGuest = useCallback((action: PendingMediaAction['action']) => {
    const url = mediaDeepLink(target);
    const sharedPath = readSharedReturnPath(`${url.pathname}${url.search}`);
    // Shared visitor actions retain the exact page but never queue a write.
    // Cancelling sign-in must not cause a later login to act on this page.
    if (sharedPath) {
      try { window.sessionStorage.removeItem(PENDING_ACTION_KEY); } catch { /* Storage is optional. */ }
    } else rememberPendingAction({ targetKey: key, action });
    auth.requestAuthenticatedDestination({
      kind: 'route',
      path: sharedPath ?? `${url.pathname}${url.search}`,
      label: `${action === 'save' ? 'bookmark' : action} ${target.label}`
    });
  }, [auth, key, target]);

  const setEngagement = useCallback(async (kind: MediaEngagementKind, engaged: boolean, replayed = false) => {
    if (!auth.isAuthenticated && !replayed) {
      gateGuest(kind);
      return;
    }
    if (!hasLoaded && !replayed) return;
    // A read begun before this write must not replace its optimistic/result state.
    loadTokenRef.current += 1;
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
      setHasLoaded(true);
    } catch (error) {
      setRecord(before);
      setFailure(error instanceof Error ? error.message : 'That action could not be completed.');
    } finally {
      setPendingKind(null);
      setIsLoading(false);
    }
  }, [auth.isAuthenticated, gateGuest, hasLoaded, record, target]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const pending = takePendingAction(key);
    if (!pending) return;
    if (typeof window !== 'undefined' && window.location && readSharedReturnPath(`${window.location.pathname}${window.location.search}`)) return;
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
    loadTokenRef.current += 1;
    setFailure(null);
    try {
      const next = await apiRequest<MediaInteractionRecord>('/api/media-interactions/comments', {
        method: 'POST',
        body: JSON.stringify({ ...target, body: trimmed })
      }, true);
      setRecord(next);
      setHasLoaded(true);
      return true;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Your comment could not be posted.');
      return false;
    } finally {
      setIsPostingComment(false);
      setIsLoading(false);
    }
  }, [auth.isAuthenticated, gateGuest, target]);

  const deleteComment = useCallback(async (commentId: string) => {
    loadTokenRef.current += 1;
    setFailure(null);
    const before = record;
    setRecord((current) => ({ ...current, comments: current.comments.filter((comment) => comment.id !== commentId) }));
    try {
      const next = await apiRequest<MediaInteractionRecord>(`/api/media-interactions/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        body: JSON.stringify(target)
      }, true);
      setRecord(next);
      setHasLoaded(true);
    } catch (error) {
      setRecord(before);
      setFailure(error instanceof Error ? error.message : 'That comment could not be removed.');
    } finally {
      setIsLoading(false);
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
    isResolvingEngagement: auth.isAuthenticated && !hasLoaded,
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
