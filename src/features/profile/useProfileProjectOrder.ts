import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id, Project } from '../../types/domain';

function messageFor(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'That project order could not be saved.';
}

/** Owner-only ordering boundary for the project cards on the profile overview. */
export function useProfileProjectOrder(profileId: Id | null, projects: Project[], isOwner: boolean) {
  const { projects: projectService } = useServices();
  const canonicalIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const canonicalSignature = canonicalIds.join(',');
  const [order, setOrder] = useState<Id[]>(canonicalIds);
  const orderRef = useRef<Id[]>(canonicalIds);
  const committedOrderRef = useRef<Id[]>(canonicalIds);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const retryOrderRef = useRef<Id[] | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
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

  const save = useCallback(async (next: Id[]): Promise<boolean> => {
    if (!profileId || !isOwner) return false;
    const previous = committedOrderRef.current;
    setIsSaving(true);
    setSaveError(null);
    retryOrderRef.current = null;
    try {
      await projectService.saveProfileProjectOrder(profileId, next);
      if (!isMountedRef.current) return false;
      committedOrderRef.current = next;
      orderRef.current = next;
      setOrder(next);
      return true;
    } catch (error) {
      if (!isMountedRef.current) return false;
      orderRef.current = previous;
      setOrder(previous);
      setSaveError(messageFor(error));
      retryOrderRef.current = next;
      return false;
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [isOwner, profileId, projectService]);

  const commit = useCallback(() => {
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
    return next ? save(next) : Promise.resolve(false);
  }, [save]);

  return useMemo(() => ({
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
  }), [order, isSaving, saveError, move, moveByOffset, commit, reset, retry]);
}
