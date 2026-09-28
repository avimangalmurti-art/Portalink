import { requireSupabase } from '../../services/supabase/client';

/** Shared transport for page actions and the account's saved-page library. */
export async function mediaInteractionRequest<T>(path: string, init?: RequestInit, requireAccount = false, expectedAccount?: string | null): Promise<T> {
  let token: string | null = null;
  let account: string | null = null;
  try {
    const { data } = await requireSupabase().auth.getSession();
    token = data.session?.access_token ?? null;
    account = data.session?.user.id ?? null;
  } catch { /* An optional public read can proceed without a session. */ }
  if (expectedAccount !== undefined && account !== expectedAccount) throw new Error('Your account changed. Please try again.');
  if (requireAccount && !token) throw new Error('Sign in to continue.');
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (init?.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error || 'This page activity is temporarily unavailable.');
  if (!payload) throw new Error('This page activity is temporarily unavailable.');
  return payload;
}
