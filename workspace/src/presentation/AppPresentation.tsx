import React from 'react';
import { useLocation } from 'react-router-dom';
import { PresentationContext } from './usePresentation';
import { useViewportPresentation } from './useViewportPresentation';
import { useMobileBrowserSurface } from './mobile/useMobileBrowserSurface';
import { useAppZoomBoundary } from './useAppZoomBoundary';
import { useProjectScrollActivity } from './mobile/useProjectScrollActivity';
import './web/web.css';
import './mobile/mobile.css';

/** Keep one host and stable children as the presentation changes. */
export function AppPresentation({ children, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const presentation = useViewportPresentation();
  const frameRef = useMobileBrowserSurface(presentation, props.style);
  const { pathname } = useLocation();
  useProjectScrollActivity(presentation === 'mobile', pathname, frameRef);
  useAppZoomBoundary();
  return <PresentationContext.Provider value={presentation}>
    <div {...props} ref={frameRef} data-presentation={presentation}>{children}</div>
  </PresentationContext.Provider>;
}
