import { requireSupabase } from './client';

/** Directory requests require a real signed-in account before reading profiles. */
export async function requireDirectoryAccount() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error || !data.user || data.user.is_anonymous) {
    throw new Error('Create an account or sign in to find people on Portalink.');
  }
}
