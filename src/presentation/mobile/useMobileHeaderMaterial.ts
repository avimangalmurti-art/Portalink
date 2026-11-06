import { useLayoutEffect, type RefObject } from 'react';
import { applyHeaderScrollUnderlaps, headerScrollUnderlaps } from '../headerScrollUnderlap';

const STATIONARY = '.profile-header-region, .mobile-home-search-header, .portalink-world-header, [data-inbox-controls], [data-mobile-safe-header], .global-control-header, .studio-mobile-shell-header, .studio-citation-pills, .settings-page-header, .profile-editor-header, .account-search-header, [data-icon-create-header], .new-portal-pinned-controls, [data-link-icon-pinned], .profile-link-icon-picker-pinned, .journey-month-calendar-toolbar';
const HEADERS = `header, ${STATIONARY}, .journey-calendar-header, .account-welcome-heading`;
const SCROLLERS = '[data-screen-scroll], [class*="scroll"], [class*="overflow-y"], [data-mobile-scroll-end], [data-mobile-screen-underlay], [data-profile-pulling]';
const SCREEN = '[role="dialog"], [data-profile-page], [data-messages-page], .studio-citation-shell, [data-mobile-home-search], .app-screen-layer, [data-screen-scroll]';
const CONTENT = 'li, img, canvas, video, p, h1, h2, h3, input, textarea, button, a, [data-studio-row]';

