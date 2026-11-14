import React from 'react';

/** Shared appearance switch; the owning screen supplies the persisted state. */
export function AppearanceSwitch({ id, label, showLabel = false, isOn, onToggle, accent = 'var(--accent-primary)', transition }: {
  id?: string;
  label: string;
  showLabel?: boolean;
  isOn: boolean;
  onToggle: () => void;
  accent?: string;
  transition?: string;
}) {
  return <button id={id} type="button" role="switch" aria-checked={isOn} aria-label={label} onClick={onToggle} data-system-color=""
    className={`appearance-switch relative flex h-11 shrink-0 items-center rounded-full border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${showLabel ? 'justify-between gap-2 ps-2 pe-0.5' : 'w-11 justify-center'}`}>
    {showLabel && <span aria-hidden="true" className="whitespace-nowrap text-sm font-medium text-[var(--text-primary)]">{label}</span>}
    <span aria-hidden="true" data-system-color="" className="appearance-switch-track relative block h-6 w-10 shrink-0 rounded-full border"
      style={{ backgroundColor: isOn ? accent : 'var(--surface-placeholder)', borderColor: isOn ? 'transparent' : 'var(--hairline)', transition }}>
    <span aria-hidden="true" className="appearance-switch-thumb absolute top-1/2 h-[18px] w-[18px] rounded-full"
      style={{ backgroundColor: isOn ? 'var(--accent-foreground)' : 'var(--text-primary)', left: isOn ? 19 : 2, transform: 'translateY(-50%)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: transition === 'none' ? 'none' : undefined }} />
    </span>
  </button>;
}
