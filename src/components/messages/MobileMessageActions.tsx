import { useId, useRef } from 'react';
import { PencilIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import type { DirectMessage } from '../../types/messages';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';

type MobileMessageActionsProps = {
  message: DirectMessage;
  isMine: boolean;
  pending: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onRequestUnsend: () => void;
};

/** A visible, touch-sized entry to the existing message actions. */
export function MobileMessageActions({ message, isMine, pending, onClose, onReact, onEdit, onRequestUnsend }: MobileMessageActionsProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewportRef = useDialogViewport();
  const titleId = useId();
  useModalFocus(true, dialogRef, onClose, true);
  const emojis = [...new Set(['❤', '👏', '✨', ...(message.reactions ?? []).map((reaction) => reaction.emoji)])];
  const actionClass = 'shape-compact flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left text-[15px] font-medium hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50';

  return <ModalPortal>
    <div ref={viewportRef} role="presentation" className="modal-scrim fixed inset-x-0 z-50 flex items-end justify-center overflow-hidden bg-black/40" style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex max-h-full w-full max-w-[480px] flex-col rounded-t-[22px] border border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl outline-none" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <header className="flex shrink-0 items-center gap-3 px-4 pt-3">
          <h2 id={titleId} className="min-w-0 flex-1 text-[16px] font-semibold">Message options</h2>
          <button type="button" aria-label="Close message options" onClick={onClose} className="shape-compact flex h-11 w-11 shrink-0 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-y-contain px-4 pb-1">
          <p className="mb-3 line-clamp-3 break-words text-[14px] leading-5 text-[var(--text-secondary)]">{message.body || 'Attachment'}</p>
          <div role="group" aria-label="Message reactions" className="mb-2 flex flex-wrap gap-2">
            {emojis.map((emoji) => {
              const reaction = message.reactions?.find((item) => item.emoji === emoji);
              return <button key={emoji} type="button" aria-label={`${reaction?.isMine ? 'Remove reaction' : 'React'} ${emoji}`} aria-pressed={reaction?.isMine ?? false} disabled={pending} onClick={() => onReact(emoji)} className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-3 text-[20px] ring-1 ring-[var(--hairline)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] aria-pressed:bg-[var(--accent-soft)] disabled:opacity-50">{emoji}{reaction ? <span className="text-[12px]">{reaction.count}</span> : null}</button>;
            })}
          </div>
          {isMine ? <>
            <button type="button" disabled={pending} onClick={onEdit} className={actionClass}><InterfaceIcon icon={PencilIcon} />Edit message</button>
            <button type="button" disabled={pending} onClick={onRequestUnsend} data-keep-color="" className={`${actionClass} text-[var(--status-danger)]`}><InterfaceIcon icon={Trash2Icon} />Unsend message</button>
          </> : null}
        </div>
      </div>
    </div>
  </ModalPortal>;
}
