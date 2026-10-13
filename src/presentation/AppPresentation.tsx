import { InternalContentShareProvider } from '../features/sharing/InternalContentShare';
import '../components/media/mobile-project-popup.css';
import React from 'react';
import { MotionNavigation } from './motion/MotionNavigation';
import { useLocation } from 'react-router-dom';
import { PresentationContext, usePresentation } from './usePresentation';
import { useViewportPresentation } from './useViewportPresentation';
import { useMobileBrowserSurface } from './mobile/useMobileBrowserSurface';
import { useMobileViewportFrame } from './mobile/useMobileViewportFrame';
import { useAppZoomBoundary } from './useAppZoomBoundary';
import { useProjectScrollActivity } from './mobile/useProjectScrollActivity';
import { MobileContextProvider } from './mobile/MobileContextActions';
import './web/web.css';
import './navigation.css';
import './controls.css';

/** One presentation choice also covers the shell's appearance state. */
export function AppPresentationProvider({ children }: { children: React.ReactNode }) {
  const presentation = useViewportPresentation();
  return <PresentationContext.Provider value={presentation}><MotionNavigation>{children}</MotionNavigation></PresentationContext.Provider>;
}

/** Keep one host and stable children as the presentation changes. */
export function AppPresentation({ children, actionSheet, showFloatingActions = true, ...props }: React.ComponentPropsWithoutRef<'div'> & { showFloatingActions?: boolean; actionSheet?: React.ComponentProps<typeof MobileContextProvider>['sheet'] }) {
  const presentation = usePresentation();
  const frameRef = useMobileBrowserSurface(presentation, props.style);
  useMobileViewportFrame(presentation, frameRef);
  const { pathname } = useLocation();
  useProjectScrollActivity(presentation === 'mobile', pathname, frameRef);
  useAppZoomBoundary();
  return <div {...props} ref={frameRef} data-presentation={presentation}><InternalContentShareProvider><MobileContextProvider sheet={actionSheet} showFloatingButton={showFloatingActions}>{children}</MobileContextProvider></InternalContentShareProvider></div>;
}
