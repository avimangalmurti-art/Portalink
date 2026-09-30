import type { Plugin } from 'vite';
export type SharedPreloadConfiguration = { supabaseUrl?: string; publishableKey?: string };
export function sharedProfilePreloadScript(configuration: SharedPreloadConfiguration): string | null;
export function sharedProfilePreloadPlugin(configuration: SharedPreloadConfiguration): Plugin;
