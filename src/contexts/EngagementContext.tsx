import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from './ServicesContext';
import { useAuth } from './AuthContext';
import { EngagementServiceError, isRetryableEngagementCode } from '../types/engagement';
import type { EngagementErrorCode, EngagementKind, ProjectEngagement } from '../types/engagement';
import type { Id } from '../types/domain';
import { interactionIntent } from '../features/auth/interactionIntent';

/**
 * The CANONICAL engagement store.
 *
 * `UI → useProjectEngagement(projectId) → EngagementService → implementation`, with
 * this provider as the single cache in between. It exists because engagement is
 * the same fact on several surfaces at once — a feed card, the project viewer, and
 * the viewer's own activity list can all be showing one project — and a per-card
 * `useState` would let them disagree. One record per project id lives here, so
 * liking a project in the viewer updates its feed card with no refetch.
 *
 * What this store guarantees:
 *
 * - **Optimism is bounded and reversible.** A press applies the viewer's intent
 *   immediately (with its count adjusted only where a count is actually known),
 *   then the SERVICE's answer confirms that kind. A failure restores only that
 *   kind, preserving independent likes, saves, or reposts made in the meantime.
 * - **Stale answers cannot win.** Every read and every mutation is tagged, and a
 *   response is dropped unless it is still the newest for that project and kind.
 * - **Guests are gated, not lied to.** An unauthenticated press mutates nothing
 *   and opens the existing sign-in gate; nothing is queued to replay afterwards.
 * - **Counts are never invented.** A `null` total stays null through a mutation.
 */
type PendingState = Partial<Record<EngagementKind, boolean>>;
type FailureState = {
  kind: EngagementKind;
  code: EngagementErrorCode;
  message: string;
  retry: (() => void) | null;
};
type ProjectEntry = {
  record: ProjectEngagement | null;
  isResolving: boolean;
  resolveError: string | null;
  pending: PendingState;
  failure: FailureState | null;
};
const EMPTY_ENTRY: ProjectEntry = {
  record: null,
  isResolving: false,
  resolveError: null,
  pending: {},
  failure: null
};
type EngagementStore = {
  read(projectId: Id): ProjectEntry;
  /** Idempotent: repeated calls for a resolved project do not re-request. */
  ensure(projectId: Id): void;
  refresh(projectId: Id): void;
  toggle(projectId: Id, kind: EngagementKind): void;
  dismissFailure(projectId: Id): void;
  /**
   * What the store currently KNOWS about a kind, for an activity collection.
   *
   * `engaged` are ids the viewer is confirmed to have engaged with, and
   * `withdrawn` are ids it is confirmed they have not. Both come from the same
   * cached records the controls render from, which is what lets a collection add
   * or drop an entry the moment a control elsewhere is pressed — no second list,
   * no reload. An id in neither set is simply unknown to the store, and the
   * collection's own service read stays authoritative for it.
   */
  knownFor(kind: EngagementKind): {
    engaged: Id[];
    withdrawn: Id[];
  };
  /** True while the viewer can engage at all. False for a guest. */
  canEngage: boolean;
};
const EngagementContext = createContext<EngagementStore | null>(null);
function flagFor(kind: EngagementKind): 'isLiked' | 'isSaved' | 'isReposted' {
  return kind === 'like' ? 'isLiked' : kind === 'save' ? 'isSaved' : 'isReposted';
}
function countFor(kind: EngagementKind): 'likeCount' | 'saveCount' | 'repostCount' {
  return kind === 'like' ? 'likeCount' : kind === 'save' ? 'saveCount' : 'repostCount';
}
const ENGAGEMENT_KINDS: EngagementKind[] = ['like', 'save', 'repost'];

/** A summary for one mutation cannot confirm another kind's concurrent write. */
function withConfirmedKind(record: ProjectEngagement, confirmed: ProjectEngagement, kind: EngagementKind): ProjectEngagement {
  const flag = flagFor(kind);
  const count = countFor(kind);
  return { ...record, [flag]: confirmed[flag], [count]: confirmed[count] };
}

