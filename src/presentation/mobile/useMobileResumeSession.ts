import { useCallback, useEffect, useRef } from 'react';
import { clearMobileResume, MobileResumeSession, saveMobileResumeRoute, type MobileResumeSessionInput, type MobileResumeRecord } from './mobileResumeState';
import { clearMobileMessageDrafts } from './mobileMessageDrafts';

/** Root integration renders resumeTo before mounting the ordinary destination. */
export function useMobileResumeSession(input: MobileResumeSessionInput): { resumeTo: string | null; launchRecord: MobileResumeRecord | null; checkpoint: () => void } {
  const session = useRef<MobileResumeSession | null>(null);
  if (!session.current) session.current = new MobileResumeSession(input);
  const resumeTo = session.current.update(input);
  const latest = useRef(input);
  latest.current = input;
  const previousAccount = useRef<string | null>(null);
  const checkpoint = useCallback(() => {
    const current = latest.current;
    if (!session.current?.canCheckpoint(current) || !current.accountId) return;
    saveMobileResumeRoute(current.accountId, current.pathname + (current.search ?? '') + (current.hash ?? ''));
  }, []);

  useEffect(() => {
    if (!input.authReady) return;
    const previous = previousAccount.current;
    if (previous && previous !== input.accountId) {
      clearMobileResume(previous);
      clearMobileMessageDrafts(previous);
      previousAccount.current = null;
    }
    // A WEB-only visit never touches this storage. A mobile visit that rotates
    // past the breakpoint still retires its own old-account hint on signout.
    if (input.mobile) previousAccount.current = input.accountId;
  }, [input.mobile, input.authReady, input.accountId]);

  useEffect(() => {
    if (!input.mobile || !input.authReady || input.blocked || !input.accountId || resumeTo) return;
    const timer = window.setTimeout(checkpoint, 750);
    const hide = () => { if (document.visibilityState === 'hidden') checkpoint(); };
    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [input.mobile, input.authReady, input.blocked, input.accountId, input.locationKey, input.pathname, input.search, input.hash, resumeTo, checkpoint]);
  return { resumeTo, launchRecord: session.current.launchRecord, checkpoint };
}
