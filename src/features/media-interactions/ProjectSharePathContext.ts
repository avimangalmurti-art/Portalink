import { createContext } from 'react';

/** The original Portal's project URL for sharing pages from any Portal. */
export const ProjectSharePathContext = createContext<string | undefined>(undefined);
