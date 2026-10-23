import { useId, useRef } from 'react';
import { XIcon } from 'lucide-react';
import type { MessagingPermission } from '../../types/messages';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { BlockedPeopleSection } from './BlockedPeopleSection';

type MessageControlsDialogProps = {
  permission: MessagingPermission;
  isSaving: boolean;
  error: string | null;
  onChange: (permission: MessagingPermission) => Promise<boolean>;
  onClose: () => void;
};

export function MessageControlsDialog({ permission, isSaving, error, onChange, onClose }: MessageControlsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const groupName = useId();
  useModalFocus(true, dialogRef, onClose);

  return <ModalPortal>
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={dialogRef} id="message-privacy-settings" data-ui-shape="popup" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="shape-container flex max-h-[min(640px,90dvh)] w-full max-w-[440px] flex-col overflow-hidden bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl outline-none">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] px-5 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 text-[16px] font-semibold">Message settings</h2>
          <button data-ui-shape="icon" data-control-size="sm" type="button" onClick={onClose} aria-label="Close message settings" className="side-panel-compact-control shape-compact flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">
          <fieldset aria-describedby={descriptionId} disabled={isSaving}>
            <legend className="text-[15px] font-semibold">Who can send you a message request?</legend>
            <p id={descriptionId} className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">A request is a first message from someone you don’t follow. You decide whether to accept it.</p>
            <div className="mt-4 space-y-1">
              {([
                ['requests', 'Everyone', 'Allow requests from anyone.'],
                ['followers', 'People who follow you', 'Only your followers can send requests.'],
                ['following', 'No one', 'Turn off message requests.'],
              ] as const).map(([value, label, description]) => <label data-ui-shape="row" key={value} className="shape-compact flex min-h-[var(--sidebar-primary-control)] cursor-pointer items-center justify-between gap-4 px-3 py-3 hover:bg-[var(--surface-hover)] has-[:disabled]:cursor-wait">
                <span className="min-w-0"><span className="block text-[14px] font-medium">{label}</span><span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-secondary)]">{description}</span></span>
                <input type="radio" name={groupName} value={value} checked={permission === value} onChange={() => void onChange(value)} className="h-[18px] w-[18px] shrink-0 accent-[var(--accent-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
              </label>)}
            </div>
          </fieldset>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-tertiary)]">People you follow and people you already chat with can still send you messages.</p>
          <p className="sr-only" role="status">{isSaving ? 'Saving message settings' : ''}</p>
          {error ? <p role="alert" className="mt-3 text-[13px] text-[var(--status-danger)]">{error}</p> : null}
          <BlockedPeopleSection />
        </div>
      </div>
    </div>
  </ModalPortal>;
}
