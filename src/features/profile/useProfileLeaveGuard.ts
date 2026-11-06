import { useCallback, useLayoutEffect, useRef } from 'react';
import { ProfileLeaveGuardController, type ProfileLeaveGuardOptions } from './profileLeaveGuard';

/** Keep one unsaved profile owner across its connected child screens. */
export function useProfileLeaveGuard(options: ProfileLeaveGuardOptions) {
  const controller = useRef<ProfileLeaveGuardController | null>(null);
  useLayoutEffect(() => {
    const current = controller.current ??= new ProfileLeaveGuardController(window);
    current.attach();
    return () => current.detach();
  }, []);
  useLayoutEffect(() => { controller.current?.update(options); }, [options]);
  const requestLeave = useCallback((action: () => void) => controller.current?.requestLeave(action), []);
  const confirmLeave = useCallback(() => controller.current?.confirmLeave(), []);
  const cancelLeave = useCallback(() => controller.current?.cancelLeave(), []);
  return { requestLeave, confirmLeave, cancelLeave };
}
