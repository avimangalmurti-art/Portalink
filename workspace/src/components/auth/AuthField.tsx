import React, { forwardRef } from 'react';
import { AlertCircleIcon } from 'lucide-react';

/**
 * A labelled auth input. Presentation only: it owns no state and knows nothing
 * about services.
 *
 * Every field has a real `<label>` bound by id, an autocomplete token so
 * password managers behave, and an error that is associated by
 * `aria-describedby` and carries an icon — never colour alone.
 */
export type AuthFieldProps = {
  id: string;
  label: string;
  type: 'email' | 'password';
  value: string;
  autoComplete: string;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
};
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField({
  id,
  label,
  type,
  value,
  autoComplete,
  placeholder,
  hint,
  error,
  disabled = false,
  onChange
}, ref) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  return <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</label>
      <input id={id} ref={ref} type={type} value={value} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} onChange={(event) => onChange(event.target.value)} className="text-control h-10 w-full px-3 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" />
      {hint && <p id={hintId} className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{hint}</p>}
      {error && <p id={errorId} className="flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]">
          <AlertCircleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>}
    </div>;
});
