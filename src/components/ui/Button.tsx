import React from 'react';
import { Loader2Icon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { InterfaceIcon } from './InterfaceIcon';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders the loading state and blocks activation. */
  isLoading?: boolean;
  /** Leading icon. Pass the component, not an element. */
  icon?: LucideIcon;
  fullWidth?: boolean;
};

/**
 * The single button primitive. Every state a server-backed action needs is a
 * prop, so features own the behaviour and this owns only the presentation.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  children,
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon: Icon,
  type = 'button',
  fullWidth = false,
  onClick,
  className = '',
  'aria-busy': ariaBusy,
  ...props
}, ref) {
  const isBlocked = disabled || isLoading;
  return <button {...props} ref={ref} type={type} onClick={isBlocked ? undefined : onClick} disabled={isBlocked} aria-busy={isLoading || ariaBusy} data-ui-control="button" data-control-size={size} data-control-variant={variant} className={`ps-btn ps-btn-${variant} ${fullWidth ? 'w-full' : ''} ${className}`}>
      {isLoading ? <InterfaceIcon icon={Loader2Icon} weight="medium" effect="rotate" effectActive /> : Icon ? <InterfaceIcon icon={Icon} weight="medium" /> : null}
      {children}
    </button>;
});
