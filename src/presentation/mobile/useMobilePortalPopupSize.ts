import { useLayoutEffect, type RefObject } from 'react';

/** Retain the viewport-centered chooser size for portal drill-down. */
export function useMobilePortalPopupSize(profileRef: RefObject<HTMLDivElement>, overlayRef: RefObject<HTMLDivElement>, open: boolean) {
  useLayoutEffect(() => {
    const profile = profileRef.current;
    const overlay = overlayRef.current;
    if (!open || !profile || !overlay) return;
    let chooser = overlay.querySelector<HTMLElement>('.mobile-portals-page');
    const measure = () => {
      const height = chooser?.getBoundingClientRect().height ?? 0;
      // A hidden/Suspense tree must not overwrite the last visible frame.
      if (height > 0) profile.style.setProperty('--mobile-portal-popup-height', `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (chooser) observer.observe(chooser);
    // The chooser can arrive after its lazy loading surface has opened.
    const mounted = new MutationObserver(() => {
      const next = overlay.querySelector<HTMLElement>('.mobile-portals-page');
      if (next === chooser) return;
      observer.disconnect();
      chooser = next;
      measure();
      if (chooser) observer.observe(chooser);
    });
    mounted.observe(overlay, { childList: true, subtree: true });
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    // Deliberately retain the size on this profile while the chooser is absent.
    return () => {
      observer.disconnect();
      mounted.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
    };
  }, [profileRef, overlayRef, open]);
}
