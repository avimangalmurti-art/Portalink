import { TextFormattingToolbar } from '../text/TextFormattingToolbar';
import React, { forwardRef, useRef } from 'react';
import { AlertCircleIcon, XIcon } from 'lucide-react';

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
  formatting?: boolean;
  optional?: boolean;
  /**
   * Marked in words as well as programmatically, so the requirement is never
   * carried by an asterisk or by colour alone.
   */
  required?: boolean;
  requiredIndicator?: 'text' | 'asterisk' | 'parenthesized';
  workspace?: boolean;
  clearable?: boolean;
  leadingIcon?: React.ReactNode;
  optionalParentheses?: boolean;
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
  formatting = false,
  optional = false,
  required = false,
  requiredIndicator = 'text',
  workspace = false, clearable = false, leadingIcon, optionalParentheses = false,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;
  const describedBy = [error ? errorId : null, status ? statusId : null, hint ? hintId : null].filter(Boolean).join(' ');
  const fieldClass = `w-full bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]`;
  // `input-shell` moves the focus ring onto the container: the ring belongs to
  // the whole field the viewer sees, not to the bare text box inside it.
  const shellClass = 'input-shell text-control-shell flex items-center gap-1 rounded-[8px] px-3';
  const invalid = Boolean(error || status?.tone === 'negative');
  return <div data-field-workspace={workspace || undefined} data-multiline={multiline || undefined} data-field-status={status?.tone} className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[14px] font-medium text-[var(--text-primary)]">
        {label}
        {optional && <span className="text-[12px] font-medium text-[var(--text-tertiary)]">{optionalParentheses ? '(Optional)' : 'Optional'}</span>}
        {required && <span className={`text-[12px] font-medium ${requiredIndicator === 'parenthesized' ? 'text-[var(--status-danger)]' : 'text-[var(--text-tertiary)]'}`}>
          {requiredIndicator === 'asterisk' ? <><span aria-hidden="true" className="text-[var(--accent-text)]">*</span><span className="sr-only">Required</span></>
            : requiredIndicator === 'parenthesized' ? '(Required)' : 'Required'}
        </span>}
      </label>
      <div className={workspace && multiline ? "details-editor" : "contents"}>
      {multiline && formatting && <TextFormattingToolbar inputRef={textareaRef} value={value} onChange={onChange} disabled={disabled} maxLength={maxLength} variant={workspace ? "workspace" : "panel"} />}
      {multiline ? <textarea data-ui-shape={workspace ? undefined : 'composer'} ref={textareaRef} id={id} value={value} rows={3} placeholder={placeholder} maxLength={maxLength} disabled={disabled} required={required || undefined} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy || undefined} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={`${shellClass} min-h-[76px] resize-none py-2.5 disabled:opacity-60 ${fieldClass}`} /> : <div data-ui-shape="field" className={`${shellClass} h-10`}>
          {leadingIcon}
          {prefix && <span aria-hidden="true" className="shrink-0 text-[14px] text-[var(--text-tertiary)]">{prefix}</span>}
          <input id={id} ref={ref} type="text" value={value} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} maxLength={maxLength} disabled={disabled} required={required || undefined} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy || undefined} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={fieldClass} />
          {clearable && value && <button type="button" aria-label={`Clear ${label.toLowerCase()}`} disabled={disabled} onClick={() => onChange('')}><XIcon size={18} aria-hidden="true" /></button>}
        </div>}
      {workspace && multiline && <output className="details-character-count" aria-label="Description character count">{value.length}{maxLength ? `/${maxLength}` : ''}</output>}
      </div>
      {hint && <p id={hintId} className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{hint}</p>}
      {/* Asynchronous feedback always pairs a glyph with its wording. */}
      {status && <p id={statusId} role="status" className={`flex items-center gap-1.5 text-[12px] font-medium leading-relaxed ${status.tone === 'negative' ? 'text-[var(--status-danger)]' : status.tone === 'positive' ? 'text-[var(--status-success)]' : 'text-[var(--text-secondary)]'}`}>
          {status.icon}
          {status.message}
        </p>}
      {error && <p id={errorId} className="flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]">
          <AlertCircleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>}
    </div>;
});
