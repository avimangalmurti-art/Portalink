import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { AuthView } from '../../contexts/AuthContext';
import { AuthField } from '../../components/auth/AuthField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { AvatarPicker } from '../../components/profile/AvatarPicker';
import { ProfileField } from '../../components/profile/ProfileField';
import { useAvatarSelection } from '../profile/useProfileOnboarding';
import { validateProfileName, validateLocation, NAME_MAX_LENGTH, LOCATION_MAX_LENGTH } from '../profile/validation';
import { AccountWelcomeSurface, type AccountAppearanceProps } from '../../components/auth/AccountWelcomeSurface';
import { usePasswordReset, usePasswordUpdate, useSignUp } from './useAuthFlows';
import { validateEmail, validateNewPassword, validatePasswordConfirmation, validateRequiredPassword } from './validation';
import { usePresentation } from '../../presentation/usePresentation';

const titles: Record<AuthView, string> = {
  signIn: 'Sign in', signUp: 'Create your account',
  forgotPassword: 'Reset your password', resetPassword: 'Set a new password',
};

export function AuthDialog(props: AccountAppearanceProps) {
  const auth = useAuth();
  const isMobile = usePresentation() === 'mobile';
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  if (!auth.pendingView) return null;
  const formProps = { firstFieldRef, onBusyChange: setBusy, onDirtyChange: setDirty };
  return <AccountWelcomeSurface {...props} showAppearance={!isMobile || (auth.pendingView !== 'forgotPassword' && auth.pendingView !== 'resetPassword')} title={titles[auth.pendingView]} busy={busy || auth.phase === 'authenticating'} dirty={dirty} onDismiss={auth.closeAuth}>
    {requestLeave => <>{auth.pendingView === 'signIn' && <SignInForm {...formProps} onViewChange={view => requestLeave(() => auth.requestAuth(view))} />}
    {auth.pendingView === 'signUp' && <SignUpForm {...formProps} onViewChange={view => requestLeave(() => auth.requestAuth(view))} accentColor={props.accentColor} />}
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
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewLink disabled={isSubmitting} label="Forgot password?" onSelect={() => props.onViewChange('forgotPassword')} />
        <ViewLink disabled={isSubmitting} label="Create an account" onSelect={() => props.onViewChange('signUp')} />
      </div>
    </form>;
}
function SignUpForm(props: FormProps & { accentColor: string }) {
  const { firstFieldRef } = props;
  const auth = useAuth();
  const signUp = useSignUp();
  const avatar = useAvatarSelection();
  const registrationId = useRef(crypto.randomUUID());
  const submittingRef = useRef(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState(auth.rememberedEmail);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  useFormActivity(signUp.isLoading, props, !signUp.result && Boolean(name || location || avatar.avatar || password));

  // Confirmation and an immediate session are distinct provider outcomes.
  if (signUp.result) {
    return <div className="flex flex-col gap-4">
        <FormSuccess title={signUp.result.requiresEmailVerification ? "Check your email" : "Finishing setup"} description={signUp.result.requiresEmailVerification ? `Open the confirmation link sent to ${signUp.result.email} to finish creating your account and profile.` : "Your account is ready. We’re finishing your profile."} />
        {signUp.result.requiresEmailVerification && <Button variant="secondary" size="lg" fullWidth onClick={() => props.onViewChange('signIn')}>Back to sign in</Button>}
      </div>;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (signUp.isLoading || submittingRef.current) {
      return;
    }
    const nextErrors = {
      name: validateProfileName(name),
      location: validateLocation(location),
      email: validateEmail(email),
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation)
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || avatar.error) {
      return;
    }
    submittingRef.current = true;
    try {
      await signUp.submit(email, password, { version: 1, id: registrationId.current,
        name: name.trim(), location: location.trim(), accentColor: props.accentColor, hasAvatar: Boolean(avatar.avatar) }, avatar.avatar);
    } finally { submittingRef.current = false; }
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {signUp.error && <FormError message={signUp.error.message} />}
      <AvatarPicker presentation="featured" labelId="registration-avatar" pending={avatar.avatar} error={avatar.error} disabled={signUp.isLoading} onSelect={avatar.select} onClear={avatar.clear} />
      <ProfileField id="auth-signup-name" label="Profile name" value={name} autoComplete="name" placeholder="Your name" maxLength={NAME_MAX_LENGTH} error={fieldErrors.name} disabled={signUp.isLoading} onChange={value => { setName(value); setFieldErrors(current => ({ ...current, name: null })); }} />
      <ProfileField id="auth-signup-location" label="Where are you from?" optional value={location} autoComplete="address-level2" placeholder="City" maxLength={LOCATION_MAX_LENGTH} error={fieldErrors.location} disabled={signUp.isLoading} onChange={value => { setLocation(value); setFieldErrors(current => ({ ...current, location: null })); }} />
      <AuthField ref={firstFieldRef} id="auth-signup-email" label="Email" type="email" value={email} autoComplete="email" placeholder="name@example.com" error={fieldErrors.email} disabled={signUp.isLoading} onChange={(value) => {
      setEmail(value);
      auth.rememberEmail(value);
      setFieldErrors((current) => ({
        ...current,
        email: null
      }));
    }} />
      <AuthField id="auth-signup-password" label="Password" type="password" value={password} autoComplete="new-password" hint="At least 8 characters." error={fieldErrors.password} disabled={signUp.isLoading} onChange={(value) => {
      setPassword(value);
      setFieldErrors((current) => ({
        ...current,
        password: null
      }));
    }} />
      <AuthField id="auth-signup-confirmation" label="Confirm password" type="password" value={confirmation} autoComplete="new-password" error={fieldErrors.confirmation} disabled={signUp.isLoading} onChange={(value) => {
      setConfirmation(value);
      setFieldErrors((current) => ({
        ...current,
        confirmation: null
      }));
    }} />
      <Button type="submit" variant="primary" size="lg" fullWidth isLoading={signUp.isLoading}>
        {signUp.isLoading ? 'Creating account…' : 'Create account'}
      </Button>
      <ViewLink disabled={signUp.isLoading} label="Already have an account? Sign in" onSelect={() => props.onViewChange('signIn')} />
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
