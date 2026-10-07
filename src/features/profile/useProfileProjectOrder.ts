import { membershipSignature, useSavedChangeHistory, type HistoryWriteMode } from '../../hooks/useSavedChangeHistory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import type { Id, Project } from '../../types/domain';

function messageFor(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'That project order could not be saved.';
}

/** Owner-only ordering boundary for the project cards on the profile overview. */
export function useProfileProjectOrder(profileId: Id | null, projects: Project[], isOwner: boolean) {
  const { projects: projectService } = useServices();
  const { invalidateProfiles } = useProfileData();
  const canonicalIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const canonicalSignature = canonicalIds.join(',');
  const [order, setOrder] = useState<Id[]>(canonicalIds);
  const orderRef = useRef<Id[]>(canonicalIds);
  const committedOrderRef = useRef<Id[]>(canonicalIds);
  const [saveError, setSaveError] = useState<string | null>(null);
  const retryOrderRef = useRef<{ order: Id[]; mode: HistoryWriteMode } | null>(null);
  const historyState = useSavedChangeHistory<Id[]>({ scope: profileId && isOwner ? `profile:${profileId}` : null,
    membership: membershipSignature(canonicalIds), value: committedOrderRef.current,
    equals: (a, b) => a.join(',') === b.join(',') });
  const { begin, complete, finish, isCurrent, replay, isSaving } = historyState;
  const isMountedRef = useRef(true);
  const canonicalScopeRef = useRef({ profileId, signature: canonicalSignature });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const previous = canonicalScopeRef.current;
    canonicalScopeRef.current = { profileId, signature: canonicalSignature };
    // A background refresh must not discard a drag draft or a failed save's
    // retry. A different profile or changed membership still resets the scope.
    if (previous.profileId === profileId
      && membershipSignature(previous.signature ? previous.signature.split(',') : []) === membershipSignature(canonicalIds)
      && (isSaving || retryOrderRef.current || orderRef.current.join(',') !== committedOrderRef.current.join(','))) {
      if (!isSaving) {
        committedOrderRef.current = canonicalIds;
        setOrder([...orderRef.current]);
      }
      return;
    }
    orderRef.current = canonicalIds;
    committedOrderRef.current = canonicalIds;
    setOrder(canonicalIds);
    setSaveError(null);
    retryOrderRef.current = null;
    // The joined ids are the stable identity of the canonical order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, canonicalSignature]);

  const applyOrder = useCallback((next: Id[]) => {
    orderRef.current = next;
    setOrder(next);
    setSaveError(null);
    retryOrderRef.current = null;
  }, []);

  const move = useCallback((sourceId: Id, targetId: Id) => {
    if (!isOwner || isSaving || sourceId === targetId) return;
    const current = orderRef.current;
    const from = current.indexOf(sourceId);
    const to = current.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    applyOrder(next);
  }, [applyOrder, isOwner, isSaving]);

  const moveByOffset = useCallback((projectId: Id, offset: -1 | 1) => {
    if (!isOwner || isSaving) return;
    const current = orderRef.current;
    const from = current.indexOf(projectId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= current.length) return;
    const next = [...current];
    [next[from], next[to]] = [next[to], next[from]];
    applyOrder(next);
  }, [applyOrder, isOwner, isSaving]);

  const save = useCallback(async (next: Id[], mode: HistoryWriteMode = 'change'): Promise<boolean> => {
    if (!profileId || !isOwner) return false;
    // A partially applied Undo/Redo can invalidate its history entry after
    // refresh. The retained retry target is still a valid explicit change.
    const operation = begin(mode) ?? (mode !== 'change' ? begin('change') : null);
    if (!operation) return false;
    const previous = [...committedOrderRef.current];
    const snapshot = [...next];
    setSaveError(null); retryOrderRef.current = null;
    try {
      await projectService.saveProfileProjectOrder(profileId, snapshot);
      // The write may finish after navigation; the next visit must still reload
      // the stored order instead of the old cached profile.
      invalidateProfiles();
      if (!isCurrent(operation)) return false;
      complete(operation, previous, snapshot, 'Reorder projects');
      committedOrderRef.current = snapshot; orderRef.current = snapshot; setOrder(snapshot);
      return true;
    } catch (error) {
      // A multi-row write may have partially reached the server. Keep the retry
      // snapshot below while other surfaces reload what was actually stored.
      invalidateProfiles();
      if (!isCurrent(operation)) return false;
      orderRef.current = previous; setOrder(previous); setSaveError(messageFor(error));
      retryOrderRef.current = { order: snapshot, mode }; return false;
    } finally { finish(operation); }
  }, [begin, complete, finish, isCurrent, isOwner, profileId, projectService, invalidateProfiles]);

  const commit = useCallback(() => {
    if (retryOrderRef.current) return save(retryOrderRef.current.order, retryOrderRef.current.mode);
    const next = orderRef.current;
    if (next.join(',') === committedOrderRef.current.join(',')) {
      return Promise.resolve(true);
    }
    return save(next);
  }, [save]);

  const reset = useCallback(() => {
    applyOrder(committedOrderRef.current);
  }, [applyOrder]);

  const retry = useCallback(() => {
    const next = retryOrderRef.current;
    return next ? save(next.order, next.mode) : Promise.resolve(false);
  }, [save]);

  const undo = useCallback(() => replay('undo', save), [replay, save]);
  const redo = useCallback(() => replay('redo', save), [replay, save]);
  const history = useMemo(() => ({ canUndo: historyState.canUndo, canRedo: historyState.canRedo,
    undoLabel: historyState.undoLabel, redoLabel: historyState.redoLabel, isSaving, undo, redo }),
    [historyState.canUndo, historyState.canRedo, historyState.undoLabel, historyState.redoLabel, isSaving, undo, redo]);
  return useMemo(() => ({
    history,
    order,
    isSaving,
    saveError,
    isDirty: order.join(',') !== committedOrderRef.current.join(','),
    move,
    moveByOffset,
    commit,
    reset,
    retry,
    dismissError: () => setSaveError(null),
  }), [history, order, isSaving, saveError, move, moveByOffset, commit, reset, retry]);
}
