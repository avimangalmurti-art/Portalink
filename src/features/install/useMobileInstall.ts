import { useEffect, useSyncExternalStore } from 'react';
import { mobileInstallStore } from './installState';

/** No listeners or browser prompts are installed by the WEB presentation. */
export function useMobileInstallCapture(enabled: boolean) {
  useEffect(() => enabled ? mobileInstallStore.capture() : undefined, [enabled]);
}

export function useMobileInstallState() {
  return useSyncExternalStore(mobileInstallStore.subscribe, mobileInstallStore.getSnapshot, mobileInstallStore.getServerSnapshot);
}
