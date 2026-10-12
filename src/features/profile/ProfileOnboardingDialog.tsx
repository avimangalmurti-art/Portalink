import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { AccountWelcomeSurface, type AccountAppearanceProps } from '../../components/auth/AccountWelcomeSurface';
import { MobileOnboardingAction, MobileOnboardingAppearance } from '../../components/auth/MobileOnboarding';
import { Button } from '../../components/ui/Button';
import { usePresentation } from '../../presentation/usePresentation';
import { useCreateProfile } from './useProfileOnboarding';
import { createProfileHandle, prepareProfileHandle } from '../../utils/profileHandle';
import { DEFAULT_PUBLIC_APPEARANCE } from '../../utils/publicAppearance';
import { firstSignInStep } from '../auth/firstSignIn';
import '../auth/first-signin.css';

type Props = AccountAppearanceProps & { isOpen: boolean; onDismiss: () => void; onComplete: (profileId: string) => void; onAddProject?: (profileId: string) => void; completionActionLabel?: string };
/** Appearance is the existing screen, moved after verified sign-in. Terms owns the next gate. */
export function ProfileOnboardingDialog(props: Props) {
  const auth = useAuth(), {auth: service, profiles} = useServices(), create = useCreateProfile();
  const isMobile = usePresentation() === 'mobile', step = firstSignInStep(auth.session);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null), action = useRef(create.run); action.current = create.run;
  const accountId = auth.user?.id;
  const creation = useRef({auth, profiles, props}); creation.current = {auth, profiles, props};
  useEffect(() => {
    const {auth: currentAuth, profiles: currentProfiles, props: currentProps} = creation.current;
    if (!props.isOpen || step !== 'project' || !accountId || currentAuth.viewerProfileId || started.current === accountId) return;
    started.current = accountId; setBusy(true); setError(null);
    let active = true;
    const name = currentAuth.user?.registration?.name || currentAuth.user?.displayName || 'Creator';
    const requested = currentAuth.user?.registration?.handle ?? createProfileHandle(name);
    void prepareProfileHandle(requested, currentProfiles.checkPublicHandle ?? (() => Promise.resolve('unavailable')))
      .then(handle => active ? action.current({ name, handle, allowHandleCollisionSuffix: true, creationKey: currentAuth.user?.registration?.id, publicAppearance: {...DEFAULT_PUBLIC_APPEARANCE, accentColor: currentProps.accentColor, systemGray: currentProps.systemGray ?? DEFAULT_PUBLIC_APPEARANCE.systemGray} }) : undefined)
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Your profile could not be created.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [props.isOpen, step, accountId, attempt]);
  const shownError = error ?? create.error;
  if (!props.isOpen || !auth.isAuthenticated) return null;
  async function saveStep(next: 'project' | 'complete', add = false) {
    if (busy || !accountId) return; setBusy(true); setError(null);
    try {
      if (!service.updateOnboardingStep) throw new Error('Account setup is temporarily unavailable. Please try again.');
      await service.updateOnboardingStep(next);
      if (!await auth.refreshSession(accountId)) throw new Error('Your session changed. Sign in to continue.');
      if (next === 'complete' && auth.viewerProfileId) (add ? props.onAddProject ?? props.onComplete : props.onComplete)(auth.viewerProfileId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your setup could not be saved.'); }
    finally { setBusy(false); }
  }
  return <AccountWelcomeSurface {...props} mobileOnboarding={isMobile} showAppearance={false} title={step === 'appearance' ? 'Make it yours' : 'Add your first project'} busy={busy} onDismiss={() => { void auth.signOut('local').then(ended => { if (ended) window.location.assign('/?welcome=1'); }); }}>
    <div data-onboarding-step={step ?? undefined} className={`first-signin ${isMobile ? 'mobile-onboarding-form' : 'flex flex-col gap-4'}`}>
      <div className={isMobile ? 'mobile-onboarding-fields' : 'contents'}>
        {step === 'appearance' && <MobileOnboardingAppearance {...props}/>}
        {shownError && <p role="alert">{shownError} {step === 'project' && !auth.viewerProfileId && <button type="button" className="underline min-h-11" onClick={() => {create.reset(); started.current = null; setAttempt(value => value + 1);}}>Try again</button>}</p>}
        {step !== 'appearance' && !auth.viewerProfileId && !shownError && <p role="status">Preparing your profile…</p>}
      </div>
      {step === 'appearance' ? <MobileOnboardingAction busy={busy} onClick={() => void saveStep('project')}>Continue</MobileOnboardingAction> : auth.viewerProfileId && <>
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void saveStep('complete', true)}>Add your first project</Button>
        <button type="button" className="min-h-11 underline" disabled={busy} onClick={() => void saveStep('complete')}>Skip for now</button>
      </>}
    </div>
  </AccountWelcomeSurface>;
}
