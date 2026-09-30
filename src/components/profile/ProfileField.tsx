import React, { forwardRef } from 'react';
import { AlertCircleIcon } from 'lucide-react';

/**
 * A labelled profile input. Presentation only: it owns no state and knows
 * nothing about services.
 *
 * Every field has a real `<label>` bound by id, an optional autocomplete token,
 * and an error associated by `aria-describedby` that carries an icon — never
 * colour alone. `status` is for asynchronous feedback (e.g. handle
 * availability) and is announced politely.
 */
export type ProfileFieldStatus = {
  tone: 'neutral' | 'positive' | 'negative';
  message: string;
  icon?: React.ReactNode;
};
export type ProfileFieldProps = {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  optional?: boolean;
  /**
   * Marked in words as well as programmatically, so the requirement is never
   * carried by an asterisk or by colour alone.
   */
  required?: boolean;
  requiredIndicator?: 'text' | 'asterisk';
  placeholder?: string;
  inputMode?: 'text' | 'numeric';
  autoComplete?: string;
  prefix?: string;
  hint?: string;
  maxLength?: number;
  error?: string | null;
  status?: ProfileFieldStatus | null;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
};
export const ProfileField = forwardRef<HTMLInputElement, ProfileFieldProps>(function ProfileField({
  id,
  label,
  value,
  multiline = false,
  optional = false,
  required = false,
  requiredIndicator = 'text',
  placeholder,
  inputMode,
  autoComplete,
  prefix,
  hint,
  maxLength,
  error,
  status,
  disabled = false,
  onChange,
  onBlur
}, ref) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;
  const describedBy = [error ? errorId : null, status ? statusId : null, hint ? hintId : null].filter(Boolean).join(' ');
  const fieldClass = `w-full bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]`;
  // `input-shell` moves the focus ring onto the container: the ring belongs to
  // the whole field the viewer sees, not to the bare text box inside it.
  const shellClass = 'input-shell text-control-shell flex items-center gap-1 rounded-[8px] px-3';
  return <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[14px] font-medium text-[var(--text-primary)]">
        {label}
        {optional && <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Optional</span>}
        {required && <span className="text-[12px] font-medium text-[var(--text-tertiary)]">{requiredIndicator === 'asterisk' ? <><span aria-hidden="true" className="text-[var(--accent-text)]">*</span><span className="sr-only">Required</span></> : 'Required'}</span>}
      </label>
      {multiline ? <textarea id={id} value={value} rows={3} placeholder={placeholder} maxLength={maxLength} disabled={disabled} required={required || undefined} aria-required={required || undefined} aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={`${shellClass} min-h-[76px] resize-none py-2.5 disabled:opacity-60 ${fieldClass}`} /> : <div className={`${shellClass} h-10`}>
          {prefix && <span aria-hidden="true" className="shrink-0 text-[14px] text-[var(--text-tertiary)]">{prefix}</span>}
          <input id={id} ref={ref} type="text" value={value} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} maxLength={maxLength} disabled={disabled} required={required || undefined} aria-required={required || undefined} aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={fieldClass} />
        </div>}
      {hint && <p id={hintId} className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{hint}</p>}
      {/* Asynchronous feedback always pairs a glyph with its wording. */}
      {status && <p id={statusId} role="status" className={`flex items-center gap-1.5 text-[12px] font-medium leading-relaxed ${status.tone === 'negative' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {status.icon}
          {status.message}
        </p>}
      {error && <p id={errorId} className="flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]">
          <AlertCircleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>}
    </div>;
});
