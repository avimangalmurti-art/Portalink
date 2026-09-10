import React from 'react';

/** Shared appearance switch; the owning screen supplies the persisted state. */
export function AppearanceSwitch({ label, isOn, onToggle, accent = 'var(--accent-primary)', transition }: {
  label: string;
  isOn: boolean;
  onToggle: () => void;
  accent?: string;
  transition?: string;
}) {
  return <button type="button" role="switch" aria-checked={isOn} aria-label={label} onClick={onToggle} data-system-color=""
    className="appearance-switch relative h-6 w-10 shrink-0 rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    style={{ backgroundColor: isOn ? accent : 'var(--surface-placeholder)', borderColor: isOn ? 'transparent' : 'var(--hairline)', transition }}>
    <span aria-hidden="true" className="appearance-switch-thumb absolute top-1/2 h-[18px] w-[18px] rounded-full"
      style={{ backgroundColor: isOn ? 'var(--accent-foreground)' : 'var(--text-primary)', left: isOn ? 19 : 2, transform: 'translateY(-50%)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: transition === 'none' ? 'none' : undefined }} />
  </button>;
}
