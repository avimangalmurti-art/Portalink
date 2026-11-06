import { InterfaceIcon } from '../ui/InterfaceIcon';
import { MESSAGE_REACTION_OPTIONS } from './messageReactionIcons';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CopyIcon } from 'lucide-react';
import type { DirectMessage } from '../../types/messages';
import { messageOptionsPreviewText } from '../../features/messages/sharedContentPreview';
import { useModalFocus } from '../../hooks/useModalFocus';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { ModalPortal } from '../ui/ModalPortal';
import { contextActions } from '../../presentation/mobile/contextActions';
import { positionMessageContext } from './messageContextPosition';
import './mobile-message-actions.css';

type MobileMessageActionsProps = {
  message: DirectMessage;
  isMine: boolean;
  pending: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onRequestUnsend: () => void;
};

export function MobileMessageActions({ message, isMine, pending, anchor, onClose, onReact, onEdit, onRequestUnsend }: MobileMessageActionsProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pressedInside = useRef(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const model = contextActions('message', { signedIn: true }, { title: 'Message options', handlers: {
    editMessage: isMine && !pending ? onEdit : undefined,
    unsend: isMine && !pending ? onRequestUnsend : undefined,
  } });
  const close = () => { flushSync(onClose); };
  const text = messageOptionsPreviewText(message.body, window.location.origin);
  const sourceImage = anchor?.querySelector<HTMLImageElement>('[data-shared-content-preview] img');
  const artwork = sourceImage?.naturalWidth ? sourceImage : null;
  const previewText = text || (!artwork && (!message.body || message.attachments?.length) ? 'Attachment' : '');
  const actions = model.groups.flat();

  useModalFocus(true, dialogRef, onClose, true);
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const bounds = boundsRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !bounds || !dialog) return;
    const viewport = window.visualViewport;
    const update = () => {
      overlay.style.setProperty('--message-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      overlay.style.setProperty('--message-viewport-left', `${viewport?.offsetLeft ?? 0}px`);
      overlay.style.setProperty('--message-viewport-width', `${viewport?.width ?? window.innerWidth}px`);
      overlay.style.setProperty('--message-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      const limits = bounds.getBoundingClientRect();
      const source = anchor?.isConnected ? anchor.getBoundingClientRect() : limits;
      dialog.style.setProperty('--message-anchor-width', `${source.width}px`);
      const { top, leftInset, rightInset } = positionMessageContext({
        anchor: source, bounds: limits, stackHeight: dialog.offsetHeight, previewOffset: previewRef.current?.offsetTop ?? 0, isMine,
      });
      dialog.style.setProperty('--message-context-top', `${top}px`);
      dialog.style.setProperty('--message-context-inset', `${isMine ? rightInset : leftInset}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dialog);
    if (anchor) observer.observe(anchor);
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [anchor, isMine]);

  const copy = async () => {
    try {
      await copyPublicLink(text);
      if (dialogRef.current) close();
    } catch {
      if (dialogRef.current) setCopyFailed(true);
    }
  };

  return <ModalPortal><div ref={overlayRef} data-presentation="mobile" data-message-context="" className="mobile-message-context"
    onPointerDownCapture={event => { pressedInside.current = event.isPrimary && event.button === 0; }}
    onPointerCancelCapture={() => { pressedInside.current = false; }}
    onClickCapture={event => {
      // The release that opened the menu can land on a clamped action.
      if (event.detail > 0 && !pressedInside.current) {
        event.preventDefault();
        event.stopPropagation();
      }
      pressedInside.current = false;
    }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={boundsRef} className="mobile-message-context-bounds">
      <div ref={dialogRef} data-message-context-stack="" data-message-context-side={isMine ? 'outgoing' : 'incoming'} className="mobile-message-context-stack" role="dialog" aria-modal="true" aria-label={model.title} tabIndex={-1}>
        <div data-message-context-reactions="" role="group" aria-label="Message reactions" className="mobile-message-context-reactions">
          {MESSAGE_REACTION_OPTIONS.map(option => {
            const reaction = message.reactions?.find(item => item.emoji === option.value);
            return <button key={option.value} type="button" disabled={pending} aria-label={`${reaction?.isMine ? 'Remove' : 'React with'} ${option.label}`} aria-pressed={reaction?.isMine ?? false} onClick={() => { close(); onReact(option.value); }}>
              <InterfaceIcon icon={option.icon} size="lg" />
              {reaction?.count ? <span aria-hidden="true">{reaction.count}</span> : null}
            </button>;
          })}
        </div>
        {(previewText || artwork) && <div ref={previewRef} data-message-options-preview="" data-artwork-only={artwork && !previewText ? '' : undefined} className="mobile-message-context-bubble">
          {previewText && <p>{previewText}</p>}
          {artwork && <img src={artwork.currentSrc || artwork.src} alt={artwork.alt} referrerPolicy="no-referrer" />}
          {previewText && message.editedAt && <small>Edited</small>}
        </div>}
        {(text.trim() || actions.length > 0) && <div data-message-context-actions="" className="mobile-message-context-actions">
          {text.trim() && <button type="button" onClick={() => void copy()}><InterfaceIcon icon={CopyIcon} />Copy</button>}
          {actions.map(action => <button key={action.id} type="button" data-destructive={action.destructive || undefined} onClick={() => { close(); void action.run(); }}><InterfaceIcon icon={action.icon} />{action.label}</button>)}
          {copyFailed && <p role="status">Could not copy message.</p>}
        </div>}
        <button type="button" className="sr-only focus:not-sr-only" onClick={onClose}>Close options</button>
      </div>
    </div>
  </div></ModalPortal>;
}
