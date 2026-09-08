import { createClient } from '@supabase/supabase-js';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
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

if (isProductionRuntime && !isSupabaseConfigured) {
  throw new Error(
    'Portalink cannot start in production mode without a valid Supabase URL and publishable key.',
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      auth: {
        storageKey: authStorageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

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
