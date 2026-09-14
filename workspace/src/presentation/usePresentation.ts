import { createContext, useContext } from 'react';

export type Presentation = 'web' | 'mobile';

export const PresentationContext = createContext<Presentation>('web');

/** Presentation only: this never selects accounts, services, routes, or permissions. */
export function usePresentation(): Presentation {
  return useContext(PresentationContext);
}
