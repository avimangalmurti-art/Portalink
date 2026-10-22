import { InterfaceIcon } from '../ui/InterfaceIcon';
import { MESSAGE_REACTION_OPTIONS } from './messageReactionIcons';
import React from 'react';
import { flushSync } from 'react-dom';
import type { DirectMessage } from '../../types/messages';
import { MobileActionSheet } from './MobileActionSheet';
import { contextActions } from '../../presentation/mobile/contextActions';
type MobileMessageActionsProps = {
  message: DirectMessage;
  isMine: boolean;
  pending: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onRequestUnsend: () => void;
};

export function MobileMessageActions({ message, isMine, pending, onClose, onReact, onEdit, onRequestUnsend }: MobileMessageActionsProps) {
  const model = contextActions('message', { signedIn: true }, { title: 'Message options', handlers: {
    editMessage: isMine && !pending ? onEdit : undefined,
    unsend: isMine && !pending ? onRequestUnsend : undefined,
  } });
  const close = () => { flushSync(onClose); };
  return <MobileActionSheet model={model} onClose={close} onAction={action => { close(); action.run(); }} beforeActions={<>
    <div data-message-options-preview="" className="mb-4 rounded-[16px] border border-[var(--hairline)] bg-[var(--surface-sunken)] p-4">
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--text-primary)]">{message.body || 'Attachment'}</p>
      <time dateTime={message.createdAt} className="mt-2 block text-xs text-[var(--text-tertiary)]">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}{message.editedAt ? ' · Edited' : ''}</time>
    </div>
    <div role="group" aria-label="Message reactions" className="mb-4 grid grid-cols-3 gap-2">{MESSAGE_REACTION_OPTIONS.map(option => {
      const reaction = message.reactions?.find(item => item.emoji === option.value);
      return <button data-ui-shape="row" key={option.value} type="button" disabled={pending} aria-label={`${reaction?.isMine ? 'Remove' : 'React with'} ${option.label}`} aria-pressed={reaction?.isMine ?? false} onClick={() => { close(); onReact(option.value); }} className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-2 rounded-[16px] border border-[var(--hairline)] bg-[var(--surface-sunken)] px-2 py-2 text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] aria-pressed:border-[var(--accent-primary)] aria-pressed:text-[var(--accent-text)] disabled:opacity-50"><InterfaceIcon icon={option.icon} size="lg" /><span className="text-xs font-medium">{option.label}{reaction?.count ? ` · ${reaction.count}` : ''}</span></button>;
    })}</div>
  </>} />;
}
