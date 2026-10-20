import { createContext } from 'react';
import type { Navigator } from 'react-router-dom';

/** State-only authoring entries use the router without a screen transition. */
export const ImmediateNavigationContext = createContext<Navigator | null>(null);
