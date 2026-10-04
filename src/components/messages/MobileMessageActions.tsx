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
  const emojis = [...new Set(['❤', '👏', '✨', ...(message.reactions ?? []).map(reaction => reaction.emoji)])].slice(0, 5);
  const model = contextActions('message', { signedIn: true }, { title: 'Message options', handlers: {
    react: !pending ? () => onReact('❤') : undefined,
    editMessage: isMine && !pending ? onEdit : undefined,
    unsend: isMine && !pending ? onRequestUnsend : undefined,
  } });
  const close = () => { flushSync(onClose); };
  return <MobileActionSheet model={model} onClose={close} onAction={action => { close(); action.run(); }}>
    <time dateTime={message.createdAt} className="mb-2 block text-xs text-[var(--text-tertiary)]">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}{message.editedAt ? ' · Edited' : ''}</time>
    <p className="mb-3 line-clamp-3 break-words text-sm text-[var(--text-secondary)]">{message.body || 'Attachment'}</p>
    {!pending && <div role="group" aria-label="Message reactions" className="mb-3 flex flex-wrap gap-2">{emojis.map(emoji => {
      const reaction = message.reactions?.find(item => item.emoji === emoji);
      return <button key={emoji} type="button" aria-label={`${reaction?.isMine ? 'Remove reaction' : 'React'} ${emoji}`} aria-pressed={reaction?.isMine ?? false} onClick={() => { close(); onReact(emoji); }} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[var(--surface-sunken)] px-3 text-xl">{emoji}</button>;
    })}</div>}
  </MobileActionSheet>;
}
