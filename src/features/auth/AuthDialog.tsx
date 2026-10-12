import { useServices } from '../../contexts/ServicesContext';
import { createProfileHandle, prepareProfileHandle } from '../../utils/profileHandle';
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { AuthView } from '../../contexts/AuthContext';
import { AuthField } from '../../components/auth/AuthField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { PortalinkSplashLoader } from '../../components/ui/PortalinkSplashLoader';
import { ProfileField } from '../../components/profile/ProfileField';
import { validateProfileName, NAME_MAX_LENGTH } from '../profile/validation';
import { AccountWelcomeSurface, type AccountAppearanceProps } from '../../components/auth/AccountWelcomeSurface';
import { usePasswordReset, usePasswordUpdate, useSignUp } from './useAuthFlows';
import { validateEmail, validateNewPassword, validatePasswordConfirmation, validateRequiredPassword } from './validation';
import { MobileOnboardingAction, type MobileSignupStep } from '../../components/auth/MobileOnboarding';
import { usePresentation } from '../../presentation/usePresentation';
import { readSharedReturnPath } from './registration';

const titles: Record<AuthView, string> = {
  signIn: 'Sign in', signUp: 'Create your account',
  forgotPassword: 'Reset your password', resetPassword: 'Set a new password',
};

const mobileSignupTitles: Record<MobileSignupStep, string> = {
  appearance: 'Make it yours', account: 'Create account', profile: 'Create your profile', verification: 'Check your email',
};

