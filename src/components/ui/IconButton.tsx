import React from 'react';
import { Loader2Icon } from 'lucide-react';
import { InterfaceIcon } from './InterfaceIcon';
import type { InterfaceIconSource } from './InterfaceIcon';
import type { ButtonSize, ButtonVariant } from './Button';
export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  /** Required: an icon-only control must still have an accessible name. */
  label: string;
  icon: InterfaceIconSource;
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** Marks the control as the current selection, not merely hovered. */
  isSelected?: boolean;
  isLoading?: boolean;
};

/** Icon-only control with a real accessible name and a visible focus ring. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  label,
  icon: Icon,
  size = 'md',
  variant = 'ghost',
  isSelected,
  isLoading = false,
  disabled = false,
  type = 'button',
  onClick,
  title = label,
  'aria-pressed': ariaPressed,
  'aria-busy': ariaBusy,
  ...props
}, ref) {
  const isBlocked = disabled || isLoading;
  return <button {...props} ref={ref} type={type} onClick={isBlocked ? undefined : onClick} disabled={isBlocked} title={title} aria-label={label} aria-pressed={isSelected ?? ariaPressed} aria-busy={isLoading || ariaBusy} data-ui-control="icon" data-control-size={size} data-control-variant={variant}>
      <InterfaceIcon icon={isLoading ? Loader2Icon : Icon} size={size === 'sm' ? 'md' : 'lg'} weight={isSelected ? 'semibold' : 'regular'} effect={isLoading ? 'rotate' : undefined} effectActive={isLoading} />
    </button>;
});
