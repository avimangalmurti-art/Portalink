import { useCallback, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id, ProjectView } from '../../types/domain';

/**
 * Resolving a project by its stable id.
 *
 * UI/App orchestration → this hook → `ProjectService`. The shell used to call
 * `getProjectView` itself, which meant the classification of "does not exist"
 * versus "could not be fetched", the retry, and the staleness rules all lived in
 * the same place as navigation and history.
 *
 * The hook only ever hands back a project the service CONFIRMED. Every request
 * carries the id it was made for, so an answer for an earlier project cannot open
 * after a newer request has been made — tapping two tiles quickly opens the second,
 * never the first arriving late.
 */
export type ProjectResolutionState = {
  projectId: Id;
  state: 'loading' | 'not-found' | 'error';
};
export type ProjectResolution = {
  /** The current attempt, or null when nothing is being resolved. */
  resolution: ProjectResolutionState | null;
  /**
   * Resolves a project by id and calls `onResolved` with the confirmed view.
   * Nothing is opened unless the service answered successfully.
   */
  resolveProject: (projectId: Id, onResolved: (view: ProjectView) => void) => void;
  /** Re-runs the attempt that failed. Null when there is nothing retryable. */
  retry: (() => void) | null;
  /** Invalidates any in-flight attempt because a newer navigation won. */
  cancel: () => void;
  dismiss: () => void;
};

/**
 * A project that genuinely does not exist is a different answer from one that
 * could not be fetched: only the second is worth retrying. Implementations report
 * absence in their own words, so the phrasings they use are matched here rather
 * than assumed to be a status code.
 */
function isMissing(error: unknown): boolean {
  return error instanceof Error && /not found|no (such )?project|unknown project|invalid input syntax for type uuid/i.test(error.message);
}
export function useProjectResolution(): ProjectResolution {
  const {
    projects: projectService
  } = useServices();
  const [resolution, setResolution] = useState<ProjectResolutionState | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  // The id of the most recent request. A response whose id no longer matches is
  // discarded, so a slow answer can never overtake a newer one.
  const latestRequestRef = useRef(0);
  const resolveProject = useCallback((projectId: Id, onResolved: (view: ProjectView) => void) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setResolution({
      projectId,
      state: 'loading'
    });
    setRetry(null);
    projectService.getProjectView(projectId).then((view) => {
      if (latestRequestRef.current !== requestId) {
        return;
      }
      setResolution(null);
      setRetry(null);
      onResolved(view);
    }).catch((error) => {
      if (latestRequestRef.current !== requestId) {
        return;
      }
      const missing = isMissing(error);
      setResolution({
        projectId,
        state: missing ? 'not-found' : 'error'
      });
      // Retrying a project that does not exist would only fail again, so a
      // retry is offered for a fetch failure alone.
      setRetry(missing ? null : () => () => resolveProject(projectId, onResolved));
    });
  }, [projectService]);
  const cancel = useCallback(() => {
    latestRequestRef.current += 1;
    setResolution(null);
    setRetry(null);
  }, []);
  const dismiss = cancel;
  return useMemo(() => ({
    resolution,
    resolveProject,
    retry,
    cancel,
    dismiss
  }), [resolution, resolveProject, retry, cancel, dismiss]);
}
