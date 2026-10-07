import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { CommentServiceError, isRetryableCommentCode, validateCommentBody } from '../../types/comments';
import type { CommentErrorCode, CommentThread, ProjectComments } from '../../types/comments';
import type { Id } from '../../types/domain';
import { interactionIntent } from '../auth/interactionIntent';

/**
 * The conversation on one project.
 *
 * `project UI → useProjectComments(projectId) → CommentService → implementation`.
 * Presentation receives state and callbacks and never touches a service.
 *
 * Everything is keyed to the project id, which is what stops project A's thread,
 * pending reply, or failure appearing on project B — the whole lifecycle is
 * discarded and re-resolved when the id changes, and any response that names a
 * project the viewer has moved away from is dropped rather than written in.
 */
export type CommentComposerState = {
  /** Exactly what the person typed. Preserved verbatim through a failure. */
  body: string;
  isSubmitting: boolean;
  /** Field-level objection, from the client's own check or the service's. */
  error: string | null;
  errorCode: CommentErrorCode | null;
  /** Null when a second identical request could not succeed. */
  retry: (() => void) | null;
};
export type PendingComment = {
  /** A local id, never mistaken for a service id. */
  localId: string;
  body: string;
  /** Null for a new top-level comment. */
  parentId: Id | null;
};
export type CommentDeletion = {
  commentId: Id;
  isDeleting: boolean;
  error: string | null;
  retry: (() => void) | null;
};
export type ProjectCommentsLifecycle = {
  phase: 'loading' | 'ready' | 'error';
  threads: CommentThread[];
  totalCount: number;
  isEmpty: boolean;
  loadError: string | null;
  reload: () => void;
  /** Visibly pending writes. NEVER presented as posted. */
  pending: PendingComment[];
  /** The top-level composer. */
  composer: CommentComposerState;
  setBody: (body: string) => void;
  submit: () => void;
  /** Which comment is being replied to, preserved across a failure. */
  replyingToId: Id | null;
  startReply: (commentId: Id) => void;
  cancelReply: () => void;
  replyComposer: CommentComposerState;
  setReplyBody: (body: string) => void;
  submitReply: () => void;
  /** Deletion is confirmed before anything is sent. */
  deletionRequestId: Id | null;
  requestDelete: (commentId: Id) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  deletion: CommentDeletion | null;
  /** False for a guest: writing opens the sign-in gate instead. */
  canWrite: boolean;
};
const EMPTY_COMPOSER: CommentComposerState = {
  body: '',
  isSubmitting: false,
  error: null,
  errorCode: null,
  retry: null
};
function classify(error: unknown, fallback: string): {
  code: CommentErrorCode;
  message: string;
} {
  if (error instanceof CommentServiceError) {
    return {
      code: error.code,
      message: error.message
    };
  }
  return {
    code: 'unknown',
    message: error instanceof Error && error.message ? error.message : fallback
  };
}
export function useProjectComments(projectId: Id | null): ProjectCommentsLifecycle {
  const {
    comments: commentService
  } = useServices();
  const auth = useAuth();
  const accountId = auth.user?.id ?? null;
  const [data, setData] = useState<ProjectComments | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingComment[]>([]);
  const [composer, setComposer] = useState<CommentComposerState>(EMPTY_COMPOSER);
  const [replyingToId, setReplyingToId] = useState<Id | null>(null);
  const [replyComposer, setReplyComposer] = useState<CommentComposerState>(EMPTY_COMPOSER);
  const [deletionRequestId, setDeletionRequestId] = useState<Id | null>(null);
  const [deletion, setDeletion] = useState<CommentDeletion | null>(null);
  const loadTokenRef = useRef(0);
  /**
   * The MUTATION GENERATION: which (project, account) pair the current UI belongs
   * to, and a counter that is bumped whenever that pair changes.
   *
   * An in-flight guard alone is not enough. It stops a second request starting, but
   * it cannot un-start the promise already running — so a write sent for project X
   * would still settle after the viewer moved to project Y, and its handler would
   * clear Y's composer, close Y's reply field, overwrite Y's delete state, or post
   * X's error against Y's thread. Every handler below now checks the generation it
   * was started in and returns silently if it is no longer current, which is the
   * only way to make an already-running promise harmless.
   */
  const generationRef = useRef(0);
  const inFlightRef = useRef<{
    comment: boolean;
    reply: boolean;
    delete: boolean;
  }>({
    comment: false,
    reply: false,
    delete: false
  });
  const localIdRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);
  const load = useCallback(() => {
    if (!projectId) {
      setData(null);
      setLoadError(null);
      return;
    }
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setData(null);
    setLoadError(null);
    commentService.listComments(projectId).then((next) => {
      if (!isMountedRef.current || loadTokenRef.current !== token) {
        return;
      }
      setData(next);
    }).catch((error) => {
      if (!isMountedRef.current || loadTokenRef.current !== token) {
        return;
      }
      // No thread rather than an empty one: "this could not be read" and "nobody
      // has commented" are different answers.
      setData(null);
      setLoadError(classify(error, 'The conversation could not be loaded.').message);
    });
  }, [commentService, projectId]);

  /**
   * A change of project OR account starts a new generation.
   *
   * A different project is a different conversation, and a different account is a
   * different author with different delete rights — so in both cases every draft,
   * pending write, failure, reply target, and deletion request from before belongs
   * to state that no longer exists. Bumping the generation invalidates any request
   * still in flight from the previous pair, and the local UI for it is cleared here.
   *
   * The public thread is RE-READ rather than simply discarded, because `canDelete`
   * is viewer-scoped while the comments themselves are not.
   */
  useEffect(() => {
    generationRef.current += 1;
    setPending([]);
    setComposer(EMPTY_COMPOSER);
    setReplyingToId(null);
    setReplyComposer(EMPTY_COMPOSER);
    setDeletionRequestId(null);
    setDeletion(null);
    inFlightRef.current = {
      comment: false,
      reply: false,
      delete: false
    };
    load();
    // `load` is itself keyed to the project, so both keys are covered here.
  }, [accountId, load]);
  const gateGuest = useCallback((label: string): boolean => {
    if (auth.isAuthenticated) {
      return false;
    }
    // The service refuses this independently; this is only so the person is asked
    // to sign in rather than shown a rejection.
    auth.requestAuthenticatedDestination(interactionIntent(label));
    return true;
  }, [auth]);

  /** One submit path for a comment and for a reply, since only the call differs. */
  const send = useCallback((kind: 'comment' | 'reply', body: string, parentId: Id | null) => {
    if (!projectId || inFlightRef.current[kind]) {
      return;
    }
    const setState = kind === 'comment' ? setComposer : setReplyComposer;
    const problem = validateCommentBody(body);
    if (problem) {
      setState((current) => ({
        ...current,
        error: problem,
        errorCode: 'validation',
        retry: null
      }));
      return;
    }
    const attempt = () => {
      inFlightRef.current[kind] = true;
      // The generation this attempt belongs to, captured BEFORE the request. Its
      // handlers are no-ops if the viewer has since changed project or account.
      const generation = generationRef.current;
      const isCurrent = () => isMountedRef.current && generationRef.current === generation;
      const localId = `pending-${localIdRef.current += 1}`;
      setState((current) => ({
        ...current,
        isSubmitting: true,
        error: null,
        errorCode: null,
        retry: null
      }));
      // Visibly pending, and never rendered as a posted comment.
      setPending((current) => [...current, {
        localId,
        body: body.trim(),
        parentId
      }]);
      // A reply states both the project and the parent, so the service can refuse
      // a parent that does not belong to this conversation rather than infer one.
      const request = kind === 'comment' ? commentService.createComment(projectId, body) : commentService.createReply(projectId, parentId as Id, body);
      request.then(() => {
        // A stale success must not clear this project's composer, close its reply
        // field, or trigger a reload of the project it was written against.
        if (!isCurrent()) {
          return;
        }
        // Confirmed: the pending representation is removed and the canonical list
        // is re-read, so what appears is what the service actually holds.
        setPending((current) => current.filter((item) => item.localId !== localId));
        setState(EMPTY_COMPOSER);
        if (kind === 'reply') {
          setReplyingToId(null);
        }
        load();
      }).catch((error) => {
        // A stale failure must not show the previous project's error and retry
        // against the conversation now on screen.
        if (!isCurrent()) {
          return;
        }
        const {
          code,
          message
        } = classify(error, 'That could not be posted.');
        setPending((current) => current.filter((item) => item.localId !== localId));
        // The exact text is preserved, and for a reply so is its target.
        setState({
          body,
          isSubmitting: false,
          error: message,
          errorCode: code,
          retry: isRetryableCommentCode(code) ? attempt : null
        });
      }).finally(() => {
        // Released only for the generation that took it: a later generation has
        // its own guard, and clearing another's would be meaningless.
        if (generationRef.current === generation) {
          inFlightRef.current[kind] = false;
        }
      });
    };
    attempt();
  }, [commentService, load, projectId]);
  const confirmDelete = useCallback(() => {
    const commentId = deletionRequestId;
    if (!commentId || inFlightRef.current.delete) {
      return;
    }
    const attempt = () => {
      inFlightRef.current.delete = true;
      // Deletion is bound to its generation for the same reason a write is: a
      // deletion sent on project X must not clear or overwrite project Y's delete
      // state when it settles.
      const generation = generationRef.current;
      const isCurrent = () => isMountedRef.current && generationRef.current === generation;
      setDeletion({
        commentId,
        isDeleting: true,
        error: null,
        retry: null
      });
      commentService.deleteComment(commentId).then(() => {
        if (!isCurrent()) {
          return;
        }
        // Removed only now that the service has confirmed it, by re-reading the
        // canonical list rather than editing the local copy.
        setDeletionRequestId(null);
        setDeletion(null);
        load();
      }).catch((error) => {
        if (!isCurrent()) {
          return;
        }
        const {
          code,
          message
        } = classify(error, 'That could not be deleted.');
        setDeletion({
          commentId,
          isDeleting: false,
          error: message,
          retry: isRetryableCommentCode(code) ? attempt : null
        });
        // Already gone: the list is re-read so it stops being offered, and the
        // outcome says so rather than claiming this request removed it.
        if (code === 'not_found') {
          load();
        }
      }).finally(() => {
        if (generationRef.current === generation) {
          inFlightRef.current.delete = false;
        }
      });
    };
    attempt();
  }, [commentService, deletionRequestId, load]);
  const threads = data?.threads ?? [];
  return useMemo(() => ({
    phase: loadError ? 'error' : data === null ? 'loading' : 'ready',
    threads,
    totalCount: data?.totalCount ?? 0,
    isEmpty: data !== null && threads.length === 0 && pending.length === 0,
    loadError,
    reload: load,
    pending,
    composer,
    setBody: (body) => setComposer((current) => ({
      ...current,
      body,
      // Typing clears the objection to what was there before.
      error: null,
      errorCode: null,
      retry: null
    })),
    submit: () => {
      if (gateGuest('join this conversation')) {
        return;
      }
      send('comment', composer.body, null);
    },
    replyingToId,
    startReply: (commentId) => {
      if (gateGuest('reply to this comment')) {
        return;
      }
      setReplyingToId(commentId);
      setReplyComposer(EMPTY_COMPOSER);
    },
    cancelReply: () => {
      setReplyingToId(null);
      setReplyComposer(EMPTY_COMPOSER);
    },
    replyComposer,
    setReplyBody: (body) => setReplyComposer((current) => ({
      ...current,
      body,
      error: null,
      errorCode: null,
      retry: null
    })),
    submitReply: () => {
      if (!replyingToId || gateGuest('reply to this comment')) {
        return;
      }
      send('reply', replyComposer.body, replyingToId);
    },
    deletionRequestId,
    requestDelete: (commentId) => setDeletionRequestId(commentId),
    cancelDelete: () => {
      setDeletionRequestId(null);
      setDeletion(null);
    },
    confirmDelete,
    deletion,
    canWrite: auth.isAuthenticated
  }), [auth.isAuthenticated, composer, confirmDelete, data, deletion, deletionRequestId, gateGuest, load, loadError, pending, replyComposer, replyingToId, send, threads]);
}