/** The material reacts to vertical content overlap, never horizontal tab scrolling. */
export function headerHasUnderlap(header: HTMLElement, scroller: HTMLElement, scope: HTMLElement, viewportBounds?: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>, contentByScroller?: Map<HTMLElement, HTMLElement>) {
  if (scroller.scrollTop <= 1 || (!scroller.contains(header) && !scope.contains(scroller))) return false;
  const h = header.getBoundingClientRect();
  const bounds = viewportBounds ?? scroller.getBoundingClientRect();
  let top = bounds.top, bottom = bounds.bottom, left = bounds.left, right = bounds.right;
  // A nested scroller's full box can extend behind a header while its visible
  // content is clipped below it. Only the visible intersection counts.
  for (let parent = scroller.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
    if (/hidden|clip|auto|scroll/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    if (/hidden|clip|auto|scroll/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
  }
  const s = { top, bottom, left, right, width: right - left, height: bottom - top };
  if (!h.height || s.height <= 0 || s.width <= 0 || h.right <= s.left || h.left >= s.right || h.bottom <= s.top || h.top >= s.bottom) return false;
  const contentRoot = scroller.contains(scope) ? scope : scroller;
  const cached = contentByScroller?.get(scroller);
  const cachedRect = cached && contentRoot.contains(cached) ? cached.getBoundingClientRect() : undefined;
  const firstContent = cachedRect?.width && cachedRect.height ? cached : Array.from(contentRoot.querySelectorAll<HTMLElement>(CONTENT)).find(node => {
    // Journey's calendar stays pinned below the profile header. Its month input
    // is header foreground; the agenda determines when work reaches the glass.
    if (header.contains(node) || node.closest('.sr-only, [hidden], [role="menu"], [role="status"], .journey-calendar-header')) return false;
    if (node.closest('[role="dialog"]') !== header.closest('[role="dialog"]')) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (firstContent) contentByScroller?.set(scroller, firstContent);
  // Ignore the blank gap before the first row. Once the content has reached the
  // header, keep the material steady through the gaps between subsequent rows.
  if (!firstContent || firstContent.getBoundingClientRect().top >= h.bottom) return false;
  if (scroller.contains(header)) {
    const style = getComputedStyle(header);
    return (style.position === 'sticky' || style.position === 'fixed') && h.top <= s.top + (parseFloat(style.top) || 0) + 1;
  }
  return s.top < h.bottom && s.bottom > h.top;
}

/** Shared by both presentations; retain the existing dataset for screen restoration. */
export function useMobileHeaderMaterial(enabled: boolean, path: string, ref: RefObject<HTMLElement | null>, includeAncestorScrollers = false) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    let frame = 0;
    let layoutDirty = true;
    let layoutCleanups: Array<() => void> = [];
    const resized = new Set<HTMLElement>();
    const marked = new Set<HTMLElement>();
    const desktopContent = new Map<HTMLElement, Map<HTMLElement, HTMLElement>>();
    const resizeObserver = new ResizeObserver(() => { layoutDirty = true; schedule(); });
    const readLayout = () => {
      const scrollers = Array.from(root.querySelectorAll<HTMLElement>(SCROLLERS)).filter(node => {
        const style = getComputedStyle(node);
        // display:contents has no scrollport: padding there would disappear and
        // shift the actual form content underneath its toolbar on desktop.
        return !node.closest('[role="menu"]') && style.display !== 'contents' && node.getBoundingClientRect().height > 0 &&
          (/auto|scroll/.test(style.overflowY) || node.matches('[data-mobile-screen-underlay], [data-profile-pulling]'));
      });
      // A profile-only observer can sit inside WEB's existing page scroller.
      if (includeAncestorScrollers) {
        for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (/auto|scroll/.test(getComputedStyle(ancestor).overflowY) && !scrollers.includes(ancestor)) scrollers.push(ancestor);
        }
      }
      const documentScroller = document.scrollingElement as HTMLElement | null;
      if (documentScroller && documentScroller.scrollHeight > documentScroller.clientHeight && !scrollers.includes(documentScroller)) scrollers.push(documentScroller);
      const visibleHeaders = Array.from(root.querySelectorAll<HTMLElement>(HEADERS)).filter(node => {
        const retained = node.closest('[data-mobile-screen-retained]');
        if (retained && getComputedStyle(retained).display === 'none') return false;
        return !node.closest('[role="menu"]') && Boolean(node.getBoundingClientRect().height);
      });
      const candidates = visibleHeaders.filter(node => {
        // The installed underlap makes a formerly static toolbar positioned and
        // moves its sibling behind it; retain that owner between layout scans.
        if (!layoutDirty && node.dataset.headerMaterialStatic !== undefined) return true;
        const position = getComputedStyle(node).position;
        if (position === 'sticky' || position === 'fixed') return true;
        const parent = node.parentElement;
        const parentStyle = parent ? getComputedStyle(parent) : null;
        const dialogToolbar = parentStyle?.display?.includes('flex') && parentStyle.flexDirection === 'column' &&
          (parent?.matches?.('[role="dialog"]') || parentStyle.position === 'fixed');
        // A flex-column toolbar is stationary even though its CSS position is static.
        return dialogToolbar || (position !== 'static' && node.matches(STATIONARY)) || scrollers.some(scroller => headerScrollUnderlaps(visibleHeaders, scroller, root).some(connection => connection.headers.includes(node)));
      });
      // A region paints once; nested toolbar headers remain foreground only.
      const headers = candidates.filter(node => !candidates.some(parent => parent !== node && parent.contains(node)));
      const fades = root.querySelectorAll<HTMLElement>('.scroll-edge-fade, .feed-edge-fade');
      return { scrollers, documentScroller, headers, fades };
    };
    let desktopLayout: ReturnType<typeof readLayout> | undefined;
    const refresh = () => {
      frame = 0;
      const desktop = root.dataset?.presentation === 'web';
      const offsets = layoutDirty ? new Map(Array.from(root.querySelectorAll<HTMLElement>(SCROLLERS)).map(node => [node, node.scrollTop])) : null;
      if (layoutDirty) {
        layoutCleanups.forEach(cleanup => cleanup()); layoutCleanups = [];
        desktopContent.clear();
        desktopLayout = undefined;
      }
      // Geometry still follows scroll every frame. Discovering the screen's
      // headers, panes and content nodes is only needed when its layout changes.
      const layout = desktop ? desktopLayout ??= readLayout() : readLayout();
      const { scrollers, documentScroller, headers, fades } = layout;
      if (layoutDirty) {
        layoutCleanups.push(applyHeaderScrollUnderlaps(scrollers.flatMap(scroller => headerScrollUnderlaps(headers, scroller, root))));
        offsets?.forEach((top, node) => { if (node.scrollTop !== top) node.scrollTop = top; });
        layoutDirty = false;
      }
      for (const node of marked) {
        if (!headers.includes(node)) {
          delete node.dataset.mobileHeaderUnderlap;
          delete node.dataset.headerMaterialStatic;
          if (resized.has(node)) { resizeObserver.unobserve(node); resized.delete(node); }
        }
      }
      const scrollersWithUnderlap = desktop ? new Set<HTMLElement>() : undefined;
      for (const node of scrollers) {
        const atTop = String(node.scrollTop <= 1);
        const hasHeader = String(headers.some(header => node.contains(header)));
        if (!desktop || node.dataset.mobileScrollTop !== atTop) node.dataset.mobileScrollTop = atTop;
        if (!desktop) node.dataset.mobileScrollUnderlap = 'false';
        if (!desktop || node.dataset.mobileScrollHasHeader !== hasHeader) node.dataset.mobileScrollHasHeader = hasHeader;
        marked.add(node);
      }
      for (const node of fades) {
        const hasHeader = String(headers.some(header => node.contains(header)));
        if (!desktop || node.dataset.mobileScrollHasHeader !== hasHeader) node.dataset.mobileScrollHasHeader = hasHeader;
        marked.add(node);
      }
      for (const header of headers) {
        if (getComputedStyle(header).position === 'static') header.dataset.headerMaterialStatic = '';
        if (!resized.has(header)) { resizeObserver.observe(header); resized.add(header); }
        const scope = header.closest<HTMLElement>(SCREEN) ?? header.parentElement ?? root;
        let contentByScroller = desktopContent.get(header);
        if (desktop && !contentByScroller) {
          contentByScroller = new Map();
          desktopContent.set(header, contentByScroller);
        }
        let underlap = false;
        for (const scroller of scrollers) {
          if (header.closest('[role="dialog"]') !== scroller.closest('[role="dialog"]')) continue;
          if (headerHasUnderlap(header, scroller, scope, scroller === documentScroller ? {top:0,left:0,right:window.innerWidth,bottom:window.innerHeight,width:window.innerWidth,height:window.innerHeight} : undefined, desktop ? contentByScroller : undefined)) {
            if (scrollersWithUnderlap) scrollersWithUnderlap.add(scroller);
            else scroller.dataset.mobileScrollUnderlap = 'true';
            underlap = true;
          }
        }
        if (!desktop || header.dataset.mobileHeaderUnderlap !== String(underlap)) header.dataset.mobileHeaderUnderlap = String(underlap);
        marked.add(header);
      }
      if (scrollersWithUnderlap) for (const node of scrollers) {
        const underlap = String(scrollersWithUnderlap.has(node));
        if (node.dataset.mobileScrollUnderlap !== underlap) node.dataset.mobileScrollUnderlap = underlap;
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
    const reconcile = () => { layoutDirty = true; schedule(); };
    refresh();
    root.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', reconcile);
    window.addEventListener('scroll', schedule, true);
    const observer = new MutationObserver(reconcile);
    observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-presentation']});
    return () => {
      root.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', reconcile);
      window.removeEventListener('scroll', schedule, true);
      observer.disconnect();
      resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      layoutCleanups.forEach(cleanup => cleanup());
      for (const node of marked) {
        delete node.dataset.mobileHeaderUnderlap;
        delete node.dataset.headerMaterialStatic;
        delete node.dataset.mobileScrollTop;
        delete node.dataset.mobileScrollUnderlap;
        delete node.dataset.mobileScrollHasHeader;
      }
    };
  }, [enabled, path, ref, includeAncestorScrollers]);
}
