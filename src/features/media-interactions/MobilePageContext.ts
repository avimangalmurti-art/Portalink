import { createContext } from 'react';
import type { MediaInteractionTarget } from './useMediaInteractions';

/** Selects the existing page controller belonging to the largest visible page. */
export const MobilePageContext = createContext<(MediaInteractionTarget & { shared?: boolean }) | null>(null);
