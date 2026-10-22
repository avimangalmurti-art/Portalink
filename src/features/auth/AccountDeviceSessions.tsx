import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { Button } from '../../components/ui/Button';
import { toAuthError } from '../../types/auth';
import type { AccountDeviceSession, AccountSessionCursor } from '../../types/auth';
import { sessionDeviceLabel } from './sessionDeviceLabel';

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export function AccountDeviceSessions({ disabled, onBusyChange, refreshKey }: { disabled: boolean; onBusyChange: (busy: boolean) => void; refreshKey: number }) {
  const auth = useAuth();
  const { auth: service } = useServices();
  const accountId = auth.user?.id;
  const [sessions, setSessions] = useState<AccountDeviceSession[]>([]);
  const [cursor, setCursor] = useState<AccountSessionCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<AccountDeviceSession | null>(null);
  const [revoking, setRevoking] = useState(false);
  const generation = useRef(0);
  const mutationLock = useRef(false);
  const load = useCallback(async (next?: AccountSessionCursor) => {
    if (!accountId) return;
    const request = ++generation.current;
    setLoading(true); setError(null);
    try {
      const page = await service.listAccountSessions(accountId, next);
      if (request !== generation.current) return;
      setSessions(previous => next ? [...previous, ...page.sessions.filter(row => !previous.some(old => old.id === row.id))] : page.sessions);
      setCursor(page.nextCursor); setLoaded(true);
    } catch (caught) {
      if (request === generation.current) setError(toAuthError(caught).message);
    } finally { if (request === generation.current) setLoading(false); }
  }, [accountId, service]);
  useEffect(() => {
    const requestClock = generation;
    setSessions([]); setCursor(null); setLoaded(false); setSelected(null); setMessage(null);
    void load();
    return () => { requestClock.current++; };
  }, [load, refreshKey, auth.session]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  async function revoke() {
    if (!accountId || !selected || disabled || mutationLock.current) return;
    mutationLock.current = true; setRevoking(true); onBusyChange(true); setError(null); setMessage(null);
    const request = generation.current;
    try {
      if (selected.isCurrent) {
        if (!await auth.signOut('local')) throw new Error('Unable to sign out this session. Please try again.');
      } else {
        const removed = await service.revokeAccountSession(accountId, selected.id);
        if (request !== generation.current) return;
        setSessions(previous => previous.filter(row => row.id !== selected.id));
        setMessage(removed ? 'This session has been signed out. Further account requests from that session are blocked.' : 'This session has already ended.');
      }
      if (request === generation.current) setSelected(null);
    } catch (caught) {
      if (request === generation.current) setError(toAuthError(caught).message);
    } finally { mutationLock.current = false; setRevoking(false); onBusyChange(false); }
  }

  return <div className="security-devices">
    <p>Each row is a sign-in session. Browser and device names are estimates; separate browsers on the same device appear separately.</p>
    <Button disabled={disabled || loading} onClick={() => { setSelected(null); setMessage(null); void load(); }}>Refresh device list</Button>
    {loading && <p role="status">Loading signed-in sessions…</p>}
    {error && <p role="alert">{error}</p>}
    {loaded && !loading && !sessions.length && <p>No signed-in sessions were found. Refresh to check again.</p>}
    <ul className="security-device-list" aria-label="Signed-in devices">
      {sessions.map(session => <li key={session.id} className="security-notice">
        <h3>{sessionDeviceLabel(session.userAgent)}{session.isCurrent && <span className="security-current-session">This session</span>}</h3>
        <p>Signed in: {dateLabel(session.createdAt)}</p>
        <p>Last refreshed: {session.refreshedAt ? dateLabel(session.refreshedAt) : 'Not recorded'}</p>
        <Button disabled={disabled || loading} onClick={() => { setSelected(session); setError(null); setMessage(null); }} aria-label={`Sign out ${sessionDeviceLabel(session.userAgent)}${session.isCurrent ? ', this session' : ''}`}>Sign out</Button>
        {selected?.id === session.id && <div className="security-notice" role="group" aria-label="Confirm individual session sign out">
          <p>Sign out {sessionDeviceLabel(selected.userAgent)}?</p>
          <p>{selected.isCurrent ? 'You will need to sign in again here.' : 'That session will need to sign in again. This session stays signed in.'}</p>
          <div className="security-session-actions"><Button autoFocus variant="danger" disabled={disabled} isLoading={revoking} onClick={() => void revoke()}>Confirm device sign out</Button><Button disabled={disabled} onClick={() => { setSelected(null); setError(null); }}>Cancel device sign out</Button></div>
        </div>}
      </li>)}
    </ul>
    {cursor && <Button disabled={disabled || loading} onClick={() => void load(cursor)}>Load more sessions</Button>}
    {message && <p role="status">{message}</p>}
  </div>;
}
