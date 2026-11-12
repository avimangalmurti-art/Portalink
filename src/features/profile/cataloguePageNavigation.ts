import { getCataloguePagePosition, type CataloguePagePosition } from './cataloguePagePosition';

/** Add a catalogue reading hint without replacing an explicitly addressed page. */
export function withCataloguePageTarget(href: string, projectId: string, selectedPosition?: CataloguePagePosition, pageReading: 'focused' | 'scroll' = 'focused'): string {
  const position = selectedPosition ?? getCataloguePagePosition(projectId);
  if (!href || href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href)
    || !position || !Number.isInteger(position.index) || position.index <= 0 || !position.attachmentId) return href;
  const hashAt = href.indexOf('#');
  const hash = hashAt < 0 ? '' : href.slice(hashAt);
  const address = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = address.indexOf('?');
  const path = queryAt < 0 ? address : address.slice(0, queryAt);
  const query = new URLSearchParams(queryAt < 0 ? '' : address.slice(queryAt + 1));
  if (query.has('media') || query.has('page')) return href;
  query.set('media', position.attachmentId);
  if (Number.isInteger(position.page) && Number(position.page) > 0) {
    query.set('page', String(position.page));
    // Inline image and PDF taps enter the ordinary mobile scroll reader.
    const scrollPage = pageReading === 'scroll' && (position.key === `${position.attachmentId}:image`
      || position.key === `${position.attachmentId}:page:${position.page}`);
    if (!query.has('view') && !scrollPage) query.set('view', 'page');
  }
  return `${path}?${query}${hash}`;
}

export type CatalogueReaderOrigin = {
  profileId: string;
  path: string;
  projectId: string;
  top: number;
  left: number;
  anchorTop: number | null;
};

function projectOpener(root: HTMLElement, projectId: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[data-preview-open]')]
    .find(element => element.dataset.projectContinuityId === projectId && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
}

/** Public WEB owns a contained main scroll surface, unlike the MOBILE document. */
export function captureCatalogueReaderOrigin(profileId: string, path: string, projectId: string, root: HTMLElement | null): CatalogueReaderOrigin | null {
  const main = root?.closest<HTMLElement>('main');
  if (!root || !main) return null;
  const candidate = projectOpener(root, projectId);
  const bounds = candidate?.getBoundingClientRect();
  const mainBounds = main.getBoundingClientRect();
  const opener = bounds && bounds.width > 0 && bounds.height > 0 && bounds.bottom > mainBounds.top && bounds.top < mainBounds.bottom ? candidate : undefined;
  return { profileId, path, projectId, top: main.scrollTop, left: main.scrollLeft,
    anchorTop: opener ? opener.getBoundingClientRect().top - main.getBoundingClientRect().top : null };
}

/** Wait for the existing catalogue composition to remount, then restore its card. */
export function restoreCatalogueReaderOrigin(origin: CatalogueReaderOrigin, resolveRoot: () => HTMLElement | null): () => void {
  let frame = 0, attempts = 0, stable = 0, stopped = false;
  const inputs = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    inputs.forEach(type => window.removeEventListener(type, stop, true));
  };
  const restore = () => {
    if (stopped) return;
    const root = resolveRoot();
    const main = root?.closest<HTMLElement>('main');
    if (root?.isConnected && main?.isConnected) {
      const opener = origin.anchorTop === null ? undefined : projectOpener(root, origin.projectId);
      const target = opener && origin.anchorTop !== null
        ? Math.max(0, main.scrollTop + opener.getBoundingClientRect().top - main.getBoundingClientRect().top - origin.anchorTop)
        : origin.top;
      main.scrollTo({ top: target, left: origin.left, behavior: 'instant' });
      stable = Math.abs(main.scrollTop - target) < 1 ? stable + 1 : 0;
      if (stable >= 3) {
        (opener ?? main).focus({ preventScroll: true });
        stop();
        return;
      }
    }
    if (++attempts >= 36) { stop(); return; }
    frame = requestAnimationFrame(restore);
  };
  inputs.forEach(type => window.addEventListener(type, stop, { capture: true, passive: true }));
  frame = requestAnimationFrame(restore);
  return stop;
}
