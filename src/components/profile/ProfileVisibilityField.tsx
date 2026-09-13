import React from 'react';

type ProfileVisibilityFieldProps = {
  id: string;
  isPrivate: boolean;
  disabled?: boolean;
  onChange: (isPrivate: boolean) => void;
};

export function ProfileVisibilityField({ id, isPrivate, disabled, onChange }: ProfileVisibilityFieldProps) {
  return <fieldset disabled={disabled} aria-describedby={`${id}-hint`} className="min-w-0">
    <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Profile visibility</legend>
    <div className="grid grid-cols-2 gap-2">
      {[{ label: 'Public', value: false }, { label: 'Private', value: true }].map(option => <label key={option.label}
        className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[12px] border px-3 py-2 text-sm font-semibold transition-colors ${disabled ? 'cursor-default opacity-50' : ''} ${isPrivate === option.value ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'border-[var(--hairline-strong)] bg-[var(--surface-sunken)] text-[var(--text-primary)]'}`}>
        <input type="radio" name={id} value={option.label.toLowerCase()} checked={isPrivate === option.value} onChange={() => onChange(option.value)}
          className="h-[18px] w-[18px] shrink-0 accent-[var(--accent-primary)] focus-visible:outline-offset-2" />
        {option.label}
      </label>)}
    </div>
    <p id={`${id}-hint`} className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
      {isPrivate ? 'You approve new follow requests.' : 'Anyone can view your profile.'} You can change this later.
    </p>
  </fieldset>;
}
