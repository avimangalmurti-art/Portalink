import React from 'react';
import { useLocation } from 'react-router-dom';
import { PresentationContext, usePresentation } from './usePresentation';
import { useViewportPresentation } from './useViewportPresentation';
import { useMobileBrowserSurface } from './mobile/useMobileBrowserSurface';
import { useMobileViewportFrame } from './mobile/useMobileViewportFrame';
import { useAppZoomBoundary } from './useAppZoomBoundary';
import { useProjectScrollActivity } from './mobile/useProjectScrollActivity';
import './web/web.css';
import './mobile/mobile.css';
import './navigation.css';

/** One presentation choice also covers the shell's appearance state. */
export function AppPresentationProvider({ children }: { children: React.ReactNode }) {
  const presentation = useViewportPresentation();
  return <PresentationContext.Provider value={presentation}>{children}</PresentationContext.Provider>;
}

/** Keep one host and stable children as the presentation changes. */
export function AppPresentation({ children, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const presentation = usePresentation();
  const frameRef = useMobileBrowserSurface(presentation, props.style);
  useMobileViewportFrame(presentation, frameRef);
  const { pathname } = useLocation();
  useProjectScrollActivity(presentation === 'mobile', pathname, frameRef);
  useAppZoomBoundary();
  return <div {...props} ref={frameRef} data-presentation={presentation}>{children}</div>;
}
