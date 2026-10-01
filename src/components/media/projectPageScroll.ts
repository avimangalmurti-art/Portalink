/** Move the overview reading surface without focusing or expanding a page. */
export function jumpToProjectPage(surface: HTMLElement | null, number: number) {
  const page = surface?.querySelector<HTMLElement>(`[data-project-page-number="${number}"]`);
  if (!surface || !page) return false;
  let scroller = page.parentElement;
  while (scroller && surface.contains(scroller)) {
    if (/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight) {
      scroller.scrollTo({ top: scroller.scrollTop + page.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
        behavior: 'instant' });
      return true;
    }
    scroller = scroller.parentElement;
  }
  if (surface.closest('[data-mobile-page-reader]') && !surface.querySelector('[data-mobile-focused-view]')) {
    window.scrollTo({ top: projectPageScrollTop(surface, page), behavior: 'instant' });
    return true;
  }
  return false;
}

export function projectPageScrollTop(surface: HTMLElement, page: HTMLElement) {
  const safeTop = parseFloat(getComputedStyle(surface).getPropertyValue('--mobile-content-safe-top')) || 0;
  const readerHeader = surface.closest('[data-document-reading-view]')?.querySelector('[data-document-reader-header]');
  const topInset = Math.max(safeTop, readerHeader?.getBoundingClientRect().bottom ?? 0);
  return window.scrollY + page.getBoundingClientRect().top - topInset;
}

