export const projectPageSelector = '[data-project-page-number][data-project-page-total]';
const readingPartSelector = ':scope > [data-project-reading-part]';

export type ProjectReadingPart = { attachmentId: string; firstPage: number; count: number };

/** Sections keep their renderer's local numbering; the stage owns the ordered index. */
export function projectReadingParts(surface: HTMLElement) {
  let firstPage = 1;
  return Array.from(surface.querySelectorAll<HTMLElement>(readingPartSelector)).flatMap(element => {
    const attachmentId = element.dataset.projectReadingPart;
    if (!attachmentId) return [];
    const rendered = element.querySelector<HTMLElement>(projectPageSelector);
    const count = positivePageNumber(rendered?.dataset.projectPageTotal) || positivePageNumber(element.dataset.projectReadingCount);
    const part = { attachmentId, firstPage, count, element };
    firstPage += count;
    return [part];
  });
}

function positivePageNumber(value?: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

/** Match the attachment as well as the page number, which can repeat across sections. */
export function findProjectReadingPage(surface: HTMLElement, attachmentId: string, page: number) {
  const part = Array.from(surface.querySelectorAll<HTMLElement>(readingPartSelector))
    .find(element => element.dataset.projectReadingPart === attachmentId);
  return part?.querySelector<HTMLElement>(`[data-project-page-number="${page}"]`);
}

/** Move the overview reading surface without focusing or expanding a page. */
export function jumpToProjectPage(surface: HTMLElement | null, number: number) {
  if (!surface) return false;
  const parts = projectReadingParts(surface);
  const part = parts.find(({ firstPage, count }) => number >= firstPage && number < firstPage + count);
  // A later attachment's offset isn't known until the preceding PDF has loaded.
  if (parts.length && (!part || parts.slice(0, parts.indexOf(part)).some(({ count }) => !count))) return false;
  const localPage = part ? number - part.firstPage + 1 : number;
  const page = (part?.element ?? surface).querySelector<HTMLElement>(`[data-project-page-number="${localPage}"]`);
  if (!page) return false;
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
  const readerHeader = surface.closest('[data-mobile-page-reader]')?.querySelector('[data-document-reader-header]');
  const topInset = Math.max(safeTop, readerHeader?.getBoundingClientRect().bottom ?? 0);
  return window.scrollY + page.getBoundingClientRect().top - topInset;
}

