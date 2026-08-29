import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id, ProjectDesign } from '../../types/domain';
import { DEFAULT_PAGES_PER_ROW, normalizePagesPerRow } from './pageLayout';

/**
 * The project-typography boundary.
 *
 * UI → this hook → `ProjectService` → implementation. Typography used to be a
 * `Record<projectId, typefaceId>` owned by the app shell, written by a callback
 * threaded down through the category page: a second source of truth that no
 * service knew about, that could not fail, and that reported nothing when it did.
 *
 * The face is a property of the project now, so it is resolved from the record and
 * every change is a write that can be pending, refused, and retried.
 */
const DEFAULT_TYPEFACE_ID = 'default';
export type ProjectTypographyState = {
  isLoading: boolean;
  /** The designs could not be read; every project falls back to the interface face. */
  loadError: string | null;
  reload: () => void;
  /** The project's confirmed face, or the face a save is optimistically showing. */
  resolveTypefaceId: (projectId: Id | null) => string;
  /** The opening page density saved with the project. */
  resolvePagesPerRow: (projectId: Id | null, fallback?: number) => number;
  /** The project a save is currently in flight for. */
  savingProjectId: Id | null;
  saveError: string | null;
  /** Re-runs exactly the change that was refused. */
  retrySave: (() => void) | null;
  dismissSaveError: () => void;
  setTypeface: (projectId: Id, typefaceId: string) => Promise<boolean>;
  setPagesPerRow: (projectId: Id, pagesPerRow: number) => Promise<boolean>;
};
function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
export function useProjectTypography(projectIds: Id[]): ProjectTypographyState {
  const {
    projects: projectService
  } = useServices();
  const [designs, setDesigns] = useState<Record<Id, ProjectDesign>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [savingProjectId, setSavingProjectId] = useState<Id | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retrySave, setRetrySave] = useState<(() => void) | null>(null);
  // One save at a time, independently of any disabled control, so two quick
  // choices cannot race and leave the project in whichever landed last.
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);
  // Stringified so a re-render producing an equal array does not re-request.
  const key = projectIds.join('|');
  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (ids.length === 0) {
      setDesigns({});
      setIsLoading(false);
      setLoadError(null);
      return undefined;
    }
    let isCurrent = true;
    setIsLoading(true);
    setLoadError(null);
    projectService.listProjectDesigns(ids).then((next) => {
      if (!isCurrent) {
        return;
      }
      setDesigns(next);
      setIsLoading(false);
    }).catch((caught) => {
      if (!isCurrent) {
        return;
      }
      // No face is substituted: the interface face is the honest fallback when
      // the project's own choice could not be read.
      setDesigns({});
      setLoadError(messageFor(caught, 'Project typography could not be loaded.'));
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [projectService, key, attempt]);
  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const resolveTypefaceId = useCallback((projectId: Id | null) => {
    if (!projectId) {
      return DEFAULT_TYPEFACE_ID;
    }
    return designs[projectId]?.typefaceId ?? DEFAULT_TYPEFACE_ID;
  }, [designs]);
  const resolvePagesPerRow = useCallback((projectId: Id | null, fallback = DEFAULT_PAGES_PER_ROW) => {
    if (!projectId) {
      return fallback;
    }
    return designs[projectId]?.pagesPerRow ?? fallback;
  }, [designs]);
  const setTypeface = useCallback(async (projectId: Id, typefaceId: string) => {
    if (isSavingRef.current) {
      return false;
    }
    isSavingRef.current = true;
    // Optimistic, because choosing a face is a live typographic judgement and
    // waiting a round trip to see it would make the inspector unusable. The last
    // service-confirmed design is kept so a refusal restores exactly that.
    const confirmed = designs[projectId];
    const nextDesign: ProjectDesign = {
      ...(confirmed ?? {}),
      typefaceId
    };
    setDesigns((current) => ({
      ...current,
      [projectId]: nextDesign
    }));
    setSavingProjectId(projectId);
    setSaveError(null);
    setRetrySave(null);
    try {
      const saved = await projectService.updateProjectDesign(projectId, nextDesign);
      if (isMountedRef.current) {
        setDesigns((current) => ({
          ...current,
          [projectId]: saved
        }));
      }
      return true;
    } catch (caught) {
      if (isMountedRef.current) {
        setDesigns((current) => {
          const next = {
            ...current
          };
          if (confirmed) {
            next[projectId] = confirmed;
          } else {
            delete next[projectId];
          }
          return next;
        });
        setSaveError(messageFor(caught, 'That typeface could not be saved.'));
        setRetrySave(() => () => {
          void setTypeface(projectId, typefaceId);
        });
      }
      return false;
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) {
        setSavingProjectId(null);
      }
    }
  }, [designs, projectService]);
  const setPagesPerRow = useCallback(async (projectId: Id, pagesPerRow: number) => {
    if (isSavingRef.current) {
      return false;
    }
    const normalized = normalizePagesPerRow(pagesPerRow);
    isSavingRef.current = true;
    const confirmed = designs[projectId];
    const nextDesign: ProjectDesign = {
      ...(confirmed ?? { typefaceId: DEFAULT_TYPEFACE_ID }),
      pagesPerRow: normalized
    };
    setDesigns((current) => ({
      ...current,
      [projectId]: nextDesign
    }));
    setSavingProjectId(projectId);
    setSaveError(null);
    setRetrySave(null);
    try {
      const saved = await projectService.updateProjectDesign(projectId, nextDesign);
      if (isMountedRef.current) {
        setDesigns((current) => ({
          ...current,
          [projectId]: saved
        }));
      }
      return true;
    } catch (caught) {
      if (isMountedRef.current) {
        setDesigns((current) => {
          const next = {
            ...current
          };
          if (confirmed) {
            next[projectId] = confirmed;
          } else {
            delete next[projectId];
          }
          return next;
        });
        setSaveError(messageFor(caught, 'That page layout could not be saved.'));
        setRetrySave(() => () => {
          void setPagesPerRow(projectId, normalized);
        });
      }
      return false;
    } finally {
      isSavingRef.current = false;
      if (isMountedRef.current) {
        setSavingProjectId(null);
      }
    }
  }, [designs, projectService]);
  return useMemo(() => ({
    isLoading,
    loadError,
    reload,
    resolveTypefaceId,
    resolvePagesPerRow,
    savingProjectId,
    saveError,
    retrySave,
    dismissSaveError: () => setSaveError(null),
    setTypeface,
    setPagesPerRow
  }), [isLoading, loadError, reload, resolveTypefaceId, resolvePagesPerRow, savingProjectId, saveError, retrySave, setTypeface, setPagesPerRow]);
}
