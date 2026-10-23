import React, { forwardRef, useState } from 'react';
import { AlertCircleIcon, EyeIcon, EyeOffIcon, MailIcon, LockKeyholeIcon } from 'lucide-react';

/**
 * A labelled auth input. It owns only optional password visibility and knows
 * nothing about services.
 *
 * Every field has a real `<label>` bound by id, an autocomplete token so
 * password managers behave, and an error that is associated by
 * `aria-describedby` and carries an icon — never colour alone.
 */
export type AuthFieldProps = {
  compact?: boolean;
  id: string;
  label: string;
  type: 'email' | 'password';
  value: string;
  autoComplete: string;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  revealPassword?: boolean;
  liveError?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
};
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField({
  compact = false,
  id,
  label,
  type,
  value,
  autoComplete,
  placeholder,
  hint,
  error,
  revealPassword = false,
  liveError = false,
  disabled = false,
  onChange
}, ref) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const canReveal = revealPassword && type === 'password';
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  const input = <input data-ui-shape="field" id={id} ref={ref} type={canReveal && passwordVisible ? 'text' : type} value={value} autoComplete={autoComplete} placeholder={placeholder ?? (compact ? label : undefined)} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} autoCapitalize={canReveal ? 'none' : undefined} autoCorrect={canReveal ? 'off' : undefined} spellCheck={canReveal ? false : undefined} onChange={(event) => onChange(event.target.value)} style={canReveal ? { paddingRight: 52 } : undefined} className={`text-control ${canReveal ? 'h-11' : 'h-10'} w-full px-3 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]`} />;
  const revealControl = canReveal && <button type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-controls={id} aria-describedby={labelId} disabled={disabled} onClick={() => setPasswordVisible(current => !current)} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40">
      {passwordVisible ? <EyeOffIcon size={20} aria-hidden="true" /> : <EyeIcon size={20} aria-hidden="true" />}
    </button>;
  return <div className="flex flex-col gap-1.5">
      <label id={canReveal ? labelId : undefined} htmlFor={id} className={compact ? "sr-only" : "text-[13px] font-semibold text-[var(--text-primary)]"}>{label}</label>
      {compact ? <div className="mobile-onboarding-input">
        {type === 'email' ? <MailIcon size={22} aria-hidden="true" /> : <LockKeyholeIcon size={22} aria-hidden="true" />}
        {input}
        {revealControl}
      </div> : canReveal ? <div className="relative">{input}{revealControl}</div> : input}
      {hint && <p id={hintId} className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{hint}</p>}
      {(error || liveError) && <p id={errorId} aria-live={liveError ? 'polite' : undefined} aria-atomic={liveError ? true : undefined} className={error ? "flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]" : 'sr-only'}>
          {error && <AlertCircleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {error}
        </p>}
    </div>;
});
