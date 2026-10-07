import type { AuthIntent } from '../../types/auth';
import { readSharedReturnPath } from './registration';

/** Keep shared reading context through sign-in without replaying a write. */
export function interactionIntent(label: string, path?: string): AuthIntent {
  const currentPath = path ?? (typeof window !== 'undefined' && window.location
    ? `${window.location.pathname}${window.location.search}` : undefined);
  const sharedPath = readSharedReturnPath(currentPath);
  return sharedPath ? { kind: 'route', path: sharedPath, label } : { kind: 'interaction', label };
}
