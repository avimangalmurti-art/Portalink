import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircleIcon, CheckCircle2Icon, CheckIcon, Loader2Icon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { AuthView } from '../../contexts/AuthContext';
import { AuthField } from '../../components/auth/AuthField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { InteractionSafePresence } from '../../components/ui/InteractionSafePresence';
import { findNavAccent, isLightSurface, navAccents } from '../../data/navButtonTokens';
import type { AppearanceTheme } from '../../utils/appearancePreferences';
import { usePasswordReset, usePasswordUpdate, useSignUp } from './useAuthFlows';
import { validateEmail, validateNewPassword, validatePasswordConfirmation, validateRequiredPassword } from './validation';

function CompanyWordmark({ title }: { title: string }) {
  return <div className="w-full">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Portalink</p>
      <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h1>
    </div>;
}

type AccentExperienceProps = {
  theme: AppearanceTheme;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

/** The first piece of Portalink a new person gets to make their own. */
function AccentExperience({
  theme,
  accentColor,
  onAccentColorChange,
  disabled = false,
  compact = false
}: AccentExperienceProps) {
  const activeAccent = findNavAccent(accentColor);

  return <fieldset className={compact ? 'w-full' : 'rounded-[11px] bg-[var(--surface-sunken)] px-3 py-3'}>
      <legend className={compact ? 'mb-1.5 text-[12px] font-semibold text-[var(--text-secondary)]' : 'sr-only'}>{compact ? 'Accent colors' : 'Choose your starting accent color'}</legend>
      {!compact && <>
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Make it yours</p>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-secondary)]">Choose a starting color. Portalink changes instantly.</p>
        </>}
      <div role="radiogroup" aria-label="Starting accent color" className={`${compact ? '' : 'mt-2.5'} flex flex-wrap gap-1`}>
        {navAccents.map((option) => {
          const swatch = theme === 'dark' ? option.dark : option.light;
          const isSelected = option.id === activeAccent.id;
          return <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={option.label}
              title={option.label}
              data-keep-color=""
              disabled={disabled}
              onClick={() => onAccentColorChange(swatch)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-45"
            >
              <span
                data-system-color=""
                className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-150 motion-reduce:transition-none"
                style={{
                  backgroundColor: swatch,
                  transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--surface-raised), 0 0 0 3.5px var(--text-primary)'
                    : `inset 0 0 0 1px ${theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)'}`
                }}
              >
                {isSelected && <InterfaceIcon icon={CheckIcon} size="xs" weight="semibold" keepColor style={{ color: isLightSurface(swatch) ? '#1C1C1E' : '#FFFFFF' }} />}
              </span>
            </button>;
        })}
      </div>
    </fieldset>;
}

/**
 * The auth surface: sign in, sign up, forgot password, and reset password.
 *
 * This container owns form state and calls the auth feature hooks; every backend
 * concern lives behind `AuthService`. It renders only while
 * `pendingView` is set, closes on Escape or the backdrop, and returns focus to
 * whatever opened it (handled by the provider).
 */
