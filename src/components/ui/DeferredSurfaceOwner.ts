import { createContext } from 'react';

/** A nested code-loading failure uses its existing surface's dismissal path. */
export const DeferredSurfaceOwnerContext = createContext<{ active: boolean; onClose: () => void }>({ active: true, onClose: () => undefined });
