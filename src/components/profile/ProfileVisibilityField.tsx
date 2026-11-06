import React, { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

type ProfileVisibilityFieldProps = {
  id: string;
  isPrivate: boolean;
  disabled?: boolean;
  collapsible?: boolean;
  onChange: (isPrivate: boolean) => void;
};

export function ProfileVisibilityField({ id, isPrivate, disabled, collapsible = false, onChange }: ProfileVisibilityFieldProps) {
  const [expanded, setExpanded] = useState(false);
  const showDetails = !collapsible || expanded;
  return <fieldset disabled={disabled} aria-describedby={showDetails ? `${id}-hint` : undefined} className="min-w-0">
    <legend className="mb-2 w-full text-sm font-semibold text-[var(--text-primary)]">
      <span className="flex items-center justify-between">
        {collapsible ? 'Account type' : 'Profile visibility'}
        {collapsible && <button type="button" data-ui-shape="icon" disabled={disabled} aria-label={expanded ? 'Hide account-type details' : 'Show account-type details'} aria-expanded={expanded} aria-controls={`${id}-hint`} onClick={() => setExpanded(value => !value)} className="-my-2 flex h-11 w-11 items-center justify-center rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
          <ChevronDownIcon aria-hidden="true" className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} />
        </button>}
      </span>
    </legend>
    <div className="grid grid-cols-2 gap-2">
      {[{ label: 'Public', value: false }, { label: 'Private', value: true }].map(option => <label key={option.label} data-ui-shape={collapsible ? "row" : undefined}
        className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[12px] border px-3 py-2 text-sm font-semibold transition-colors ${collapsible ? 'justify-center focus-within:outline focus-within:outline-2 focus-within:outline-[var(--focus-ring)]' : ''} ${disabled ? 'cursor-default opacity-50' : ''} ${isPrivate === option.value ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'border-[var(--hairline-strong)] bg-[var(--surface-sunken)] text-[var(--text-primary)]'}`}>
        <input type="radio" name={id} value={option.label.toLowerCase()} checked={isPrivate === option.value} onChange={() => onChange(option.value)}
          className={collapsible ? 'sr-only' : 'h-[18px] w-[18px] shrink-0 accent-[var(--accent-primary)] focus-visible:outline-offset-2'} />
        {option.label}
      </label>)}
    </div>
    {showDetails && <p id={`${id}-hint`} className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
      {isPrivate ? 'Only you and approved followers can view your projects and portals.' : 'Anyone can view your profile, projects and portals.'} You can change this later.
      {' '}Your name and avatar remain visible in existing conversations and follow requests. Changing visibility does not remove messages or copies someone already saved.
    </p>}
  </fieldset>;
}
