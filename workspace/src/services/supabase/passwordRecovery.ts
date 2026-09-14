import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { AuthRecoverySession } from '../../types/auth';

type Checkpoint = { accountId: string; sessionId: string; expiresAt: number };
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function sessionId(session: Session): string | null {
  try {
    // Used only to bind the form to the same SDK session, never as an
    // authorization claim. Supabase validates the session before updating.
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch { return null; }
}

/** A tab-local recovery checkpoint holds no access token or password. */
export function createPasswordRecoveryTracker(storage: RecoveryStorage | null, key: string, now = Date.now) {
  let checkpoint: Checkpoint | null = null;
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null') as Checkpoint | null;
    if (saved && typeof saved.accountId === 'string' && typeof saved.sessionId === 'string'
      && typeof saved.expiresAt === 'number' && saved.expiresAt > now()
      && saved.expiresAt <= now() + 60 * 60 * 1000) checkpoint = saved;
  } catch { /* Private browsing still supports recovery until a refresh. */ }

  const clear = (expected?: Session) => {
    if (expected && checkpoint && (checkpoint.accountId !== expected.user.id
      || checkpoint.sessionId !== sessionId(expected))) return;
    checkpoint = null;
    try { storage?.removeItem(key); } catch { /* Memory state is already cleared. */ }
  };
  const matches = (session: Session | null) => Boolean(checkpoint && session
    && checkpoint.expiresAt > now() && checkpoint.accountId === session.user.id
    && checkpoint.sessionId === sessionId(session));

  return {
    clear,
    record(event: AuthChangeEvent, session: Session | null) {
      if (event === 'PASSWORD_RECOVERY' && session?.user.email) {
        const id = sessionId(session);
        if (!id) { clear(); return; }
        checkpoint = { accountId: session.user.id, sessionId: id, expiresAt: now() + 60 * 60 * 1000 };
        try { storage?.setItem(key, JSON.stringify(checkpoint)); } catch { /* Keep in memory. */ }
      } else if (event === 'SIGNED_OUT' || checkpoint && !matches(session)) clear();
    },
    read(session: Session | null): AuthRecoverySession | null {
      if (checkpoint && checkpoint.expiresAt <= now()) clear();
      // A delayed profile lookup can still hold an older session. It must not
      // erase a newer recovery checkpoint; auth events own account changes.
      if (!matches(session) || !session?.user.email) return null;
      return { email: session.user.email, isPrototype: false };
    },
  };
}
