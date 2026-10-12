import type { AuthSession } from '../../types/auth';

/** Setup preferences are never ownership or authorization claims. */
export function firstSignInStep(session: AuthSession | null): 'appearance' | 'project' | null {
  if (!session?.user.isEmailVerified || session.isPasswordRecovery) return null;
  const user = session.user;
  if (!user.profileId) return user.onboardingStep === 'project' || user.onboardingStep === 'complete' ? 'project' : 'appearance';
  return user.onboardingStep === 'project' ? 'project' : null;
}
