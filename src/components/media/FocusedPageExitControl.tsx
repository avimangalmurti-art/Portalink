import React from 'react';
import { XIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

/**
 * The focused page owns the same 8px control gutter as the navigation headers.
 * Keeping this independent of the artwork's centered content prevents the exit
 * action from drifting toward the middle of pages with large internal margins.
 */
export function FocusedPageExitControl({
  onExit,
  label = 'Exit single-page view'
}: {
  onExit: () => void;
  label?: string;
}) {
  return <button
    type="button"
    onClick={onExit}
    aria-label={label}
    className="premium-viewer-exit-control absolute left-2 top-2 z-50 flex h-8 w-8 items-center justify-center rounded-full text-white"
  >
      <InterfaceIcon icon={XIcon} size="lg" weight="medium" />
    </button>;
}
