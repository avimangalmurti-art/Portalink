import type React from 'react';
import type { Project } from '../types/domain';

const TRANSITION_NAME = 'portalink-project';

let currentProjectId: string | null = null;
let transitionActive = false;

type ContinuityDirection = 'open' | 'return';
type MobileOrigin = { projectId: string; artwork: string; card: HTMLElement; radius: string };
let mobileOrigin: MobileOrigin | null = null;
let mobileFocusOrigin: { projectId: string; ownerId?: string; path: string; card: HTMLElement; entered: boolean } | null = null;
let mobileAttempt = false;
let mobileDirection: ContinuityDirection = 'open';

function mobilePresentation(): boolean {
  return typeof document !== 'undefined' && document.querySelector(".codex-shell[data-presentation='mobile']") !== null;
}

/** Semantic identity survives cover thumbnails, signed URLs and PDF rasterization. */
export function getProjectContinuityArtwork(project: Project, sharedCoverFallback = false): string | undefined {
  if (project.coverKind === 'video') return undefined;
  const attachments = project.attachments ?? [];
  const attachmentId = project.coverThumbnail?.sourceAttachmentId;
  const attachment = attachmentId ? attachments.find(item => item.id === attachmentId)
    : attachments.find(item => item.sourceUrl === project.cover)
      ?? (!project.cover && sharedCoverFallback ? [...attachments].sort((a, b) => a.order - b.order).find(item => item.sourceUrl && (item.kind === 'image' || item.kind === 'document' || item.kind === 'video')) : undefined);
  if (attachment && attachment.kind !== 'image' && attachment.kind !== 'document') return undefined;
  const id = attachmentId ?? attachment?.id;
  if (!id) return undefined;
  const documentCover = project.coverKind === 'document' || attachment?.kind === 'document';
  const fallback = !attachmentId && !project.cover && sharedCoverFallback;
  return JSON.stringify([id, documentCover ? fallback ? 1 : project.coverPageNumber ?? attachment?.metadata?.coverPageNumber ?? 1 : 0]);
}

/** Check the viewport and scrolling clips once at activation/snapshot, never on scroll. */
function visible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  const viewport = window.visualViewport;
  let left = Math.max(rect.left, viewport?.offsetLeft ?? 0), top = Math.max(rect.top, viewport?.offsetTop ?? 0);
  let right = Math.min(rect.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth));
  let bottom = Math.min(rect.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight));
  if (rect.width <= 0 || rect.height <= 0) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
    if (node !== element && /auto|scroll|hidden|clip/.test(style.overflowX + style.overflowY)) {
      const clip = node.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
    if (right <= left || bottom <= top) return false;
  }
  return right > left && bottom > top;
}

function painted(element: HTMLElement): boolean {
  if (!visible(element) || element.closest('[aria-busy="true"]')) return false;
  if (element instanceof HTMLImageElement) return element.complete && element.naturalWidth > 0;
  return element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0;
}

function cardArtwork(card: HTMLElement): boolean {
  return Boolean(card.dataset.projectContinuityArtwork && visible(card) && [...card.querySelectorAll<HTMLElement>('img, canvas')].some(painted));
}

function matchingMedia(projectId: string, artwork: string): HTMLElement | undefined {
  let attachment: string, page: number;
  try { [attachment, page] = JSON.parse(artwork) as [string, number]; } catch { return undefined; }
  for (const surface of projectSurfaces()) {
    if (surface.dataset.projectContinuityId !== projectId || surface.hasAttribute('data-preview-open') || !visible(surface)) continue;
    for (const cell of surface.querySelectorAll<HTMLElement>('[data-reach-attachment][data-project-page-ready="true"]')) {
      if (cell.dataset.reachAttachment !== attachment || (page > 0 && Number(cell.dataset.projectContinuityPage ?? cell.dataset.projectPageNumber) !== page)) continue;
      const media = [...cell.querySelectorAll<HTMLElement>('[data-media-page-surface]')].find(painted);
      if (media) return media;
    }
  }
}

function clearNames() {
  for (const element of document.querySelectorAll<HTMLElement>('[data-project-continuity-surface], [data-motion-project-hero]')) {
    element.style.viewTransitionName = '';
    delete element.dataset.motionProjectHero;
  }
}

