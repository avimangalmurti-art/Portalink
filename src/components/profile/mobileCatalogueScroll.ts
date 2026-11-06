/** Reconcile a document-owned catalogue after its first layout or a size change. */
export function repairMobileCatalogueScroll(profile: HTMLElement | null): boolean {
  const publicCatalogue = profile?.hasAttribute('data-public-image-catalogue');
  if (!profile || (!profile.hasAttribute('data-mobile-catalogue-spacing') && !publicCatalogue) || !profile.closest('[data-presentation="mobile"]')
    || profile.closest('[hidden], [inert], [aria-hidden="true"], .screen-exit')) return false;
  const documentScroller = document.scrollingElement;
  const wall = profile.querySelector<HTMLElement>(':scope > #profile-content > .mobile-profile-wall:not([hidden])');
  const first = publicCatalogue
    ? profile.querySelector<HTMLElement>('[data-profile-wall-columns] [data-preview-open][data-project-continuity-id]')
    : wall?.querySelector<HTMLElement>('[data-preview-open][data-project-continuity-id]');
  const header = profile.querySelector<HTMLElement>(':scope > .profile-header-region');
  if (!documentScroller || !first || !header || Math.abs((window.visualViewport?.scale ?? 1) - 1) > 0.01) return false;
  const bounds = profile.getBoundingClientRect(), card = first.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0 || card.width <= 0 || card.height <= 0) return false;
  const current = documentScroller.scrollTop;
  const viewport = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
  const fits = bounds.height <= viewport + 1;
  // Native elastic overscroll is not a saved layout offset.
  if (current <= 0) return fits;
  const maximum = Math.max(0, documentScroller.scrollHeight - documentScroller.clientHeight);
  let target = Math.min(current, maximum);
  if (fits && card.top < header.getBoundingClientRect().bottom) {
    // A wall that fits has no later reading position to preserve behind the header.
    target = Math.max(0, Math.min(maximum, current + bounds.top));
  }
  if (current - target > 1) window.scrollTo({ top: target, behavior: 'instant' });
  return fits;
}

/** Coalesce real layout changes without replaying the saved reading position. */
export function observeMobileCatalogueScroll(profile: HTMLElement | null): () => void {
  let frame = 0, stopped = false;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (!stopped) repairMobileCatalogueScroll(profile); });
  });
  if (profile) {
    observer.observe(profile);
    // A short public wall can finish measuring without changing its parent's
    // viewport-sized minimum height. Its own rows still need reconciliation.
    if (profile.hasAttribute('data-public-image-catalogue')) {
      const wall = profile.querySelector<HTMLElement>('[data-profile-wall-columns]');
      if (wall) observer.observe(wall);
    }
  }
  return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); };
}
