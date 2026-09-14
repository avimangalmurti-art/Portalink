import type React from 'react';

const TRANSITION_NAME = 'portalink-project';
const TRANSITION_SETTLE_MS = 900;

let currentProjectId: string | null = null;
let transitionActive = false;
let settleTimer = 0;

type ContinuityDirection = 'open' | 'return';

function projectSurfaces(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>('[data-project-continuity-surface]');
}

/**
 * Marks the one piece of work that should visually travel across a route change.
 * The destination reads the same module state during its first render, while the
 * source is updated directly before navigation so the browser can snapshot it.
 */
export function beginProjectContinuity(projectId: string, direction: ContinuityDirection = 'open'): boolean {
  currentProjectId = projectId;

  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }

  for (const surface of projectSurfaces()) {
    surface.style.viewTransitionName = '';
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsViewTransitions = typeof (document as Document & {
    startViewTransition?: unknown;
  }).startViewTransition === 'function';

  if (reduceMotion || !supportsViewTransitions) {
    return false;
  }

  for (const surface of projectSurfaces()) {
    if (surface.dataset.projectContinuityId === projectId) {
      surface.style.viewTransitionName = TRANSITION_NAME;
    }
  }

  transitionActive = true;
  document.documentElement.dataset.projectContinuity = direction;
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    transitionActive = false;
    delete document.documentElement.dataset.projectContinuity;
    for (const surface of projectSurfaces()) {
      surface.style.viewTransitionName = '';
    }
  }, TRANSITION_SETTLE_MS);
  return true;
}

/** The matching destination receives the browser's named shared element. */
export function projectContinuityStyle(projectId: string): React.CSSProperties | undefined {
  return currentProjectId === projectId
    ? { viewTransitionName: TRANSITION_NAME }
    : undefined;
}

/** Suppresses the older whole-screen layer animation during shared-element travel. */
export function isProjectContinuityActive(): boolean {
  return transitionActive;
}
