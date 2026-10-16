import React, { useRef, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { AuthField } from '../../components/auth/AuthField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { toAuthError } from '../../types/auth';
import { useAccountSecurity } from './useAccountSecurity';
import type { PasswordFieldKey } from './useAccountSecurity';
import './account-security.css';
import { AccountDeviceSessions } from './AccountDeviceSessions';

type SessionAction = 'local' | 'others' | 'global';
const sessionLabels: Record<SessionAction, string> = {
  local: 'Sign out this session', others: 'Sign out other sessions', global: 'Sign out all sessions'
};

export function AccountSecurityPage({ onBack }: { onBack: () => void }) {
  const auth = useAuth();
  const { auth: service } = useServices();
  const security = useAccountSecurity();
  const fields = useRef<Partial<Record<PasswordFieldKey, HTMLInputElement | null>>>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const [sessionAction, setSessionAction] = useState<SessionAction | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const sessionLock = useRef(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const busy = security.password.isSubmitting || security.email.isSubmitting || security.verification.isSending || sessionBusy || deviceBusy;
  const ready = Boolean(security.capability && security.state && !security.isLoadingCapability && !security.isLoadingState);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    const invalid = await security.password.submit();
    if (invalid) fields.current[invalid]?.focus();
  }
  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    if (await security.email.submit()) await auth.refreshSession(auth.user?.id);
    else emailRef.current?.focus();
  }
  async function confirmSessionAction() {
    if (!sessionAction || !auth.user || busy || sessionLock.current) return;
    sessionLock.current = true;
    setSessionBusy(true);
    setSessionError(null);
    setSessionMessage(null);
    try {
      if (sessionAction === 'others') {
        await service.signOutOtherSessions(auth.user.id);
        setSessionRefreshKey(key => key + 1);
        setSessionMessage('Other sessions have been signed out. Further account requests from those sessions are blocked. This session stays signed in.');
      } else if (!await auth.signOut(sessionAction)) {
        throw new Error('Unable to sign out. Please try again.');
      }
      setSessionAction(null);
    } catch (error) {
      setSessionError(toAuthError(error).message);
    } finally {
      sessionLock.current = false;
      setSessionBusy(false);
    }
  }

  return <div className="settings-page account-security-page">
    <header className="settings-page-header">
      <button type="button" onClick={onBack} aria-label="Back to Settings" className="settings-back"><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /></button>
      <h1>Account security</h1>
    </header>
    {!auth.isAuthenticated ? <div className="security-card">
      <p role="status">{auth.isInitializing ? 'Loading your account…' : auth.phase === 'signing-out' ? 'Signing out…' : 'Sign in to manage your account security.'}</p>
      <Button disabled={auth.isInitializing || auth.phase === 'signing-out'} onClick={() => auth.requestAuthenticatedDestination({ kind: 'route', path: '/settings?security=1', label: 'manage your account security' })}>Sign in</Button>
    </div> : <div className="security-sections">
      {(security.isLoadingCapability || security.isLoadingState) && <p role="status">Loading account security…</p>}
      {security.capabilityError && <div role="alert"><p>{security.capabilityError}</p><Button disabled={busy} onClick={() => void security.retryCapability()}>Try again</Button></div>}
      {security.stateError && <div role="alert"><p>{security.stateError}</p><Button disabled={busy} onClick={() => void security.reloadState()}>Try again</Button></div>}
      {security.state && <section className="security-card" aria-labelledby="security-email-title">
        <h2 id="security-email-title">Email address</h2>
        <p className="security-address">{security.state.email}</p>
        <p>{security.state.isEmailVerified ? 'Verified' : 'Awaiting verification'}</p>
        {security.state.pendingEmailChange && <div className="security-notice"><p>Pending change: <span className="security-address">{security.state.pendingEmailChange.newEmail}</span></p><p>Your current address remains active until confirmation is complete. Check both addresses for any required confirmation links.</p>
          <Button disabled={busy || !ready || !security.capability?.canSendVerificationEmail} onClick={() => void security.verification.resend('pending-email')}>{security.verification.isSending ? 'Requesting…' : 'Resend confirmation'}</Button>
          <Button disabled={busy || !ready} onClick={() => { void security.reloadState(); void auth.refreshSession(auth.user?.id); }}>Check confirmation status</Button>
        </div>}
        {!security.state.isEmailVerified && !security.state.pendingEmailChange && <Button disabled={busy || !ready || !security.capability?.canSendVerificationEmail} onClick={() => void security.verification.resend('account')}>Resend verification</Button>}
        {security.capability?.canChangeEmail ? <form noValidate onSubmit={submitEmail}>
          <AuthField ref={emailRef} id="security-new-email" label="New email address" type="email" value={security.email.draft} autoComplete="email" disabled={busy || !ready} error={security.email.fieldError} onChange={security.email.setDraft} />
          <p>Confirm the change using the email links. Your email address will update after confirmation.</p>
          <Button type="submit" disabled={busy || !ready} isLoading={security.email.isSubmitting}>Change email</Button>
        </form> : security.capability && <p>{security.capability.emailReason ?? 'Email changes are unavailable.'}</p>}
        {security.email.error && <p role="alert">{security.email.error.message}</p>}
        {security.email.result && security.email.phase === 'succeeded' && <p role="status">{security.email.result.message}</p>}
        {security.verification.result && <p role="status">{security.verification.result.message}</p>}
        {security.verification.error && <p role="alert">{security.verification.error.message}</p>}
      </section>}
      {security.state && <section className="security-card" aria-labelledby="security-password-title">
        <h2 id="security-password-title">Password</h2>
        {security.capability?.canChangePassword && security.state.hasPassword ? <form noValidate onSubmit={submitPassword}>
          {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map(key => <AuthField key={key} ref={element => { fields.current[key] = element; }} id={`security-${key}`} label={key === 'currentPassword' ? 'Current password' : key === 'newPassword' ? 'New password' : 'Confirm new password'} type="password" autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'} revealPassword value={security.password.form[key]} error={security.password.fieldErrors[key]} hint={key === 'newPassword' ? 'Use at least 8 characters.' : undefined} disabled={busy || !ready} onChange={value => security.password.setField(key, value)} />)}
          <Button type="submit" disabled={busy || !ready} isLoading={security.password.isSubmitting}>Change password</Button>
        </form> : security.capability && <p>{security.capability.passwordReason ?? 'Password changes are unavailable for this account.'}</p>}
        <button type="button" className="settings-text-action" disabled={busy} onClick={() => auth.requestAuth('forgotPassword')}>Forgot your password?</button>
        {security.password.error && <p role="alert">{security.password.error.message}</p>}
        {security.password.phase === 'succeeded' && <p role="status">{security.password.result?.message}</p>}
      </section>}
      <section className="security-card" aria-labelledby="security-sessions-title">
        <h2 id="security-sessions-title">Signed-in sessions</h2>
        <p>This browser session is signed in. You can end this session, every other session, or all sessions.</p>
        <p>Signing out blocks further account requests immediately. A device may briefly show already loaded content; previously issued media links can remain valid until they expire.</p>
        {!auth.session?.isPrototype && <AccountDeviceSessions disabled={busy} onBusyChange={setDeviceBusy} refreshKey={sessionRefreshKey} />}
        {auth.session?.isPrototype ? <p>Session controls require a connected account. This prototype has no other sessions.</p> : <div className="security-session-actions">
          {(Object.keys(sessionLabels) as SessionAction[]).map(action => <Button key={action} disabled={busy} onClick={() => { setSessionAction(action); setSessionError(null); setSessionMessage(null); }}>{sessionLabels[action]}</Button>)}
        </div>}
        {sessionAction && <div className="security-notice" role="group" aria-label="Confirm session sign out">
          <p>{sessionLabels[sessionAction]}?</p>
          <p>{sessionAction === 'others' ? 'You will stay signed in here. Other sessions will need to sign in again.' : 'You will need to sign in again here.'}</p>
          <div className="security-session-actions"><Button variant="danger" disabled={busy} isLoading={sessionBusy} onClick={() => void confirmSessionAction()}>Confirm sign out</Button><Button disabled={busy} onClick={() => { setSessionAction(null); setSessionError(null); }}>Cancel</Button></div>
        </div>}
        {sessionError && <p role="alert">{sessionError}</p>}
        {sessionMessage && <p role="status">{sessionMessage}</p>}
      </section>
    </div>}
  </div>;
}