export function AuthDialog(props: AccountAppearanceProps & { registrationReturnPath?: string; showWelcomeMedia?: boolean; initialSignupStep?: MobileSignupStep; welcomeBeforeSignup?: boolean }) {
  const auth = useAuth();
  const isMobile = usePresentation() === 'mobile';
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [welcomeCompleted, setWelcomeCompleted] = useState(false);
  const { auth: authService } = useServices();
  const [providerError, setProviderError] = useState<string | null>(null);
  const continueWithProvider = async (provider: 'google' | 'apple') => {
    if (busy) return; setBusy(true); setProviderError(null);
    try { if (!authService.signInWithProvider) throw new Error('This sign-in method is unavailable. Please continue with email.'); await authService.signInWithProvider(provider); }
    catch (error) { setProviderError(error instanceof Error ? error.message : 'Please continue with email.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (!auth.pendingView) setWelcomeCompleted(false); }, [auth.pendingView]);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [signupStep, setSignupStep] = useState<MobileSignupStep>('account');
  useEffect(() => { if (auth.pendingView !== 'signUp') setSignupStep('account'); }, [auth.pendingView, props.initialSignupStep]);
  const mobileSignup = isMobile && auth.pendingView === 'signUp';
  const signIn = auth.pendingView === 'signIn';
  if (!auth.pendingView) return null;
  if (props.welcomeBeforeSignup && (auth.pendingView === 'signUp' || auth.pendingView === 'signIn') && !welcomeCompleted) return <PortalinkSplashLoader landing={{
    ready: !auth.isInitializing && !busy,
    onGoogle: () => void continueWithProvider('google'), onApple: () => void continueWithProvider('apple'), error: providerError,
    onCreateAccount: () => { setWelcomeCompleted(true); auth.requestAuth('signUp'); },
    onSignIn: () => { setWelcomeCompleted(true); auth.requestAuth('signIn'); },
    onForgotPassword: () => auth.requestAuth('forgotPassword'),
    onContinue: auth.closeAuth,
    continueLabel: 'Continue as guest',
  }} />;
  const formProps = { firstFieldRef, onBusyChange: setBusy, onDirtyChange: setDirty };
  return <AccountWelcomeSurface {...props} mobileOnboarding={mobileSignup} signIn={signIn} showAppearance={auth.pendingView !== 'signUp' && !signIn && (!isMobile || (auth.pendingView !== 'forgotPassword' && auth.pendingView !== 'resetPassword'))} title={mobileSignup ? mobileSignupTitles[signupStep] : titles[auth.pendingView]} busy={busy || auth.phase === 'authenticating'} dirty={dirty} onDismiss={auth.closeAuth}>
    {requestLeave => <>{auth.pendingView === 'signIn' && <SignInForm {...formProps} onViewChange={view => requestLeave(() => auth.requestAuth(view))} />}
    {auth.pendingView === 'signUp' && <SignUpForm {...props} {...formProps} step={signupStep} onStepChange={setSignupStep} onViewChange={view => requestLeave(() => auth.requestAuth(view))} accentColor={props.accentColor} />}
    {auth.pendingView === 'forgotPassword' && <ForgotPasswordForm {...formProps} onViewChange={view => requestLeave(() => auth.requestAuth(view))} />}
    {auth.pendingView === 'resetPassword' && <ResetPasswordForm {...formProps} onViewChange={view => requestLeave(() => auth.requestAuth(view))} />}
    </>}
  </AccountWelcomeSurface>;
}

function useFormActivity(busy: boolean, { onBusyChange, onDirtyChange }: FormProps, dirty = false) {
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
}

/** Failure banner: icon, sentence, and an optional way to try again. */
function FormError({
  message,
  onRetry



}: {message: string;onRetry?: () => void;}) {
  return <div role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed">
      <InterfaceIcon icon={AlertCircleIcon} weight="medium" className="mt-[2px]" />
      <span className="min-w-0 flex-1">
        {message}
        {onRetry && <button type="button" onClick={onRetry} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>}
      </span>
    </div>;
}
function FormSuccess({
  title,
  description



}: {title: string;description: string;}) {
  return <div role="status" className="flex items-start gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-3 text-[13px] leading-relaxed">
      <InterfaceIcon icon={CheckCircle2Icon} weight="medium" className="mt-[2px] text-[var(--text-secondary)]" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-[var(--text-secondary)]">{description}</span>
      </span>
    </div>;
}

/** A quiet control for moving between the auth views. */
function ViewLink({
  label,
  onSelect,
  disabled = false
}: {label: string;onSelect: () => void;disabled?: boolean;}) {
  return <button type="button" disabled={disabled} onClick={onSelect} className="account-welcome-view-link disabled:opacity-50 rounded-[6px] text-[13px] font-semibold text-[var(--accent-text)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
      {label}
    </button>;
}
type FormProps = {
  firstFieldRef: React.RefObject<HTMLInputElement>;
  onBusyChange: (value: boolean) => void;
  onDirtyChange: (value: boolean) => void;
  onViewChange: (view: AuthView) => void;
};
function SignInForm(props: FormProps) {
  const { firstFieldRef } = props;
  const auth = useAuth();
  // Preserve an address the person already entered during this auth journey,
  // but never prefill development fixtures into a production sign-in form.
  const [email, setEmail] = useState(auth.rememberedEmail);
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | null;
    password?: string | null;
  }>({});
  const isSubmitting = auth.phase === 'authenticating';
  useFormActivity(isSubmitting, props);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    const nextErrors = {
      email: validateEmail(email),
      password: validateRequiredPassword(password)
    };
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      return;
    }
    // The provider commits the session and closes this sheet on success — the
    // dialog must not close it itself, or the pending destination is treated as
    // a cancellation and dropped.
    await auth.signIn({
      email,
      password
    });
  }
  /* No longer stretched to the sheet's full height — the note that needed
     pinning to the bottom is gone — so the form sits centred in the space
     between the sheet's edges. */
  return <form onSubmit={submit} noValidate className="flex flex-col justify-center gap-4">
      {auth.error && <FormError message={auth.error.message} />}
      <AuthField ref={firstFieldRef} id="auth-signin-email" label="Email" type="email" value={email} autoComplete="email" placeholder="name@example.com" error={fieldErrors.email} disabled={isSubmitting} onChange={(value) => {
      setEmail(value);
      auth.rememberEmail(value);
      setFieldErrors((current) => ({
        ...current,
        email: null
      }));
    }} />
      <AuthField id="auth-signin-password" label="Password" type="password" value={password} autoComplete="current-password" error={fieldErrors.password} disabled={isSubmitting} onChange={(value) => {
      setPassword(value);
      setFieldErrors((current) => ({
        ...current,
        password: null
      }));
    }} />
      <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting}>
        {isSubmitting ? 'Signing in…' : auth.error?.code === 'session_not_ready' ? 'Try signing in again' : 'Sign in'}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewLink disabled={isSubmitting} label="Forgot password?" onSelect={() => props.onViewChange('forgotPassword')} />
        <ViewLink disabled={isSubmitting} label="Create an account" onSelect={() => props.onViewChange('signUp')} />
      </div>
    </form>;
}
function SignUpForm(props: FormProps & AccountAppearanceProps & { step: MobileSignupStep; onStepChange: (step: MobileSignupStep) => void; registrationReturnPath?: string }) {
  const auth = useAuth(), signUp = useSignUp(), { profiles } = useServices();
  const isMobile = usePresentation() === 'mobile';
  const [email, setEmail] = useState(auth.rememberedEmail), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [requestedHandle, setRequestedHandle] = useState<string | null>(null), [editHandle, setEditHandle] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({}), [checking, setChecking] = useState(false);
  const handle = requestedHandle ?? createProfileHandle(name), submitting = useRef(false);
  const id = useRef(crypto.randomUUID());
  useFormActivity(signUp.isLoading || checking, props, Boolean(name || password));
  useEffect(() => { if (signUp.result?.requiresEmailVerification) props.onStepChange('verification'); }, [signUp.result?.requiresEmailVerification, props.onStepChange]);
  if (signUp.result) return <div className={isMobile ? 'mobile-onboarding-form' : 'flex flex-col gap-4'}>
    <FormSuccess title={signUp.result.requiresEmailVerification ? 'Check your email' : 'Finishing setup'} description={signUp.result.requiresEmailVerification ? `Open the confirmation link sent to ${signUp.result.email}. Then make Portalink yours and review the Terms.` : 'Your account is ready.'}/>
    {signUp.result.requiresEmailVerification && <Button variant="secondary" fullWidth onClick={() => props.onViewChange('signIn')}>Back to sign in</Button>}
  </div>;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (submitting.current || signUp.isLoading || checking) return;
    const errors = { email: validateEmail(email), password: validateNewPassword(password), name: validateProfileName(name) };
    setFieldErrors(errors); if (Object.values(errors).some(Boolean)) return;
    submitting.current = true; setChecking(true);
    try {
      const confirmedHandle = await prepareProfileHandle(handle, profiles.checkPublicHandle ?? (() => Promise.resolve('unavailable')));
      if (confirmedHandle !== handle) { setRequestedHandle(confirmedHandle); setFieldErrors({handle: 'That address is already taken. This available address is ready; choose Create account to confirm.'}); return; }
      const intent = auth.peekPendingIntent(), returnPath = readSharedReturnPath(intent?.kind === 'route' ? intent.path : props.registrationReturnPath);
      await signUp.submit(email, password, { version: 1, id: id.current, name: name.trim(), handle: confirmedHandle, location: '', accentColor: props.accentColor, systemGray: props.systemGray, hasAvatar: false, ...(returnPath ? {returnPath} : {}) });
    } catch (error) { setFieldErrors(current => ({...current, handle: error instanceof Error ? error.message : 'Could not check your address.'})); }
    finally { submitting.current = false; setChecking(false); }
  }
  return <form onSubmit={submit} noValidate data-onboarding-step="account" className={isMobile ? 'mobile-onboarding-form' : 'flex flex-col gap-4'}>
    <div className={isMobile ? 'mobile-onboarding-fields' : 'contents'}>
      {signUp.error && <FormError message={signUp.error.message}/>}
      <AuthField compact={isMobile} ref={props.firstFieldRef} id="auth-signup-email" label="Email" type="email" value={email} autoComplete="email" error={fieldErrors.email} disabled={signUp.isLoading || checking} onChange={value => {setEmail(value); auth.rememberEmail(value); setFieldErrors({});}}/>
      <AuthField compact={isMobile} revealPassword id="auth-signup-password" label="Password" type="password" value={password} autoComplete="new-password" hint="At least 8 characters." error={fieldErrors.password} disabled={signUp.isLoading || checking} onChange={value => {setPassword(value); setFieldErrors({});}}/>
      <ProfileField id="auth-signup-name" label="Name" value={name} autoComplete="name" maxLength={NAME_MAX_LENGTH} error={fieldErrors.name} disabled={signUp.isLoading || checking} onChange={value => {setName(value); setFieldErrors({});}}/>
      <p className="text-sm text-[var(--text-secondary)]">portalink…/{handle} · <button type="button" className="underline min-h-11" onClick={() => setEditHandle(value => !value)} disabled={signUp.isLoading || checking}>change</button></p>
      {editHandle && <ProfileField id="auth-signup-handle" label="Handle" value={handle} disabled={signUp.isLoading || checking} onChange={setRequestedHandle}/>}
      {fieldErrors.handle && <p role="alert">{fieldErrors.handle}</p>}
    </div>
    {isMobile ? <MobileOnboardingAction busy={signUp.isLoading || checking}>{checking ? 'Checking your address…' : signUp.isLoading ? 'Creating account…' : 'Create account'}</MobileOnboardingAction> : <Button type="submit" variant="primary" size="lg" fullWidth isLoading={signUp.isLoading || checking}>Create account</Button>}
  </form>;
}
function ForgotPasswordForm(props: FormProps) {
  const { firstFieldRef } = props;
  const auth = useAuth();
  const reset = usePasswordReset();
  useFormActivity(reset.isLoading, props);
  // Arriving here from a failed sign-in should not mean retyping the address.
  const [email, setEmail] = useState(auth.rememberedEmail);
  const [fieldError, setFieldError] = useState<string | null>(null);
  if (reset.result) {
    return <div className="flex flex-col gap-4">
        <FormSuccess title={reset.result.deliveryConfirmed ? 'Check your email' : 'Request received'} description={reset.result.message} />
        {!reset.result.deliveryConfirmed && <Button variant="primary" size="lg" fullWidth onClick={() => props.onViewChange('resetPassword')}>Continue to set a new password</Button>}
        <ViewLink disabled={reset.isLoading} label="Back to sign in" onSelect={() => props.onViewChange('signIn')} />
      </div>;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (reset.isLoading) {
      return;
    }
    const nextError = validateEmail(email);
    setFieldError(nextError);
    if (nextError) {
      return;
    }
    await reset.submit(email);
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
        Enter your account email. We’ll send you a link to reset your password.
      </p>
      {reset.error && <FormError message={reset.error.message} onRetry={() => void reset.retry()} />}
      <AuthField ref={firstFieldRef} id="auth-forgot-email" label="Email" type="email" value={email} autoComplete="email" placeholder="name@example.com" error={fieldError} disabled={reset.isLoading} onChange={(value) => {
      setEmail(value);
      auth.rememberEmail(value);
      setFieldError(null);
    }} />
      <Button type="submit" variant="primary" size="lg" fullWidth isLoading={reset.isLoading}>
        {reset.isLoading ? 'Sending…' : 'Send reset link'}
      </Button>
      <ViewLink disabled={reset.isLoading} label="Back to sign in" onSelect={() => props.onViewChange('signIn')} />
    </form>;
}
function ResetPasswordForm(props: FormProps) {
  const { firstFieldRef } = props;
  const auth = useAuth();
  const update = usePasswordUpdate();
  useFormActivity(update.isLoading, props);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const loadRecovery = update.loadRecovery;
  useEffect(() => {
    // A recovery link establishes this context; without it the form cannot act.
    void loadRecovery();
  }, [loadRecovery, auth.user?.id, auth.session?.isPasswordRecovery]);
  if (update.isComplete) {
    return <div className="flex flex-col gap-4">
        <FormSuccess title="Password updated" description="Your new password is saved." />
        <Button variant="primary" size="lg" fullWidth disabled={update.isLoading} onClick={() => auth.isAuthenticated ? auth.closeAuth() : props.onViewChange('signIn')}>{auth.isAuthenticated ? 'Continue' : 'Back to sign in'}</Button>
      </div>;
  }
  // Resolving the recovery context is itself a request, so it gets its own state
  // rather than presenting an empty form that cannot yet act.
  const isCheckingRecovery = update.recoveryStatus === 'idle' || update.recoveryStatus === 'loading';
  const isRecoveryMissing = update.recoveryStatus === 'success' && update.recovery === null
    || update.error?.code === 'recovery_session_invalid';
  if (isCheckingRecovery) {
    return <div role="status" className="flex items-center gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
        <InterfaceIcon icon={Loader2Icon} weight="medium" className="animate-spin motion-reduce:animate-none" />
        Checking your recovery link…
      </div>;
  }
  if (update.recoveryStatus === 'error') {
    return <div className="flex flex-col gap-4">
      <FormError message={update.error?.message ?? 'Your recovery link could not be checked.'} onRetry={() => void update.loadRecovery()} />
      <ViewLink disabled={update.isLoading} label="Request a new reset link" onSelect={() => props.onViewChange('forgotPassword')} />
    </div>;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (update.isLoading) {
      return;
    }
    const nextErrors = {
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation)
    };
    setFieldErrors(nextErrors);
    if (nextErrors.password || nextErrors.confirmation) {
      return;
    }
    await update.submit(password);
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {isRecoveryMissing && !update.error && <FormError message="This recovery link is invalid or has expired." />}
      {update.error && <FormError message={update.error.message} onRetry={() => void update.retry()} />}
      {update.recovery && <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Setting a new password for <span className="font-semibold text-[var(--text-primary)]">{update.recovery.email}</span>.
        </p>}
      <AuthField ref={firstFieldRef} id="auth-reset-password" label="New password" type="password" value={password} autoComplete="new-password" hint="At least 8 characters." error={fieldErrors.password} disabled={update.isLoading || isRecoveryMissing} onChange={(value) => {
      setPassword(value);
      setFieldErrors((current) => ({
        ...current,
        password: null
      }));
    }} />
      <AuthField id="auth-reset-confirmation" label="Confirm new password" type="password" value={confirmation} autoComplete="new-password" error={fieldErrors.confirmation} disabled={update.isLoading || isRecoveryMissing} onChange={(value) => {
      setConfirmation(value);
      setFieldErrors((current) => ({
        ...current,
        confirmation: null
      }));
    }} />
      <Button type="submit" variant="primary" size="lg" fullWidth isLoading={update.isLoading} disabled={isRecoveryMissing}>
        {update.isLoading ? 'Updating…' : 'Update password'}
      </Button>
      <ViewLink disabled={update.isLoading} label={isRecoveryMissing ? 'Request a new recovery link' : 'Back to sign in'} onSelect={() => props.onViewChange(isRecoveryMissing ? 'forgotPassword' : 'signIn')} />
    </form>;
}
