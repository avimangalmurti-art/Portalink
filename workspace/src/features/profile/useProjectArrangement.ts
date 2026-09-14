import { membershipSignature, useSavedChangeHistory, type HistoryWriteMode, type SavedChangeActions } from '../../hooks/useSavedChangeHistory';
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
  history: SavedChangeActions;
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

export function useProjectArrangement(profileId: Id | null, categoryId: Id | null, isOwner: boolean, canonicalIds: Id[] = []): ProjectArrangementState {
  const { projects: projectService } = useServices();
  const [arrangement, setArrangement] = useState<ProjectArrangement | null>(null);
  const canonicalMembership = membershipSignature(canonicalIds);
  const scope = `${profileId ?? ''}:${categoryId ?? ''}:${canonicalMembership}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const loadVersion = useRef(0);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [loading, setIsLoading] = useState(true);
  const isLoading = loading || loadedScope !== scope;
  const [loadError, setLoadError] = useState<string | null>(null);
  const historyState = useSavedChangeHistory<ProjectArrangement>({ scope: profileId && categoryId && isOwner ? scope : null,
    membership: canonicalMembership, value: loadedScope === scope ? arrangement : null,
    equals: (a, b) => a.projectOrder.join(',') === b.projectOrder.join(',') && membershipSignature(a.hiddenProjectIds) === membershipSignature(b.hiddenProjectIds) && membershipSignature(a.pinnedProjectIds) === membershipSignature(b.pinnedProjectIds) });
  const { begin, complete, finish, isCurrent, replay, isSaving } = historyState;
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
    const version = ++loadVersion.current;
    const current = () => isMountedRef.current && version === loadVersion.current && scopeRef.current === scope;
    if (!profileId || !categoryId) {
      setArrangement(null); setLoadedScope(scope); setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    projectService.getProjectArrangement(profileId, categoryId).then((next) => {
      if (!current()) {
        return;
      }
      setArrangement(next);
    }).catch((error) => {
      if (!current()) {
        return;
      }
      // A failed read is not an empty arrangement: saying "no order, nothing
      // hidden" would silently reveal hidden work. The index falls back to the
      // record's own order and the failure is reported.
      setArrangement(null);
      setLoadError(messageFor(error, 'This category’s arrangement could not be loaded.'));
    }).finally(() => {
      if (current()) {
        setLoadedScope(scope); setIsLoading(false);
      }
    });
  }, [projectService, profileId, categoryId, scope]);
  useEffect(() => { const generation = loadVersion; setSaveError(null); setRetrySave(null); load(); return () => { generation.current++; }; }, [load]);

  const save = useCallback(async (next: ProjectArrangement, previous: ProjectArrangement | null, mode: HistoryWriteMode = 'change', label = 'Change project arrangement'): Promise<boolean> => {
    if (!profileId || !categoryId || !isOwner || isLoading || loadError) return false;
    const operation = begin(mode);
    if (!operation) return false;
    setArrangement(next); setSaveError(null); setRetrySave(null);
    try {
      await projectService.saveProjectArrangement(profileId, categoryId, next);
      if (!isCurrent(operation)) return false;
      complete(operation, previous, next, label); return true;
    } catch (error) {
      if (!isCurrent(operation)) return false;
      setArrangement(previous); setSaveError(messageFor(error, 'That change could not be saved.'));
      setRetrySave(() => () => { void save(next, previous, mode, label); }); return false;
    } finally { finish(operation); }
  }, [begin, complete, finish, isCurrent, projectService, profileId, categoryId, isOwner, isLoading, loadError]);

  const order = arrangement?.projectOrder ?? [];
  const hiddenIds = arrangement?.hiddenProjectIds ?? [];
  const pinnedIds = arrangement?.pinnedProjectIds ?? [];

  const reorder = useCallback((projectIds: Id[]) => {
    if (!isOwner) {
      return;
    }
    const previous = arrangement;
    void save({
      projectOrder: projectIds,
      hiddenProjectIds: previous?.hiddenProjectIds ?? [],
      pinnedProjectIds: previous?.pinnedProjectIds ?? []
    }, previous, 'change', 'Reorder projects');
  }, [isOwner, arrangement, save]);

  const toggleHidden = useCallback((projectId: Id) => {
    if (!isOwner) {
      return;
    }
    const previous = arrangement;
    const currentHidden = previous?.hiddenProjectIds ?? [];
    const isHiding = !currentHidden.includes(projectId);
    void save({
      // The order is written alongside, because hiding a row changes where the
      // remaining rows sit and the arrangement must record what the owner sees.
      projectOrder: previous?.projectOrder ?? [],
      hiddenProjectIds: isHiding ? [...currentHidden, projectId] : currentHidden.filter((id) => id !== projectId),
      // Hiding work releases its pin: a project cannot be both fixed to the top
      // of the index and withheld from it.
      pinnedProjectIds: isHiding ? (previous?.pinnedProjectIds ?? []).filter((id) => id !== projectId) : previous?.pinnedProjectIds ?? []
    }, previous, 'change', isHiding ? 'Hide project' : 'Show project');
  }, [isOwner, arrangement, save]);

  const togglePinned = useCallback((projectId: Id) => {
    if (!isOwner) {
      return;
    }
    const previous = arrangement;
    const currentPinned = previous?.pinnedProjectIds ?? [];
    const isPinning = !currentPinned.includes(projectId);
    void save({
      projectOrder: previous?.projectOrder ?? [],
      // Pinning brings work back into view, for the same reason.
      hiddenProjectIds: isPinning ? (previous?.hiddenProjectIds ?? []).filter((id) => id !== projectId) : previous?.hiddenProjectIds ?? [],
      pinnedProjectIds: isPinning ? [...currentPinned, projectId] : currentPinned.filter((id) => id !== projectId)
    }, previous, 'change', isPinning ? 'Pin project' : 'Unpin project');
  }, [isOwner, arrangement, save]);

  const arrange = useCallback((categoryProjects: Project[], includeHidden: boolean) => {
    // A visitor cannot be shown the unfiltered canonical list while visibility
    // is still loading (or failed to load). Unknown visibility is not public.
    if (!includeHidden && (isLoading || loadError !== null)) {
      return [];
    }
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
  }, [order.join(','), hiddenIds.join(','), isLoading, loadError]);

  const restore = useCallback((next: ProjectArrangement, mode: HistoryWriteMode) => save(next, arrangement, mode), [save, arrangement]);
  const undo = useCallback(() => replay('undo', restore), [replay, restore]);
  const redo = useCallback(() => replay('redo', restore), [replay, restore]);
  const history = useMemo(() => ({ canUndo: historyState.canUndo && !isLoading && !loadError, canRedo: historyState.canRedo && !isLoading && !loadError,
    undoLabel: historyState.undoLabel, redoLabel: historyState.redoLabel, isSaving, undo, redo }),
    [isLoading, loadError, historyState.canUndo, historyState.canRedo, historyState.undoLabel, historyState.redoLabel, isSaving, undo, redo]);
  return useMemo(() => ({
    history,
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
  }), [history, order.join(','), hiddenIds.join(','), pinnedIds.join(','), isLoading, loadError, load, isSaving, saveError, retrySave, reorder, toggleHidden, togglePinned, arrange]);
}