/** Applies the viewer's intent locally. A null total stays null. */
function withIntent(record: ProjectEngagement, kind: EngagementKind, engaged: boolean): ProjectEngagement {
  const flag = flagFor(kind);
  const count = countFor(kind);
  const current = record[flag];
  const total = record[count];
  return {
    ...record,
    [flag]: engaged,
    [count]: total === null || current === engaged ? total : Math.max(0, total + (engaged ? 1 : -1))
  };
}
function messageFor(error: unknown, fallback: string): {
  code: EngagementErrorCode;
  message: string;
} {
  if (error instanceof EngagementServiceError) {
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
export function EngagementProvider({ children }: { children: React.ReactNode }) {
  const { engagement: engagementService } = useServices();
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  const accountId = auth.user?.id ?? null;
  // Replace the entire scope synchronously on identity/service changes. Reads,
  // mutation completions and retained Retry callbacks belong to that one scope.
  const scope = useMemo(() => ({
    accountId,
    engagementService,
    entries: {} as Record<Id, ProjectEntry>,
    readTokens: {} as Record<Id, number>,
    mutationTokens: {} as Record<string, number>,
    requested: new Set<Id>(),
  }), [accountId, engagementService]);
  const [snapshot, setSnapshot] = useState({ scope, entries: scope.entries });
  const entries = snapshot.scope === scope ? snapshot.entries : scope.entries;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const isCurrent = useCallback(() => isMountedRef.current && currentScope.current === scope, [scope]);
  const patch = useCallback((projectId: Id, next: Partial<ProjectEntry>) => {
    if (!isCurrent()) return;
    // Update the ref-owned record before scheduling React. Two presses in the
    // same event turn therefore see the pending lock and each other's intent.
    scope.entries = { ...scope.entries, [projectId]: { ...(scope.entries[projectId] ?? EMPTY_ENTRY), ...next } };
    setSnapshot({ scope, entries: scope.entries });
  }, [isCurrent, scope]);
  const load = useCallback((projectId: Id) => {
    if (!isCurrent()) return;
    const token = (scope.readTokens[projectId] ?? 0) + 1;
    scope.readTokens[projectId] = token;
    const startingTokens = ENGAGEMENT_KINDS.map(kind => scope.mutationTokens[`${projectId}:${kind}`] ?? 0);
    const startingPending = { ...scope.entries[projectId]?.pending };
    patch(projectId, { isResolving: true, resolveError: null });
    engagementService.getProjectEngagement(projectId).then((record) => {
      if (!isCurrent() || scope.readTokens[projectId] !== token) return;
      const entry = scope.entries[projectId] ?? EMPTY_ENTRY;
      let merged = entry.record ?? record;
      ENGAGEMENT_KINDS.forEach((kind, index) => {
        // A read begun before or during a mutation cannot undo its optimistic,
        // confirmed, or rolled-back result. Unaffected kinds can still refresh.
        if (!startingPending[kind] && !entry.pending[kind] &&
          (scope.mutationTokens[`${projectId}:${kind}`] ?? 0) === startingTokens[index]) {
          merged = withConfirmedKind(merged, record, kind);
        }
      });
      patch(projectId, { record: merged, isResolving: false, resolveError: null });
    }).catch((error) => {
      if (!isCurrent() || scope.readTokens[projectId] !== token) return;
      // No record rather than a fabricated one: a control that could not read its
      // state says so instead of presenting itself as "not liked".
      patch(projectId, {
        isResolving: false,
        resolveError: messageFor(error, 'Engagement could not be loaded.').message
      });
    });
  }, [engagementService, isCurrent, patch, scope]);
  const ensure = useCallback((projectId: Id) => {
    if (!isCurrent() || scope.requested.has(projectId)) return;
    scope.requested.add(projectId);
    load(projectId);
  }, [isCurrent, load, scope]);
  const refresh = useCallback((projectId: Id) => {
    if (!isCurrent()) return;
    scope.requested.add(projectId);
    load(projectId);
  }, [isCurrent, load, scope]);
  const toggle = useCallback((projectId: Id, kind: EngagementKind) => {
    if (!isCurrent()) return;
    // Gating happens here, once, rather than in each control. The action is not
    // queued for replay: after signing in the viewer presses again deliberately.
    if (!authRef.current.isAuthenticated) {
      authRef.current.requestAuthenticatedDestination(interactionIntent(
        kind === 'like' ? 'like this project' : kind === 'save' ? 'save this project' : 'repost this project'
      ));
      return;
    }
    const initial = scope.entries[projectId] ?? EMPTY_ENTRY;
    if (!initial.record || initial.pending[kind]) return;
    const engaged = !initial.record[flagFor(kind)];
    const key = `${projectId}:${kind}`;
    const run = () => {
      if (!isCurrent() || !authRef.current.isAuthenticated) return;
      const entry = scope.entries[projectId] ?? EMPTY_ENTRY;
      const confirmed = entry.record;
      if (!confirmed || entry.pending[kind]) return;
      const token = (scope.mutationTokens[key] ?? 0) + 1;
      scope.mutationTokens[key] = token;
      patch(projectId, {
        record: withIntent(confirmed, kind, engaged),
        pending: { ...entry.pending, [kind]: true },
        failure: entry.failure?.kind === kind ? null : entry.failure,
      });
      engagementService.setEngagement({
        projectId,
        kind,
        engaged
      }).then((record) => {
        if (!isCurrent() || scope.mutationTokens[key] !== token) return;
        const existing = scope.entries[projectId];
        patch(projectId, {
          record: withConfirmedKind(existing.record ?? confirmed, record, kind),
          pending: { ...existing.pending, [kind]: false },
          failure: existing.failure?.kind === kind ? null : existing.failure,
        });
      }).catch((error) => {
        if (!isCurrent() || scope.mutationTokens[key] !== token) return;
        const { code, message } = messageFor(error, 'That could not be saved.');
        const existing = scope.entries[projectId];
        patch(projectId, {
          record: withConfirmedKind(existing.record ?? confirmed, confirmed, kind),
          pending: { ...existing.pending, [kind]: false },
          failure: { kind, code, message, retry: isRetryableEngagementCode(code) ? () => {
            // A saved Retry callback cannot replay over a newer action or user.
            if (scope.mutationTokens[key] === token && scope.entries[projectId]?.failure?.kind === kind) run();
          } : null },
        });
      });
    };
    run();
  }, [engagementService, isCurrent, patch, scope]);
  const dismissFailure = useCallback((projectId: Id) => patch(projectId, {
    failure: null
  }), [patch]);
  const store = useMemo<EngagementStore>(() => ({
    read: (projectId) => isCurrent() ? entries[projectId] ?? EMPTY_ENTRY : EMPTY_ENTRY,
    ensure,
    refresh,
    toggle,
    dismissFailure,
    knownFor: (kind) => {
      const engaged: Id[] = [];
      const withdrawn: Id[] = [];
      for (const [projectId, entry] of Object.entries(isCurrent() ? entries : {})) {
        if (!entry.record) {
          continue;
        }
        (entry.record[flagFor(kind)] ? engaged : withdrawn).push(projectId);
      }
      return {
        engaged,
        withdrawn
      };
    },
    canEngage: auth.isAuthenticated
  }), [auth.isAuthenticated, dismissFailure, ensure, entries, isCurrent, refresh, toggle]);
  return <EngagementContext.Provider value={store}>{children}</EngagementContext.Provider>;
}
export function useEngagementStore(): EngagementStore {
  const store = useContext(EngagementContext);
  if (!store) {
    throw new Error('useEngagementStore must be used inside an EngagementProvider.');
  }
  return store;
}
