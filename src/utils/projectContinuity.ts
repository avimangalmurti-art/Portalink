import type React from 'react';

const TRANSITION_NAME = 'portalink-project';

let currentProjectId: string | null = null;
let transitionActive = false;

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

  const candidates=[...projectSurfaces()].filter(surface=>surface.dataset.projectContinuityId===projectId);
  const focused=document.activeElement;
  const source=candidates.find(surface=>focused&&surface.contains(focused))??candidates[0]??(typeof HTMLElement !== 'undefined' && focused instanceof HTMLElement?focused.querySelector<HTMLElement>('img'):null);
  const image=typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement?source:source?.querySelector('img');
  const width=Number(image?.getAttribute('width'))||image?.naturalWidth,height=Number(image?.getAttribute('height'))||image?.naturalHeight;
  if(width&&height)document.documentElement.style.setProperty('--motion-page-aspect',String(width/height));
  transitionActive = !reduceMotion;
  if (reduceMotion || !supportsViewTransitions) return false;
  if(source)source.style.viewTransitionName=TRANSITION_NAME;

  transitionActive = true;
  document.documentElement.dataset.projectContinuity = direction;
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

/** The native update callback pairs exactly one source with exactly one first page. */
export function markProjectContinuityDestination(){
 if(!currentProjectId||typeof document==='undefined')return;
 const surfaces=[...projectSurfaces()];for(const surface of surfaces)surface.style.viewTransitionName='';
 const destination=surfaces.find(surface=>surface.dataset.projectContinuityId===currentProjectId&&surface.getBoundingClientRect().width>0);
 const hero=destination?.querySelector<HTMLElement>('[data-page-cell],canvas,img')??destination;
 if(hero){hero.dataset.motionProjectHero='';hero.style.viewTransitionName=TRANSITION_NAME;}
}
export function finishProjectContinuity(){
 transitionActive=false;currentProjectId=null;
 if(typeof document==='undefined')return;
 delete document.documentElement.dataset.projectContinuity;
 for(const surface of document.querySelectorAll<HTMLElement>('[data-project-continuity-surface],[data-motion-project-hero]'))surface.style.viewTransitionName='';
}
