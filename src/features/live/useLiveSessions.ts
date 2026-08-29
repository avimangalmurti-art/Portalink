import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id, LiveCapability, LiveSession } from '../../types/domain';

/**
 * The live-session boundary.
 *
 * Joining used to be a string in the app shell: a presentation component called
 * `setLiveShow('DJ Nsuku — Lagos Late Night')` and the sidebar lit up. Nothing was
 * requested, so the viewer was shown as joined to a session that had no id, could
 * not fail to be joined, and that `LiveService` knew nothing about.
 *
 * Sessions are now listed through the service, and membership is only ever claimed
 * on the service's own answer.
 */
export type LiveListPhase = 'loading' | 'sessions' | 'empty' | 'error';
export type LiveJoinPhase = 'idle' | 'joining' | 'joined' | 'leaving' | 'error';
export type LiveSessionsState = {
  listPhase: LiveListPhase;
  sessions: LiveSession[];
  listError: string | null;
  reload: () => void;
  /** What joining actually does here. Null while unknown. */
  capability: LiveCapability | null;
  joinPhase: LiveJoinPhase;
  /** The last session the service confirmed as joined. */
  joinedSession: LiveSession | null;
  /** The session a join or leave is currently in flight for. */
  pendingSessionId: Id | null;
  joinError: string | null;
  retry: (() => void) | null;
  join: (sessionId: Id) => void;
  leave: () => void;
};
function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
export function useLiveSessions(locationId?: Id): LiveSessionsState {
  const { live } = useServices();
  const [listPhase, setListPhase] = useState<LiveListPhase>('loading');
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [capability, setCapability] = useState<LiveCapability | null>(null);
  const [joinPhase, setJoinPhase] = useState<LiveJoinPhase>('idle');
  const [joinedSession, setJoinedSession] = useState<LiveSession | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<Id | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  // Blocks a second join or leave while one is in flight, independently of any
  // disabled control, so a fast double press cannot send two requests.
  const isMutatingRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setListPhase('loading');
    setListError(null);
    Promise.all([live.listSessions(locationId), live.getLiveCapability()]).then(([nextSessions, nextCapability]) => {
      if (!isCurrent) {
        return;
      }
      setSessions(nextSessions);
      setCapability(nextCapability);
      setListPhase(nextSessions.length === 0 ? 'empty' : 'sessions');
    }).catch((caught) => {
      if (!isCurrent) {
        return;
      }
      // Nothing is substituted: no crawl is better than an invented one.
      setSessions([]);
      setCapability(null);
      setListError(messageFor(caught, 'Live sessions could not be loaded.'));
      setListPhase('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [live, locationId, attempt]);

  const reload = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const join = useCallback((sessionId: Id) => {
    if (isMutatingRef.current) {
      return;
    }
    isMutatingRef.current = true;
    setPendingSessionId(sessionId);
    setJoinPhase('joining');
    setJoinError(null);
    setRetry(null);
    live.joinSession(sessionId).then((session) => {
      if (!isMountedRef.current) {
        return;
      }
      // Joined only now, and only with the session the service returned.
      setJoinedSession(session);
      setJoinPhase('joined');
    }).catch((caught) => {
      if (!isMountedRef.current) {
        return;
      }
      // The confirmed membership is left exactly as it was.
      setJoinError(messageFor(caught, 'That session could not be joined.'));
      setJoinPhase('error');
      setRetry(() => () => join(sessionId));
    }).finally(() => {
      isMutatingRef.current = false;
      if (isMountedRef.current) {
        setPendingSessionId(null);
      }
    });
  }, [live]);

  const leave = useCallback(() => {
    const current = joinedSession;
    if (!current || isMutatingRef.current) {
      return;
    }
    isMutatingRef.current = true;
    setPendingSessionId(current.id);
    setJoinPhase('leaving');
    setJoinError(null);
    setRetry(null);
    live.leaveSession(current.id).then(() => {
      if (!isMountedRef.current) {
        return;
      }
      setJoinedSession(null);
      setJoinPhase('idle');
    }).catch((caught) => {
      if (!isMountedRef.current) {
        return;
      }
      // A refused leave keeps the viewer in the session they are still in, rather
      // than clearing the indicator and pretending they left.
      setJoinError(messageFor(caught, 'That session could not be left.'));
      setJoinPhase('error');
      setRetry(() => () => leave());
    }).finally(() => {
      isMutatingRef.current = false;
      if (isMountedRef.current) {
        setPendingSessionId(null);
      }
    });
  }, [live, joinedSession]);

  return useMemo(() => ({
    listPhase,
    sessions,
    listError,
    reload,
    capability,
    joinPhase,
    joinedSession,
    pendingSessionId,
    joinError,
    retry,
    join,
    leave
  }), [listPhase, sessions, listError, reload, capability, joinPhase, joinedSession, pendingSessionId, joinError, retry, join, leave]);
}