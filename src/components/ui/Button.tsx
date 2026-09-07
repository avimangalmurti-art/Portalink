import React from 'react';
import { Loader2Icon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { InterfaceIcon } from './InterfaceIcon';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonProps = {
  children: React.ReactNode;
  /** Set when another surface needs to reference or focus this control. */
  id?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders the loading state and blocks activation. */
  isLoading?: boolean;
  disabled?: boolean;
  /** Leading icon. Pass the component, not an element. */
  icon?: LucideIcon;
  type?: 'button' | 'submit';
  fullWidth?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
};
const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[14px] rounded-[8px] gap-1.5',
  md: 'h-9 px-3 text-[14px] rounded-[8px] gap-2',
  lg: 'h-10 px-3.5 text-[14px] rounded-[10px] gap-2'
};
const variantClass: Record<ButtonVariant, string> = {
  primary: 'ps-btn-primary text-[var(--accent-foreground)] bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]',
  secondary: 'ps-btn-secondary text-[var(--control-text)] border border-[var(--control-border)] bg-[var(--control-rest-surface)] hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] active:bg-[var(--control-pressed-surface)]',
  ghost: 'ps-btn-ghost bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] active:bg-[var(--surface-pressed)]',
  danger: 'ps-btn-danger text-[var(--status-danger-foreground)] bg-[var(--status-danger)] hover:bg-[var(--status-danger-hover)]'
};

/**
 * The single button primitive. Every state a server-backed action needs is a
 * prop, so features own the behaviour and this owns only the presentation.
 */
export function Button({
  children,
  id,
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon: Icon,
  type = 'button',
  fullWidth = false,
  onClick,
  'aria-label': ariaLabel
}: ButtonProps) {
  const isBlocked = disabled || isLoading;
  return <button id={id} type={type} onClick={isBlocked ? undefined : onClick} disabled={isBlocked} aria-busy={isLoading || undefined} aria-label={ariaLabel} className={`ps-btn inline-flex shrink-0 items-center justify-center ${variant === 'primary' || variant === 'danger' ? 'font-medium' : 'font-normal'} transition-[background-color,color,border-color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default disabled:opacity-45 ${sizeClass[size]} ${variantClass[variant]} ${fullWidth ? 'w-full' : ''}`}>
      {isLoading ? <InterfaceIcon icon={Loader2Icon} weight="medium" effect="rotate" effectActive /> : Icon ? <InterfaceIcon icon={Icon} weight="medium" /> : null}
      {children}
    </button>;
}
