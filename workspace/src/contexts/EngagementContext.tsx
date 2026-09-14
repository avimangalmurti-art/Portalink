import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from './ServicesContext';
import { useAuth } from './AuthContext';
import { EngagementServiceError, isRetryableEngagementCode } from '../types/engagement';
import type { EngagementErrorCode, EngagementKind, ProjectEngagement } from '../types/engagement';
import type { Id } from '../types/domain';

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
 *   then the SERVICE's answer replaces it. A failure restores the exact record
 *   that was confirmed before the press — never a guess at what it was.
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
export function EngagementProvider({
  children


}: {children: React.ReactNode;}) {
  const {
    engagement: engagementService
  } = useServices();
  const auth = useAuth();
  const [entries, setEntries] = useState<Record<Id, ProjectEntry>>({});
  /** Tags the newest request per project, so an older answer is discarded. */
  const readTokenRef = useRef<Record<Id, number>>({});
  const mutationTokenRef = useRef<Record<string, number>>({});
  const requestedRef = useRef<Set<Id>>(new Set());
  const isMountedRef = useRef(true);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);
  const patch = useCallback((projectId: Id, next: Partial<ProjectEntry>) => {
    setEntries((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] ?? EMPTY_ENTRY),
        ...next
      }
    }));
  }, []);
  const load = useCallback((projectId: Id) => {
    const token = (readTokenRef.current[projectId] ?? 0) + 1;
    readTokenRef.current[projectId] = token;
    patch(projectId, {
      isResolving: true,
      resolveError: null
    });
    engagementService.getProjectEngagement(projectId).then((record) => {
      if (!isMountedRef.current || readTokenRef.current[projectId] !== token) {
        return;
      }
      patch(projectId, {
        record,
        isResolving: false,
        resolveError: null
      });
    }).catch((error) => {
      if (!isMountedRef.current || readTokenRef.current[projectId] !== token) {
        return;
      }
      // No record rather than a fabricated one: a control that could not read its
      // state says so instead of presenting itself as "not liked".
      patch(projectId, {
        isResolving: false,
        resolveError: messageFor(error, 'Engagement could not be loaded.').message
      });
    });
  }, [engagementService, patch]);
  const ensure = useCallback((projectId: Id) => {
    if (requestedRef.current.has(projectId)) {
      return;
    }
    requestedRef.current.add(projectId);
    load(projectId);
  }, [load]);
  const refresh = useCallback((projectId: Id) => {
    requestedRef.current.add(projectId);
    load(projectId);
  }, [load]);

  /**
   * Engagement is account data, so the cache is keyed to the ACCOUNT, not the
   * profile: an account without a creator profile still has its own engagement,
   * and two accounts must never share a cached record. Signing in, signing out, or
   * switching accounts drops every entry, so account B can never open the product
   * showing account A's likes, and a guest's "nothing engaged" cannot survive into
   * a session. The service is authoritative either way — this only prevents a
   * stale read being shown before it answers.
   */
  const accountId = auth.user?.id ?? null;
  useEffect(() => {
    requestedRef.current.clear();
    readTokenRef.current = {};
    mutationTokenRef.current = {};
    setEntries({});
  }, [accountId]);
  const toggle = useCallback((projectId: Id, kind: EngagementKind) => {
    // Gating happens here, once, rather than in each control. The action is not
    // queued for replay: after signing in the viewer presses again deliberately.
    if (!auth.isAuthenticated) {
      auth.requestAuthenticatedDestination({
        kind: 'interaction',
        label: kind === 'like' ? 'like this project' : kind === 'save' ? 'save this project' : 'repost this project'
      });
      return;
    }
    const entry = entries[projectId] ?? EMPTY_ENTRY;
    const confirmed = entry.record;
    if (!confirmed || entry.pending[kind]) {
      return;
    }
    const engaged = !confirmed[flagFor(kind)];
    const key = `${projectId}:${kind}`;
    const run = () => {
      const token = (mutationTokenRef.current[key] ?? 0) + 1;
      mutationTokenRef.current[key] = token;
      // Optimistic, but the record it rolls back to is captured here.
      setEntries((current) => {
        const existing = current[projectId] ?? EMPTY_ENTRY;
        return {
          ...current,
          [projectId]: {
            ...existing,
            record: existing.record ? withIntent(existing.record, kind, engaged) : existing.record,
            pending: {
              ...existing.pending,
              [kind]: true
            },
            failure: null
          }
        };
      });
      engagementService.setEngagement({
        projectId,
        kind,
        engaged
      }).then((record) => {
        if (!isMountedRef.current || mutationTokenRef.current[key] !== token) {
          return;
        }
        // The service's own answer, not the optimistic guess, including counts.
        setEntries((current) => {
          const existing = current[projectId] ?? EMPTY_ENTRY;
          return {
            ...current,
            [projectId]: {
              ...existing,
              record,
              pending: {
                ...existing.pending,
                [kind]: false
              },
              failure: null
            }
          };
        });
      }).catch((error) => {
        if (!isMountedRef.current || mutationTokenRef.current[key] !== token) {
          return;
        }
        const {
          code,
          message
        } = messageFor(error, 'That could not be saved.');
        setEntries((current) => {
          const existing = current[projectId] ?? EMPTY_ENTRY;
          return {
            ...current,
            [projectId]: {
              ...existing,
              // Rolled back to exactly what the service last confirmed.
              record: confirmed,
              pending: {
                ...existing.pending,
                [kind]: false
              },
              failure: {
                kind,
                code,
                message,
                retry: isRetryableEngagementCode(code) ? run : null
              }
            }
          };
        });
      });
    };
    run();
  }, [auth, engagementService, entries]);
  const dismissFailure = useCallback((projectId: Id) => patch(projectId, {
    failure: null
  }), [patch]);
  const store = useMemo<EngagementStore>(() => ({
    read: (projectId) => entries[projectId] ?? EMPTY_ENTRY,
    ensure,
    refresh,
    toggle,
    dismissFailure,
    knownFor: (kind) => {
      const engaged: Id[] = [];
      const withdrawn: Id[] = [];
      for (const [projectId, entry] of Object.entries(entries)) {
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
  }), [auth.isAuthenticated, dismissFailure, ensure, entries, refresh, toggle]);
  return <EngagementContext.Provider value={store}>{children}</EngagementContext.Provider>;
}
export function useEngagementStore(): EngagementStore {
  const store = useContext(EngagementContext);
  if (!store) {
    throw new Error('useEngagementStore must be used inside an EngagementProvider.');
  }
  return store;
}