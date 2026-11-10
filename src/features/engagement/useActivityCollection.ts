import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useEngagementStore } from '../../contexts/EngagementContext';
import type { EngagementKind } from '../../types/engagement';
import { isEngagementKind } from '../../types/engagement';
import type { Id, ProjectView } from '../../types/domain';

/**
 * One activity collection — Likes or Saved.
 *
 * `activity route → this query → EngagementService + ProjectService → activity UI`
 *
 * Two boundaries are involved on purpose, because two different facts are being
 * asked for: `EngagementService` says WHICH projects the viewer engaged with, and
 * `ProjectService` says what each of those projects actually IS. Nothing here
 * stores project metadata alongside the engagement, so a card can never drift from
 * the canonical record, and an id whose project no longer resolves produces no
 * card at all rather than a shell built from a remembered title.
 *
 * There is no second engagement database: membership is reconciled against the
 * canonical engagement store on every render, so pressing Like anywhere — inside
 * this list or on a feed card — adds or drops the entry immediately, with no
 * refetch and no reload.
 */
export type ActivityCollectionPhase = 'loading' | 'ready' | 'error';
export type ActivityCollection = {
  phase: ActivityCollectionPhase;
  /** Canonical, resolved projects, in the order the service reported them. */
  items: ProjectView[];
  /** True in `ready` with nothing in it: a genuine empty collection. */
  isEmpty: boolean;
  error: string | null;
  retry: () => void;
  /** True while newly-added ids are still being resolved into cards. */
  isResolvingMore: boolean;
  /** Completion time of the successful membership read, not an item date. */
  updatedAt: number | null;
};
export function useActivityCollection(kind: EngagementKind, isViewerOwnCollection: boolean): ActivityCollection {
  const {
    engagement: engagementService,
    projects: projectService
  } = useServices();
  const store = useEngagementStore();
  const [serviceIds, setServiceIds] = useState<Id[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<Id, ProjectView | null>>({});
  const [isResolvingMore, setIsResolvingMore] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const listTokenRef = useRef(0);
  const requestedRef = useRef<Set<Id>>(new Set());
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const loadIds = useCallback(() => {
    const token = listTokenRef.current + 1;
    listTokenRef.current = token;
    // Only the viewer's own collection can be read: the service is viewer-scoped,
    // so asking for anybody else's would be asking a question it cannot answer.
    if (!isViewerOwnCollection || !isEngagementKind(kind)) {
      setServiceIds([]);
      setError(null);
      setUpdatedAt(null);
      return;
    }
    setServiceIds(null);
    setError(null);
    setUpdatedAt(null);
    engagementService.listEngagedProjectIds(kind).then((ids) => {
      if (!isMountedRef.current || listTokenRef.current !== token) {
        return;
      }
      setServiceIds(ids);
      setUpdatedAt(Date.now());
    }).catch((readError) => {
      if (!isMountedRef.current || listTokenRef.current !== token) {
        return;
      }
      // No list rather than an empty one: "we could not read this" and "there is
      // nothing here" are different answers and only one of them is empty.
      setServiceIds(null);
      setError(readError instanceof Error && readError.message ? readError.message : 'This collection could not be loaded.');
    });
  }, [engagementService, isViewerOwnCollection, kind]);
  useEffect(() => {
    loadIds();
  }, [loadIds]);

  /**
   * The ids that belong in this collection right now.
   *
   * The service's list is the starting point, then the canonical store overrides
   * it in both directions: an id the store confirms is engaged belongs here even
   * if it was liked after the list was read, and an id the store confirms was
   * withdrawn is dropped even though the list still names it.
   */
  const known = isEngagementKind(kind) ? store.knownFor(kind) : { engaged: [], withdrawn: [] };
  const engagedKey = known.engaged.join(',');
  const withdrawnKey = known.withdrawn.join(',');
  const memberIds = useMemo(() => {
    const withdrawn = new Set(withdrawnKey ? withdrawnKey.split(',') : []);
    const engaged = engagedKey ? engagedKey.split(',') : [];
    const ordered: Id[] = [];
    for (const id of serviceIds ?? []) {
      if (!withdrawn.has(id) && !ordered.includes(id)) {
        ordered.push(id);
      }
    }
    // Engaged in this session but not in the service's list: newest first.
    for (const id of engaged) {
      if (!ordered.includes(id)) {
        ordered.unshift(id);
      }
    }
    return ordered;
  }, [engagedKey, serviceIds, withdrawnKey]);

  // Canonical resolution, one project at a time, cached. An id that does not
  // resolve is remembered as `null` so it is neither retried in a loop nor
  // rendered as a card.
  useEffect(() => {
    const pending = memberIds.filter((id) => !requestedRef.current.has(id));
    if (pending.length === 0) {
      return;
    }
    pending.forEach((id) => requestedRef.current.add(id));
    setIsResolvingMore(true);
    void Promise.all(pending.map((id) => projectService.getProjectView(id).then((view) => [id, view] as const).catch(() => [id, null] as const))).then((entries) => {
      if (!isMountedRef.current) {
        return;
      }
      setResolved((current) => {
        const next = {
          ...current
        };
        for (const [id, view] of entries) {
          next[id] = view;
        }
        return next;
      });
      setIsResolvingMore(false);
    });
  }, [memberIds, projectService]);
  const items = useMemo(() => memberIds.map((id) => resolved[id]).filter((view): view is ProjectView => Boolean(view)), [memberIds, resolved]);
  const isAwaitingFirstCards = memberIds.length > 0 && memberIds.some((id) => !(id in resolved));
  const phase: ActivityCollectionPhase = error ? 'error' : serviceIds === null || isAwaitingFirstCards ? 'loading' : 'ready';
  return {
    phase,
    items,
    isEmpty: phase === 'ready' && items.length === 0,
    error,
    retry: () => {
      requestedRef.current.clear();
      setResolved({});
      loadIds();
    },
    isResolvingMore,
    updatedAt: phase === 'ready' ? updatedAt : null
  };
}
