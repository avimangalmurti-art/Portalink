import { useEffect, useMemo } from 'react';
import { useEngagementStore } from '../../contexts/EngagementContext';
import type { EngagementKind, ProjectEngagement } from '../../types/engagement';
import type { Id } from '../../types/domain';

/**
 * The one boundary presentation uses for like, save, and repost.
 *
 * `UI → this hook → EngagementService`. It reads from the canonical store, so every
 * surface showing the same project shares one state and one set of counts; the
 * store owns resolution, optimism, rollback, retry, and stale-response protection.
 *
 * A null `projectId` is a real case (nothing open), and resolves to a quiet,
 * disabled lifecycle rather than a request.
 */
export type ProjectEngagementLifecycle = {
  /** The confirmed record, or null while resolving or after a failed read. */
  record: ProjectEngagement | null;
  isResolving: boolean;
  resolveError: string | null;
  retryResolve: () => void;
  /** True while THIS kind's mutation is in flight. */
  isPending: (kind: EngagementKind) => boolean;
  isEngaged: (kind: EngagementKind) => boolean;
  /** The public total, or null when the service does not report one. */
  count: (kind: EngagementKind) => number | null;
  toggle: (kind: EngagementKind) => void;
  failure: {
    kind: EngagementKind;
    message: string;
    retry: (() => void) | null;
  } | null;
  dismissFailure: () => void;
  /** False for a guest: pressing opens the sign-in gate instead of mutating. */
  canEngage: boolean;
};
export function useProjectEngagement(projectId: Id | null): ProjectEngagementLifecycle {
  const store = useEngagementStore();
  useEffect(() => {
    if (projectId) {
      store.ensure(projectId);
    }
    // The store de-duplicates, so mounting many cards for one project is one read.
  }, [projectId, store]);
  const entry = projectId ? store.read(projectId) : null;
  return useMemo(() => ({
    record: entry?.record ?? null,
    isResolving: entry?.isResolving ?? false,
    resolveError: entry?.resolveError ?? null,
    retryResolve: () => {
      if (projectId) {
        store.refresh(projectId);
      }
    },
    isPending: (kind) => entry?.pending[kind] === true,
    isEngaged: (kind) => {
      const record = entry?.record;
      if (!record) {
        return false;
      }
      return kind === 'like' ? record.isLiked : kind === 'save' ? record.isSaved : record.isReposted;
    },
    count: (kind) => {
      const record = entry?.record;
      if (!record) {
        return null;
      }
      return kind === 'like' ? record.likeCount : kind === 'save' ? record.saveCount : record.repostCount;
    },
    toggle: (kind) => {
      if (projectId) {
        store.toggle(projectId, kind);
      }
    },
    failure: entry?.failure ? {
      kind: entry.failure.kind,
      message: entry.failure.message,
      retry: entry.failure.retry
    } : null,
    dismissFailure: () => {
      if (projectId) {
        store.dismissFailure(projectId);
      }
    },
    canEngage: store.canEngage
  }), [entry, projectId, store]);
}