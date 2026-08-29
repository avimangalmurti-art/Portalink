import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id, Project, ProjectArrangement } from '../../types/domain';

/**
 * The owner's project-arrangement boundary for one category.
 *
 * UI → this hook → `ProjectService` → implementation. Ordering and hiding used
 * to be component state inside the category page, which meant the arrangement
 * existed only for as long as that component stayed mounted: switching category
 * and coming back reset it, and nothing outside the component could ever know
 * about it. Both now load from and save through the service.
 *
 * Saves are optimistic. Dragging a row or hiding one is cheap and reversible,
 * and a drag must stay smooth, so the new arrangement is shown immediately and
 * rolled back if the store refuses it — never left displaying a state the store
 * rejected.
 *
 * Honest about durability: the prototype implementation keeps this in memory for
 * the session, so a reload resets it. Nothing here should tell the viewer their
 * arrangement is saved permanently.
 */

export type ProjectArrangementState = {
  /** The saved order, reconciled against the work the category currently holds. */
  order: Id[];
  hiddenIds: Id[];
  /** Work the owner has fixed to the top of the index. */
  pinnedIds: Id[];
  isLoading: boolean;
  /** The arrangement could not be read. The index is offered unarranged. */
  loadError: string | null;
  reload: () => void;
  /** A save is in flight. */
  isSaving: boolean;
  /** The store refused the change; the local view has been rolled back. */
  saveError: string | null;
  dismissSaveError: () => void;
  /** Re-runs exactly the save that failed. */
  retrySave: (() => void) | null;
  reorder: (projectIds: Id[]) => void;
  toggleHidden: (projectId: Id) => void;
  /**
   * Pins or unpins one project. Pinning is a position, not a privacy state, so
   * it changes nothing about who can read the work.
   */
  togglePinned: (projectId: Id) => void;
  /**
   * Applies the arrangement to a category's canonical projects. Hidden work is
   * withheld from non-owners entirely, and sits at the end for the owner.
   */
  arrange: (projects: Project[], includeHidden: boolean) => Project[];
};

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useProjectArrangement(profileId: Id | null, categoryId: Id | null, isOwner: boolean): ProjectArrangementState {
  const { projects: projectService } = useServices();
  const [arrangement, setArrangement] = useState<ProjectArrangement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retrySave, setRetrySave] = useState<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (!profileId || !categoryId) {
      setArrangement(null);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    projectService.getProjectArrangement(profileId, categoryId).then((next) => {
      if (!isMountedRef.current) {
        return;
      }
      setArrangement(next);
    }).catch((error) => {
      if (!isMountedRef.current) {
        return;
      }
      // A failed read is not an empty arrangement: saying "no order, nothing
      // hidden" would silently reveal hidden work. The index falls back to the
      // record's own order and the failure is reported.
      setArrangement(null);
      setLoadError(messageFor(error, 'This category’s arrangement could not be loaded.'));
    }).finally(() => {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    });
  }, [projectService, profileId, categoryId]);
  useEffect(load, [load]);

  const save = useCallback((next: ProjectArrangement, previous: ProjectArrangement | null) => {
    if (!profileId || !categoryId) {
      return;
    }
    setArrangement(next);
    setIsSaving(true);
    setSaveError(null);
    setRetrySave(null);
    projectService.saveProjectArrangement(profileId, categoryId, next).catch((error) => {
      if (!isMountedRef.current) {
        return;
      }
      // Rolled back, so the index never shows an arrangement the store rejected.
      setArrangement(previous);
      setSaveError(messageFor(error, 'That change could not be saved.'));
      setRetrySave(() => () => save(next, previous));
    }).finally(() => {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    });
  }, [projectService, profileId, categoryId]);

  const order = arrangement?.projectOrder ?? [];
  const hiddenIds = arrangement?.hiddenProjectIds ?? [];
  const pinnedIds = arrangement?.pinnedProjectIds ?? [];

  const reorder = useCallback((projectIds: Id[]) => {
    if (!isOwner) {
      return;
    }
    const previous = arrangement;
    save({
      projectOrder: projectIds,
      hiddenProjectIds: previous?.hiddenProjectIds ?? [],
      pinnedProjectIds: previous?.pinnedProjectIds ?? []
    }, previous);
  }, [isOwner, arrangement, save]);

  const toggleHidden = useCallback((projectId: Id) => {
    if (!isOwner) {
      return;
    }
    const previous = arrangement;
    const currentHidden = previous?.hiddenProjectIds ?? [];
    const isHiding = !currentHidden.includes(projectId);
    save({
      // The order is written alongside, because hiding a row changes where the
      // remaining rows sit and the arrangement must record what the owner sees.
      projectOrder: previous?.projectOrder ?? [],
      hiddenProjectIds: isHiding ? [...currentHidden, projectId] : currentHidden.filter((id) => id !== projectId),
      // Hiding work releases its pin: a project cannot be both fixed to the top
      // of the index and withheld from it.
      pinnedProjectIds: isHiding ? (previous?.pinnedProjectIds ?? []).filter((id) => id !== projectId) : previous?.pinnedProjectIds ?? []
    }, previous);
  }, [isOwner, arrangement, save]);

  const togglePinned = useCallback((projectId: Id) => {
    if (!isOwner) {
      return;
    }
    const previous = arrangement;
    const currentPinned = previous?.pinnedProjectIds ?? [];
    const isPinning = !currentPinned.includes(projectId);
    save({
      projectOrder: previous?.projectOrder ?? [],
      // Pinning brings work back into view, for the same reason.
      hiddenProjectIds: isPinning ? (previous?.hiddenProjectIds ?? []).filter((id) => id !== projectId) : previous?.hiddenProjectIds ?? [],
      pinnedProjectIds: isPinning ? [...currentPinned, projectId] : currentPinned.filter((id) => id !== projectId)
    }, previous);
  }, [isOwner, arrangement, save]);

  const arrange = useCallback((categoryProjects: Project[], includeHidden: boolean) => {
    const ranked = [...categoryProjects].sort((a, b) => {
      const indexA = order.indexOf(a.id);
      const indexB = order.indexOf(b.id);
      return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
    });
    const shown = ranked.filter((project) => !hiddenIds.includes(project.id));
    if (!includeHidden) {
      return shown;
    }
    // Hidden entries always sit at the bottom of the owner's index.
    return [...shown, ...ranked.filter((project) => hiddenIds.includes(project.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order/hiddenIds are derived arrays.
  }, [order.join(','), hiddenIds.join(',')]);

  return useMemo(() => ({
    order,
    hiddenIds,
    pinnedIds,
    isLoading,
    loadError,
    reload: load,
    isSaving,
    saveError,
    dismissSaveError: () => {
      setSaveError(null);
      setRetrySave(null);
    },
    retrySave,
    reorder,
    toggleHidden,
    togglePinned,
    arrange
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order/hiddenIds are derived arrays.
  }), [order.join(','), hiddenIds.join(','), pinnedIds.join(','), isLoading, loadError, load, isSaving, saveError, retrySave, reorder, toggleHidden, togglePinned, arrange]);
}