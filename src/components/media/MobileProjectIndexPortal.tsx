import React, { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const overlayHost = () => document.fullscreenElement ?? document.querySelector('.app-shell') ?? document.body;

/** Escape the project's clipped content column without resizing its artwork. */
export function MobileProjectIndexPortal({ anchorRef, children }: { anchorRef: RefObject<HTMLDivElement>; children: React.ReactNode }) {
  const [host, setHost] = useState(overlayHost);
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const updateHost = () => setHost(overlayHost());
    document.addEventListener('fullscreenchange', updateHost);
    return () => document.removeEventListener('fullscreenchange', updateHost);
  }, []);
  useLayoutEffect(() => {
    // Retain the workspace's safe-area and dock clearance after portalling.
    const updateInsets = () => {
      if (!anchorRef.current || !overlayRef.current) return;
      const style = getComputedStyle(anchorRef.current);
      for (const name of ['--mobile-content-safe-top', '--mobile-content-safe-bottom', '--mobile-portal-popup-height']) {
        overlayRef.current.style.setProperty(name, style.getPropertyValue(name));
      }
      overlayRef.current.style.setProperty('--mobile-portal-popup-clearance', style.getPropertyValue('--mobile-content-safe-bottom') || '0px');
      const header = anchorRef.current.closest('[data-profile-page]')?.querySelector<HTMLElement>('[data-profile-header]');
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      overlayRef.current.toggleAttribute('data-mobile-portal-continuation', Boolean(style.getPropertyValue('--mobile-portal-popup-height').trim()));
      if (headerBottom > 0) overlayRef.current.style.setProperty('--mobile-project-panel-top', `${headerBottom + 12}px`);
      else overlayRef.current.style.removeProperty('--mobile-project-panel-top');
    };
    const observer = new ResizeObserver(updateInsets);
    const initialize = () => {
      updateInsets();
      const header = anchorRef.current?.closest('[data-profile-page]')?.querySelector('[data-profile-header]');
      if (header) observer.observe(header);
    };
    initialize();
    // A new viewer's parent ref can attach after this portalled child's layout effect.
    const frame = requestAnimationFrame(initialize);
    window.addEventListener('resize', updateInsets);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', updateInsets); };
  }, [anchorRef, host]);
  return createPortal(<div data-presentation="mobile">
    <div ref={overlayRef} data-saved-change-scope="" data-mobile-project-view="" data-mobile-combined-rail="" className="mobile-project-index-overlay">{children}</div>
  </div>, host);
}
