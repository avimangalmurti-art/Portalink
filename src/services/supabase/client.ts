import { createClient } from '@supabase/supabase-js';
import {createCallbackSessionStorage,adoptCallbackSession,sessionId} from './callbackSession';
import {revokeIssuedSession} from '../../features/auth/scopedSessionCleanup';
import { createPasswordRecoveryTracker } from './passwordRecovery';
import { rumSupabaseFetch } from '../../features/performance/rum';
import { createSessionRevocationObserver } from './sessionRevocation';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

/** Callback recovery targets its delivered token; never signs out the current/shared session. */
export function revokeIssuedAuthSession(accessToken:string):Promise<boolean> {
  return revokeIssuedSession(projectUrl,publishableKey,accessToken);
}

export async function readSocialProviders() {
  requireSupabase();
  const response = await fetch(`${projectUrl}/auth/v1/settings`, {
    headers: { apikey: publishableKey }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Sign-in options could not be checked.');
  const settings = await response.json();
  let handoffReady=false;
  try{const capability=await fetch('/api/auth/google/capability',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(capability.ok)handoffReady=(await capability.json()).google===true;}catch{/* Fail closed until server configuration is reviewed. */}
  return { google: settings.external?.google === true && handoffReady, apple: settings.external?.apple === true };
}
const configuredRuntimeMode = import.meta.env.VITE_RUNTIME_MODE?.trim().toLowerCase() ?? '';

if (configuredRuntimeMode && configuredRuntimeMode !== 'prototype' && configuredRuntimeMode !== 'production') {
  throw new Error('VITE_RUNTIME_MODE must be either "prototype" or "production".');
}

export type RuntimeMode = 'prototype' | 'production';
export const runtimeMode: RuntimeMode = configuredRuntimeMode === 'prototype'
  ? 'prototype'
  : configuredRuntimeMode === 'production' || import.meta.env.PROD
    ? 'production'
    : 'prototype';
export const isProductionRuntime = runtimeMode === 'production';

/**
 * Production mode is opt-in. A checkout without credentials remains a reviewable
 * prototype, while a configured deployment uses only durable services.
 */
const isRealProjectUrl =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl) &&
  !projectUrl.includes('YOUR_');
const isRealPublishableKey =
  publishableKey.length > 20 && !publishableKey.includes('YOUR_');

export const isSupabaseConfigured = isRealProjectUrl && isRealPublishableKey;
// Keep the SDK's existing namespace explicit so confirmed account deletion can
// clear only this application's session if the SDK cannot finish local logout.
const authStorageKey = isRealProjectUrl ? `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token` : '';
// All participating tabs serialize storage operations; callback admission fails closed without Web Locks.
const callbackSessionStorage=createCallbackSessionStorage(()=>{try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}},authStorageKey,
 typeof navigator!=='undefined'&&navigator.locks
  ? operation=>navigator.locks.request(authStorageKey+'-storage',{signal:AbortSignal.timeout(5000)},()=>operation()) : null);
export async function adoptIssuedAuthSession(access:string,refresh:string,onIssued:(token:string)=>void,navigate:()=>void) {
 requireSupabase();
 // A targeted cleanup notice must be available to tabs which read a brief commit.
 const probe=new BroadcastChannel(authStorageKey+'-callback-cleanup');probe.close();
 const isolated=createClient(projectUrl,publishableKey,{auth:{storageKey:authStorageKey+'-callback-memory',
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 await adoptCallbackSession(isolated.auth,callbackSessionStorage,access,refresh,onIssued,navigate);
}
export async function cleanupIssuedAuthSession(token:string):Promise<boolean> {
 // Revoke first, then reconcile rotated credentials under the shared storage lock.
 let remote=false;
 try{remote=await revokeIssuedAuthSession(token);}catch{/* Local reconciliation still runs after unexpected transport failure. */}
 const local=await callbackSessionStorage.removeIssued(token);
 let notified=false;
 if(local){try{const channel=new BroadcastChannel(authStorageKey+'-callback-cleanup');
  channel.postMessage({sessionId:sessionId(token)});channel.close();notified=true;}catch{/* Report unconfirmed cross-tab reconciliation. */}}
 return remote&&local&&notified;
}
const recoveryStorage = (() => {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
})();
export const passwordRecovery = createPasswordRecoveryTracker(recoveryStorage, `${authStorageKey}-recovery`);
// An expired callback must not reuse a recovery checkpoint from an earlier link.
export const recoveryCallbackFailed = typeof window !== 'undefined'
  && (new URLSearchParams(window.location.hash.slice(1)).has('error')
    || new URLSearchParams(window.location.hash.slice(1)).has('error_code'));
if (recoveryCallbackFailed) passwordRecovery.clear();

if (isProductionRuntime && !isSupabaseConfigured) {
  throw new Error(
    'Portalink cannot start in production mode without a valid Supabase URL and publishable key.',
  );
}

let observedAccessToken: string | null = null;
const sessionRevocation = createSessionRevocationObserver({
  fetch: rumSupabaseFetch,
  endpoint: `${projectUrl}/rest/v1/rpc/require_active_account_session`,
  publishableKey,
  currentToken: () => observedAccessToken,
  onRevoked: (token) => {
    if (observedAccessToken !== token) return;
    observedAccessToken = null;
    // Run outside Auth callbacks/locks. Do not sign out a replacement login.
    window.setTimeout(() => {
      if (observedAccessToken !== null && observedAccessToken !== token) return;
      observedAccessToken = null;
      void supabase?.removeAllChannels();
      void supabase?.auth.signOut({ scope: 'local' });
    }, 0);
  },
});

export const supabase = isSupabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      global: { fetch: sessionRevocation.fetch },
      auth: {
        storageKey: authStorageKey,
        storage: callbackSessionStorage.storage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if(supabase&&typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined') {
 const channel=new BroadcastChannel(authStorageKey+'-callback-cleanup');
 channel.onmessage=event=>{
  try{if(observedAccessToken&&sessionId(observedAccessToken)===event.data?.sessionId)window.location.reload();}
  catch{/* Malformed local messages cannot clear storage or log out another session. */}
 };
}

// Register before React mounts: the SDK emits PASSWORD_RECOVERY only once
// while consuming the link, and late subscribers receive INITIAL_SESSION.
supabase?.auth.onAuthStateChange((event, session) => passwordRecovery.record(event, session));
supabase?.auth.onAuthStateChange((_event, session) => {
  observedAccessToken = session?.access_token ?? null;
});
if (supabase && typeof window !== 'undefined') {
  const checkVisibleSession = () => { if (document.visibilityState === 'visible') void sessionRevocation.check(); };
  // Backend requests reject immediately. Idle foreground UI notices within 15s;
  // waking a suspended phone/browser checks immediately on focus/visibility.
  window.setInterval(checkVisibleSession, 15_000);
  window.addEventListener('focus', checkVisibleSession);
  document.addEventListener('visibilitychange', checkVisibleSession);
}

/** Password writes stay bound to the recovered account if another tab signs in. */
export function createPasswordRecoveryClient() {
  requireSupabase();
  return createClient(projectUrl, publishableKey, {
    auth: {
      storageKey: `${authStorageKey}-recovery-write`,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth;
}

export function clearDeletedAccountStorage(): void {
  if (!authStorageKey || typeof window === 'undefined') return;
  for (const key of [authStorageKey, `${authStorageKey}-user`, `${authStorageKey}-code-verifier`]) {
    window.localStorage.removeItem(key);
  }
}

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return supabase;
}

export function requireSupabaseProjectUrl(): string {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return projectUrl;
}

// Release lock: do not restore the environment flag until the replacement
// shared-content rules and delayed deletion flow have been reviewed.
export const accountDeletionEnabled = false;
