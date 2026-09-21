import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import React from 'react';
import { AlertCircleIcon, ArrowLeftIcon } from 'lucide-react';
import { PortalIconLibrary } from './PortalIconLibrary';
import { InterfaceIcon } from '../ui/InterfaceIcon';
type IconPickerPageProps = {
  categoryLabel: string;
  currentIconName: string;
  /** True while the chosen icon is being written, so a second save cannot race it. */
  isSaving?: boolean;
  /** The icon the write is in flight for, so only that tile reports progress. */
  savingIconName?: string | null;
  /** Set when the store refused the change; the picker stays open to say so. */
  failureMessage?: string | null;
  onRetry?: () => void;
  onDismissFailure?: () => void;
  onSelect: (iconName: string) => void;
  onBack: () => void;
};

// Deliberately neutral: the icon is the only thing being chosen here, so
// semantic surfaces and labels adapt without introducing competing colour.
export function IconPickerPage({
  categoryLabel,
  currentIconName,
  isSaving = false,
  savingIconName = null,
  failureMessage = null,
  onRetry,
  onDismissFailure,
  onSelect,
  onBack
}: IconPickerPageProps) {
  return <div className="min-h-full w-full bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <header className="ps-panel-toolbar global-control-header side-panel-content-inset">
        <ScreenBack action={onBack}><button type="button" onClick={onBack} className="side-panel-primary-control side-panel-control-row px-3 text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
          Back
        </button></ScreenBack>
        <span className="min-w-0">
          <h1 className="truncate text-large font-bold tracking-tight text-[var(--text-primary)]">Change icon</h1>
          <p className="truncate text-small text-[var(--text-secondary)]">{categoryLabel}</p>
        </span>
      </header>

      <div className="px-[var(--content-gutter)] py-6">

      {/* A rejected icon is reported here rather than only in the sidebar, and the
         picker stays open, so the choice that failed is still on screen to retry. */}
      {failureMessage && <div role="alert" className="mt-4 flex flex-col gap-1.5 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-small leading-relaxed text-[var(--text-primary)]">
          <span className="flex items-start gap-2">
            <InterfaceIcon icon={AlertCircleIcon} weight="medium" className="mt-0.5 text-[var(--status-danger)]" />
            <span className="min-w-0 flex-1">{failureMessage}</span>
          </span>
          <span className="flex items-center gap-3 pl-6">
            {onRetry && <button type="button" onClick={onRetry} className="font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>}
            {onDismissFailure && <button type="button" onClick={onDismissFailure} className="text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Dismiss</button>}
          </span>
        </div>}

      <PortalIconLibrary selected={currentIconName} onSelect={onSelect} disabled={isSaving} pendingName={savingIconName} />
      </div>
    </div>;
}
