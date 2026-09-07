import React from 'react';
import { InterfaceIcon } from './InterfaceIcon';
import type { InterfaceIconSource } from './InterfaceIcon';
export type IconButtonProps = {
  /** Required: an icon-only control must still have an accessible name. */
  label: string;
  icon: InterfaceIconSource;
  size?: 'sm' | 'md';
  /** Marks the control as the current selection, not merely hovered. */
  isSelected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  'aria-haspopup'?: boolean;
  'aria-expanded'?: boolean;
};

/** Icon-only control with a real accessible name and a visible focus ring. */
export function IconButton({
  label,
  icon: Icon,
  size = 'md',
  isSelected = false,
  disabled = false,
  onClick,
  'aria-haspopup': hasPopup,
  'aria-expanded': isExpanded
}: IconButtonProps) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-[8px]' : 'h-9 w-9 rounded-[8px]';
  return <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={isSelected || undefined} aria-haspopup={hasPopup} aria-expanded={isExpanded} className={`inline-flex shrink-0 items-center justify-center transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default disabled:opacity-45 ${box} ${isSelected ? 'bg-[var(--control-selected-surface)] text-[var(--control-selected-text)] hover:bg-[var(--control-pressed-surface)]' : 'text-[var(--text-secondary)] hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] active:bg-[var(--control-pressed-surface)]'}`}>
      <InterfaceIcon icon={Icon} size={size === 'sm' ? 'md' : 'lg'} weight={isSelected ? 'semibold' : 'regular'} />
    </button>;
}