function beginMobile(projectId: string, direction: ContinuityDirection, explicitSource?: HTMLElement): boolean {
  // Card activation and its route helper can describe the same synchronous open.
  if (mobileAttempt && currentProjectId === projectId && mobileDirection === direction && !explicitSource) return transitionActive;
  clearNames();
  transitionActive = false; mobileAttempt = true; mobileDirection = direction; currentProjectId = projectId;
  delete document.documentElement.dataset.projectContinuity;
  delete document.documentElement.dataset.projectContinuityMobile;
  document.documentElement.style.removeProperty('--motion-project-radius');
  if (direction === 'open' && explicitSource?.dataset.projectContinuityId === projectId && visible(explicitSource)) {
    mobileFocusOrigin = { projectId, ownerId: explicitSource.dataset.projectContinuityOwner, path: window.location.pathname + window.location.search + window.location.hash, card: explicitSource, entered: false };
  } else if (direction === 'open') {
    mobileFocusOrigin = null;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.querySelector('.reduce-motion, .app-viewport--reduce-motion') || typeof document.startViewTransition !== 'function') return false;
  let source: HTMLElement | undefined;
  if (direction === 'open') {
    const candidates = [...projectSurfaces()].filter(surface => surface.dataset.projectContinuityId === projectId && surface.hasAttribute('data-preview-open') && cardArtwork(surface));
    const focused = document.activeElement;
    const card = explicitSource ? candidates.find(surface => surface === explicitSource)
      : candidates.find(surface => focused && surface.contains(focused)) ?? (candidates.length === 1 ? candidates[0] : undefined);
    const artwork = card?.dataset.projectContinuityArtwork;
    if (!card || !artwork) { mobileOrigin = null; return false; }
    mobileOrigin = { projectId, artwork, card, radius: getComputedStyle(card).borderRadius };
    source = card;
  } else if (mobileOrigin?.projectId === projectId) {
    source = matchingMedia(projectId, mobileOrigin.artwork);
  }
  if (!source || !mobileOrigin) return false;
  source.style.viewTransitionName = TRANSITION_NAME;
  source.dataset.motionProjectHero = '';
  document.documentElement.style.setProperty('--motion-project-radius', mobileOrigin.radius);
  document.documentElement.dataset.projectContinuity = direction;
  document.documentElement.dataset.projectContinuityMobile = '';
  transitionActive = true;
  return true;
}

/** A mobile project without a safe pair navigates immediately, without a fake morph. */
export function isMobileProjectContinuity(): boolean { return mobileAttempt; }

/** A committed main reader confirms the origin, including immediate/reduced motion navigation. */
export function noteMobileProfileProject(ownerId: string): void {
  if (mobilePresentation() && mobileFocusOrigin?.ownerId === ownerId) mobileFocusOrigin.entered = true;
}

/** Called by the same catalogue's existing return restoration, never visual cleanup. */
export function focusMobileProjectOrigin(root: HTMLElement, ownerId: string): void {
  const origin = mobileFocusOrigin;
  if (!mobilePresentation() || !origin?.entered || origin.ownerId !== ownerId || origin.path !== window.location.pathname + window.location.search + window.location.hash) return;
  mobileFocusOrigin = null;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && visible(active)) return;
  const cards = [...root.querySelectorAll<HTMLElement>('[data-preview-open]')].filter(card => card.dataset.projectContinuityId === origin.projectId && visible(card));
  const target = cards.find(card => card === origin?.card) ?? (cards.length === 1 ? cards[0] : undefined)
    ?? root.querySelector<HTMLElement>('h1') ?? root.closest<HTMLElement>('main');
  if (!target) return;
  if (!target.hasAttribute('tabindex') && target.tagName === 'H1') target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function projectSurfaces(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>('[data-project-continuity-surface]');
}

/**
 * Marks the one piece of work that should visually travel across a route change.
 * The destination reads the same module state during its first render, while the
 * source is updated directly before navigation so the browser can snapshot it.
 */
export function beginProjectContinuity(projectId: string, direction: ContinuityDirection = 'open', explicitSource?: HTMLElement): boolean {
  if (mobilePresentation()) return beginMobile(projectId, direction, explicitSource);
  if (mobileAttempt) finishProjectContinuity();
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
  // Only validated artwork receives a mobile name, after React commits the route.
  if (mobilePresentation()) return undefined;
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
 if(mobileAttempt){
  clearNames();
  const origin=mobileOrigin;
  if(!transitionActive||!currentProjectId||!origin||!mobilePresentation()||window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.querySelector('.reduce-motion, .app-viewport--reduce-motion'))return false;
  const cards=[...projectSurfaces()].filter(surface=>surface.dataset.projectContinuityId===currentProjectId&&surface.hasAttribute('data-preview-open')&&surface.dataset.projectContinuityArtwork===origin.artwork&&cardArtwork(surface));
  const hero=mobileDirection==='open'?matchingMedia(currentProjectId,origin.artwork)
    : cards.find(card=>card===origin.card)??(cards.length===1?cards[0]:undefined);
  if(!hero)return false;
  hero.dataset.motionProjectHero='';hero.style.viewTransitionName=TRANSITION_NAME;
  return true;
 }
 if(!currentProjectId||typeof document==='undefined')return;
 const surfaces=[...projectSurfaces()];for(const surface of surfaces)surface.style.viewTransitionName='';
 const destination=surfaces.find(surface=>surface.dataset.projectContinuityId===currentProjectId&&surface.getBoundingClientRect().width>0);
 const hero=destination?.querySelector<HTMLElement>('[data-page-cell],canvas,img')??destination;
 if(hero){hero.dataset.motionProjectHero='';hero.style.viewTransitionName=TRANSITION_NAME;}
}
export function finishProjectContinuity(){
 const wasMobile=mobileAttempt;mobileAttempt=false;
 transitionActive=false;currentProjectId=null;
 if(typeof document==='undefined')return;
 delete document.documentElement.dataset.projectContinuity;
 if(wasMobile){clearNames();delete document.documentElement.dataset.projectContinuityMobile;document.documentElement.style.removeProperty('--motion-project-radius');return;}
 for(const surface of document.querySelectorAll<HTMLElement>('[data-project-continuity-surface],[data-motion-project-hero]'))surface.style.viewTransitionName='';
}
