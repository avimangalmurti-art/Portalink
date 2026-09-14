import React from 'react';
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import { Button } from './Button';
import { InterfaceIcon } from './InterfaceIcon';

/**
 * The shared empty / loading / error views.
 *
 * Every feature that reads from a service should render one of these rather than
 * inventing its own copy and markup, so the states stay consistent once real
 * requests can fail.
 */

export function EmptyState({
  title,
  description,
  action







}: {title: string;description?: string;action?: {label: string;onClick: () => void;};}) {
  return <div className="flex min-h-[200px] flex-col items-center justify-center px-6 py-8 text-center">
      <p className="type-title-2 font-medium text-[var(--text-primary)]">{title}</p>
      {description && <p className="type-body mt-1 max-w-[46ch] text-[var(--text-secondary)]">{description}</p>}
      {action && <div className="mt-3">
          <Button variant="secondary" onClick={action.onClick}>{action.label}</Button>
        </div>}
    </div>;
}

/** Announced politely, so a slow request is not silent for screen readers. */
export function LoadingState({
  label = 'Loading'


}: {label?: string;}) {
  return <div role="status" aria-live="polite" className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <InterfaceIcon icon={Loader2Icon} effect="rotate" effectActive className="text-[var(--text-tertiary)]" />
      <p className="type-body text-[var(--text-secondary)]">{label}</p>
    </div>;
}

/** Failure is never colour-only: it carries an icon, a message, and a way out. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry




}: {title?: string;description?: string;onRetry?: () => void;}) {
  return <div role="alert" className="flex min-h-[200px] flex-col items-center justify-center rounded-[12px] border border-[var(--hairline-strong)] px-6 py-8 text-center">
      <InterfaceIcon icon={AlertTriangleIcon} renderingMode="hierarchical" className="text-[var(--text-secondary)]" />
      <p className="type-title-2 mt-2 font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="type-body mt-1 max-w-[46ch] text-[var(--text-secondary)]">{description}</p>}
      {onRetry && <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>Try again</Button>
        </div>}
    </div>;
}

/** Inline counterpart for actions inside a toolbar or row. */
export function InlineStatus({
  status,
  message,
  onRetry




}: {status: 'idle' | 'loading' | 'success' | 'error';message?: string;onRetry?: () => void;}) {
  if (status === 'idle') {
    return null;
  }
  return <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[12px]">
      {status === 'loading' && <InterfaceIcon icon={Loader2Icon} size="xs" effect="rotate" effectActive className="text-[var(--text-tertiary)]" />}
      <span className={status === 'error' ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
        {message ?? (status === 'loading' ? 'Working…' : status === 'success' ? 'Done' : 'Failed')}
      </span>
      {status === 'error' && onRetry && <button type="button" onClick={onRetry} className="font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          Retry
        </button>}
    </span>;
}
