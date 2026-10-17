import { requireSupabase } from './client';
import { requireAdmission, LAUNCH_REVIEW_VERSION, type LaunchAdmission } from '../../features/launch/adultLaunch';
/** Missing migration or unapproved copy blocks new registration, never falls back. */
export async function admittedLaunch(): Promise<LaunchAdmission> {
  const receipt = requireAdmission();
  const {data,error} = await requireSupabase().rpc('adult_launch_policy');
  if (error || !data?.ready || data.terms_version !== LAUNCH_REVIEW_VERSION || data.privacy_version !== LAUNCH_REVIEW_VERSION) {
    throw new Error('Registration is awaiting reviewed agreements and launch safeguards. You can continue as a guest or sign in to an existing account.');
  }
  return receipt;
}
export async function recordLaunchReceipt(): Promise<void> {
  const client = requireSupabase();
  const current = await client.auth.getUser();
  if (current.error || !current.data.user) throw new Error('Sign in to complete account setup.');
  const {data,error} = await client.rpc('verify_adult_launch_receipt', {p_terms_version:LAUNCH_REVIEW_VERSION,p_privacy_version:LAUNCH_REVIEW_VERSION});
  if (error||data?.verified!==true) throw new Error('Your confirmed launch agreement record could not be verified.');
}