const titles: Record<AuthView, string> = {
  signIn: 'Sign in',
  signUp: 'Create an account',
  forgotPassword: 'Reset your password',
  resetPassword: 'Set a new password'
};
export function AuthDialog({
  theme,
  accentColor,
  onAccentColorChange
}: AccentExperienceProps) {
  const auth = useAuth();
  const view = auth.pendingView;
  const shouldReduceMotion = useReducedMotion();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!view) {
      return undefined;
    }
    function closeOnEscape(event: KeyboardEvent) {
      // A request in flight cannot be dismissed out from under itself.
      if (event.key === 'Escape' && auth.phase !== 'authenticating') {
        auth.closeAuth();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [view, auth]);
  // A modal dialog keeps focus inside itself: tabbing past either end wraps,
  // rather than landing on the page behind the scrim.
  useEffect(() => {
    if (!view) {
      return undefined;
    }
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !sheetRef.current) {
        return;
      }
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sheetRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [view]);
  useEffect(() => {
    if (view) {
      // Opening a sheet puts the caret in its first field.
      const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [view]);
  return <InteractionSafePresence isPresent={Boolean(view)}>
      {view && <motion.div className={`modal-scrim fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-8 ${view === 'signIn' ? 'auth-signin-experience' : ''}`} initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} transition={{
      duration: shouldReduceMotion ? 0 : 0.18,
      ease: [0.22, 1, 0.36, 1]
    }} onPointerDown={(event) => {
      if (event.target === event.currentTarget && auth.phase !== 'authenticating') {
        auth.closeAuth();
      }
    }}>
          <motion.section ref={sheetRef} role="dialog" aria-modal="true" aria-label={titles[view]} className={`auth-compact flex max-h-full w-full max-w-[560px] flex-col rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-7 text-[var(--text-primary)] shadow-[var(--shadow-modal)] sm:p-8 ${view === 'signIn' ? 'auth-signin-vanta' : ''}`} initial={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.985
      }} animate={{
        opacity: 1,
        scale: 1
      }} exit={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.99
      }} transition={{
        duration: shouldReduceMotion ? 0 : 0.18,
        ease: [0.22, 1, 0.36, 1]
      }}>
            

            {/* The square is sized so no view needs to scroll; the overflow rule
             stays as a safety net for a narrow viewport, where the square
             shrinks with the width. */}
            {/* The sheet takes its height from this content, so nothing needs to
             stretch or scroll. The overflow rule stays as a safety net for a
             short viewport. */}
            <div className="scrollbar-slim flex min-h-0 flex-col overflow-y-auto">
              {view === 'signIn' && <SignInForm firstFieldRef={firstFieldRef} theme={theme} accentColor={accentColor} onAccentColorChange={onAccentColorChange} />}
              {view === 'signUp' && <SignUpForm firstFieldRef={firstFieldRef} theme={theme} accentColor={accentColor} onAccentColorChange={onAccentColorChange} />}
              {view === 'forgotPassword' && <ForgotPasswordForm firstFieldRef={firstFieldRef} />}
              {view === 'resetPassword' && <ResetPasswordForm firstFieldRef={firstFieldRef} />}
            </div>
          </motion.section>
      </motion.div>}
    </InteractionSafePresence>;
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
  onSelect



}: {label: string;onSelect: () => void;}) {
  return <button type="button" onClick={onSelect} className="rounded-[6px] text-[13px] font-semibold text-[var(--accent-text)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
      {label}
    </button>;
}
type FormProps = {
  firstFieldRef: React.RefObject<HTMLInputElement>;
};
function SignInForm({
  firstFieldRef,
  theme,
  accentColor,
  onAccentColorChange
}: FormProps & AccentExperienceProps) {
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
      <CompanyWordmark title="Sign in" />
      {auth.error && <FormError message={auth.error.message} />}
      <AccentExperience compact theme={theme} accentColor={accentColor} onAccentColorChange={onAccentColorChange} disabled={isSubmitting} />
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
        <ViewLink label="Forgot password?" onSelect={() => auth.requestAuth('forgotPassword')} />
        <ViewLink label="Create an account" onSelect={() => auth.requestAuth('signUp')} />
      </div>
    </form>;
}
function SignUpForm({
  firstFieldRef,
  theme,
  accentColor,
  onAccentColorChange
}: FormProps & AccentExperienceProps) {
  const auth = useAuth();
  const signUp = useSignUp();
  const [email, setEmail] = useState(auth.rememberedEmail);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  // Verification is required, so success never means "signed in".
  if (signUp.result) {
    return <div className="flex flex-col gap-4">
        <FormSuccess title="Confirm your email" description={`An account was created for ${signUp.result.email}. It stays inactive until the address is confirmed, so you are not signed in yet.`} />
        <Button variant="secondary" size="lg" fullWidth onClick={() => auth.requestAuth('signIn')}>Back to sign in</Button>
      </div>;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (signUp.isLoading) {
      return;
    }
    const nextErrors = {
      email: validateEmail(email),
      password: validateNewPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation)
    };
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password || nextErrors.confirmation) {
      return;
    }
    await signUp.submit(email, password);
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <CompanyWordmark title="Create an account" />
      {signUp.error && <FormError message={signUp.error.message} onRetry={() => void signUp.retry()} />}
      <AccentExperience theme={theme} accentColor={accentColor} onAccentColorChange={onAccentColorChange} disabled={signUp.isLoading} />
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
      <ViewLink label="Already have an account? Sign in" onSelect={() => auth.requestAuth('signIn')} />
    </form>;
}
function ForgotPasswordForm({
  firstFieldRef
}: FormProps) {
  const auth = useAuth();
  const reset = usePasswordReset();
  // Arriving here from a failed sign-in should not mean retyping the address.
  const [email, setEmail] = useState(auth.rememberedEmail);
  const [fieldError, setFieldError] = useState<string | null>(null);
  if (reset.result) {
    return <div className="flex flex-col gap-4">
        <FormSuccess title={reset.result.deliveryConfirmed ? 'Check your email' : 'Request received'} description={reset.result.message} />
        <Button variant="primary" size="lg" fullWidth onClick={() => auth.requestAuth('resetPassword')}>Continue to set a new password</Button>
        <ViewLink label="Back to sign in" onSelect={() => auth.requestAuth('signIn')} />
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
        Enter the email address on the account to start password recovery.
      </p>
      {reset.error && <FormError message={reset.error.message} onRetry={() => void reset.retry()} />}
      <AuthField ref={firstFieldRef} id="auth-forgot-email" label="Email" type="email" value={email} autoComplete="email" placeholder="name@example.com" error={fieldError} disabled={reset.isLoading} onChange={(value) => {
      setEmail(value);
      auth.rememberEmail(value);
      setFieldError(null);
    }} />
      <Button type="submit" variant="primary" size="lg" fullWidth isLoading={reset.isLoading}>
        {reset.isLoading ? 'Sending…' : 'Send recovery instructions'}
      </Button>
      <ViewLink label="Back to sign in" onSelect={() => auth.requestAuth('signIn')} />
    </form>;
}
function ResetPasswordForm({
  firstFieldRef
}: FormProps) {
  const auth = useAuth();
  const update = usePasswordUpdate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const loadRecovery = update.loadRecovery;
  useEffect(() => {
    // A recovery link establishes this context; without it the form cannot act.
    void loadRecovery();
  }, [loadRecovery]);
  if (update.isComplete) {
    return <div className="flex flex-col gap-4">
        <FormSuccess title="Password updated" description="Your password has been changed. Sign in with it to continue." />
        <Button variant="primary" size="lg" fullWidth onClick={() => auth.requestAuth('signIn')}>Back to sign in</Button>
      </div>;
  }
  // Resolving the recovery context is itself a request, so it gets its own state
  // rather than presenting an empty form that cannot yet act.
  const isCheckingRecovery = update.recoveryStatus === 'idle' || update.recoveryStatus === 'loading';
  const isRecoveryMissing = update.recoveryStatus === 'error' || update.recoveryStatus === 'success' && update.recovery === null;
  if (isCheckingRecovery) {
    return <div role="status" className="flex items-center gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
        <InterfaceIcon icon={Loader2Icon} weight="medium" className="animate-spin motion-reduce:animate-none" />
        Checking your recovery link…
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
      {isRecoveryMissing && <FormError message="This recovery link is invalid or has expired." />}
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
      <ViewLink label={isRecoveryMissing ? 'Request a new recovery link' : 'Back to sign in'} onSelect={() => auth.requestAuth(isRecoveryMissing ? 'forgotPassword' : 'signIn')} />
    </form>;
}
