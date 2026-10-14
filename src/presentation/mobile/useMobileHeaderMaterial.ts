import { useLayoutEffect, type RefObject } from 'react';

const HEADERS = 'header, .profile-header-region, .mobile-home-search-header, [data-inbox-controls], [data-mobile-safe-header], .global-control-header';
const SCROLLERS = '[data-screen-scroll], .scroll-edge-fade, .feed-edge-fade, [class*="overflow-y-auto"], .mobile-profile-wall, .studio-workbench-scroll, .studio-bookmarks-scroll, .account-search-results, [data-mobile-scroll-end]';
const SCREEN = '[data-profile-page], [data-messages-page], .studio-citation-shell, [data-mobile-home-search], .app-screen-layer, [data-screen-scroll]';

/** The material reacts to vertical content overlap, never horizontal tab scrolling. */
export function headerHasUnderlap(header: HTMLElement, scroller: HTMLElement, scope: HTMLElement, viewportBounds?: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>) {
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
  const firstContent = Array.from(contentRoot.querySelectorAll<HTMLElement>('li, img, canvas, video, p, h1, h2, h3, input, textarea, [data-studio-row]')).find(node => {
    if (header.contains(node) || node.closest('.sr-only, [hidden], [role="dialog"], [role="menu"]')) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  // Ignore the blank gap before the first row. Once the content has reached the
  // header, keep the material steady through the gaps between subsequent rows.
  if (!firstContent || firstContent.getBoundingClientRect().top >= h.bottom) return false;
  if (scroller.contains(header)) {
    const style = getComputedStyle(header);
    return (style.position === 'sticky' || style.position === 'fixed') && h.top <= s.top + (parseFloat(style.top) || 0) + 1;
  }
  return s.top < h.bottom && s.bottom > h.top;
}

export function useMobileHeaderMaterial(enabled: boolean, path: string, ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    let frame = 0;
    const marked = new Set<HTMLElement>();
    const refresh = () => {
      frame = 0;
      const scrollers = Array.from(root.querySelectorAll<HTMLElement>(SCROLLERS)).filter(node =>
        !node.closest('[role="dialog"], [role="menu"], .mobile-profile-portal-overlay, [data-project-index-panel], [data-project-response-rail]') && /auto|scroll/.test(getComputedStyle(node).overflowY));
      const documentScroller = document.scrollingElement as HTMLElement | null;
      if (documentScroller && documentScroller.scrollHeight > documentScroller.clientHeight) scrollers.push(documentScroller);
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(HEADERS)).filter(node => {
        if (node.closest('[role="dialog"], [role="menu"], .mobile-profile-portal-overlay, [data-project-index-panel], [data-project-response-rail]')) return false;
        const position = getComputedStyle(node).position;
        if (position === 'static') return false;
        return position === 'sticky' || position === 'fixed' || node.matches('.profile-header-region, .mobile-home-search-header, [data-inbox-controls], [data-mobile-safe-header], .studio-mobile-shell-header, .settings-page-header, .account-search-header, .global-control-header');
      });
      // A region paints once; nested toolbar headers remain foreground only.
      const headers = candidates.filter(node => !candidates.some(parent => parent !== node && parent.contains(node)));
      for (const node of marked) {
        if (!headers.includes(node)) delete node.dataset.mobileHeaderUnderlap;
      }
      for (const node of scrollers) {
        node.dataset.mobileScrollTop = String(node.scrollTop <= 1);
        node.dataset.mobileScrollUnderlap = 'false';
        node.dataset.mobileScrollHasHeader = String(headers.some(header => node.contains(header)));
        marked.add(node);
      }
      for (const node of root.querySelectorAll<HTMLElement>('.scroll-edge-fade, .feed-edge-fade')) {
        node.dataset.mobileScrollHasHeader = String(headers.some(header => node.contains(header)));
        marked.add(node);
      }
      for (const header of headers) {
        const scope = header.closest<HTMLElement>(SCREEN) ?? header.parentElement ?? root;
        let underlap = false;
        for (const scroller of scrollers) {
          if (headerHasUnderlap(header, scroller, scope, scroller === documentScroller ? {top:0,left:0,right:window.innerWidth,bottom:window.innerHeight,width:window.innerWidth,height:window.innerHeight} : undefined)) {
            scroller.dataset.mobileScrollUnderlap = 'true';
            underlap = true;
          }
        }
        header.dataset.mobileHeaderUnderlap = String(underlap);
        marked.add(header);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
    refresh();
    root.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const observer = new MutationObserver(schedule);
    observer.observe(root, {childList: true, subtree: true});
    return () => {
      root.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const node of marked) {
        delete node.dataset.mobileHeaderUnderlap;
        delete node.dataset.mobileScrollTop;
        delete node.dataset.mobileScrollUnderlap;
        delete node.dataset.mobileScrollHasHeader;
      }
    };
  }, [enabled, path, ref]);
}
