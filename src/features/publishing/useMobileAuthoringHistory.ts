import { useLayoutEffect, useRef } from 'react';
import { createMobileAuthoringHistory, type MobileAuthoringHistoryController, type MobileAuthoringHistoryOptions } from './mobileAuthoringHistory';

/** One stable owner spans setup and upload; WEB/public callers leave it disabled. */
export function useMobileAuthoringHistory(options: MobileAuthoringHistoryOptions): void {
  const controller = useRef<MobileAuthoringHistoryController | null>(null);
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const current = controller.current ??= createMobileAuthoringHistory(window);
    current.attach();
    return () => current.detach();
  }, []);
  useLayoutEffect(() => { controller.current?.update(options); }, [options]);
}
