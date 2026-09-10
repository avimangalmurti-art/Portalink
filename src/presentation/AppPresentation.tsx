import React from 'react';
import { PresentationContext } from './usePresentation';
import { useViewportPresentation } from './useViewportPresentation';
import './web/web.css';
import './mobile/mobile.css';

/** Keep one host and stable children as the presentation changes. */
export function AppPresentation({ children, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const presentation = useViewportPresentation();
  return <PresentationContext.Provider value={presentation}>
    <div {...props} data-presentation={presentation}>{children}</div>
  </PresentationContext.Provider>;
}
