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
      for (const name of ['--mobile-content-safe-top', '--mobile-content-safe-bottom']) {
        overlayRef.current.style.setProperty(name, style.getPropertyValue(name));
      }
    };
    updateInsets();
    window.addEventListener('resize', updateInsets);
    return () => window.removeEventListener('resize', updateInsets);
  }, [anchorRef, host]);
  return createPortal(<div data-presentation="mobile">
    <div ref={overlayRef} data-saved-change-scope="" data-mobile-project-view="" data-mobile-combined-rail="" className="mobile-project-index-overlay">{children}</div>
  </div>, host);
}
