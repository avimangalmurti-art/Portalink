import { loadEnv } from 'vite';

/** Fail before compilation; errors contain variable names, never their values. */
export function requireBuildEnvironment(env) {
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
    if (typeof env[name] !== 'string' || !env[name].trim()) throw new Error(`Build blocked: ${name} is empty. Configure this publishing checkout's .env.local before building.`);
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(env.VITE_SUPABASE_URL.trim()) || env.VITE_SUPABASE_URL.includes('YOUR_')) throw new Error('Build blocked: VITE_SUPABASE_URL is not a valid Supabase project URL.');
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY.trim().length <= 20 || env.VITE_SUPABASE_PUBLISHABLE_KEY.includes('YOUR_')) throw new Error('Build blocked: VITE_SUPABASE_PUBLISHABLE_KEY is not a valid publishable key.');
  return env;
}
export function productionBuildEnvironment(root = process.cwd(), mode = 'production') {
  return requireBuildEnvironment(loadEnv(mode, root, 'VITE_'));
}
