import { useLayoutEffect, type RefObject } from 'react';

/** Keep the chooser's frame when its contents change to a portal's projects. */
export function useMobilePortalPopupSize(profileRef: RefObject<HTMLDivElement>, overlayRef: RefObject<HTMLDivElement>, open: boolean) {
  useLayoutEffect(() => {
    const profile = profileRef.current;
    const chooser = overlayRef.current?.querySelector<HTMLElement>('.mobile-portals-page');
    if (!open || !profile || !chooser) return;
    const measure = () => {
      const height = chooser.getBoundingClientRect().height;
      // A hidden/Suspense tree must not overwrite the last visible frame.
      if (height > 0) profile.style.setProperty('--mobile-portal-popup-height', `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(chooser);
    // Deliberately retain the size on this profile while the chooser is absent.
    return () => observer.disconnect();
  }, [profileRef, overlayRef, open]);
}
