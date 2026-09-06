import { useId, useRef } from 'react';
import { XIcon } from 'lucide-react';
import type { MessagingPermission } from '../../types/messages';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';

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
      <div ref={dialogRef} id="message-privacy-settings" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="shape-container flex max-h-[min(640px,90dvh)] w-full max-w-[440px] flex-col overflow-hidden bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl outline-none">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] px-5 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 text-[16px] font-semibold">Message controls</h2>
          <button type="button" onClick={onClose} aria-label="Close message controls" className="side-panel-compact-control shape-compact flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">
          <fieldset aria-describedby={descriptionId} disabled={isSaving}>
            <legend className="text-[15px] font-semibold">Who can send you message requests</legend>
            <p id={descriptionId} className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">People you follow or have accepted can message you directly.</p>
            <div className="mt-4 space-y-1">
              {([
                ['requests', 'Everyone'],
                ['followers', 'Your followers'],
                ['following', 'No one'],
              ] as const).map(([value, label]) => <label key={value} className="shape-compact flex min-h-[var(--sidebar-primary-control)] cursor-pointer items-center justify-between gap-4 px-3 py-3 hover:bg-[var(--surface-hover)] has-[:disabled]:cursor-wait">
                <span className="text-[14px] font-medium">{label}</span>
                <input type="radio" name={groupName} value={value} checked={permission === value} onChange={() => void onChange(value)} className="h-[18px] w-[18px] shrink-0 accent-[var(--accent-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
              </label>)}
            </div>
          </fieldset>
          {permission === 'followers' ? <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-tertiary)]">Only people who follow you can send a request.</p> : null}
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-tertiary)]">This setting doesn’t change existing chats.</p>
          <p className="sr-only" role="status">{isSaving ? 'Saving message controls' : ''}</p>
          {error ? <p role="alert" className="mt-3 text-[13px] text-[var(--status-danger)]">{error}</p> : null}
        </div>
      </div>
    </div>
  </ModalPortal>;
}
