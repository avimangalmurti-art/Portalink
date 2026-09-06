import React, { useEffect, useId, useRef, useState } from 'react';
import { CreatorAvatar } from './CreatorAvatar';
import { ModalPortal } from '../ui/ModalPortal';
import { ResponsiveImage } from '../ui/ResponsiveImage';

/** The standard 40px profile identity and its full-size image preview. */
export function ProfileAvatar({ name, avatar }: { name: string; avatar?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const thumbnail = <CreatorAvatar name={name} avatar={avatar} shape="squircle" className="h-10 w-10 text-[12px]" />;

  return <>
      <button type="button" onClick={() => setIsOpen(true)} aria-haspopup="dialog" aria-expanded={isOpen} aria-label={`View ${name}'s profile image`} className="shape-squircle-compact flex h-10 w-10 shrink-0 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          {thumbnail}
        </button>
      {isOpen ? <ProfileAvatarPreview name={name} avatar={avatar} onClose={() => setIsOpen(false)} /> : null}
    </>;
}

function ProfileAvatarPreview({ name, avatar, onClose }: { name: string; avatar?: string | null; onClose: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [avatar]);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        dialogRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return <ModalPortal><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-description="Press Escape or click to close." data-avatar-preview-scrim="" className="modal-scrim fixed inset-0 z-[90] flex cursor-pointer items-center justify-center overflow-y-auto p-6 outline-none" onClick={onClose}>
      <figure data-avatar-preview="" className="m-0 flex max-w-full flex-col items-center" style={{ maxHeight: 'calc(100dvh - 48px)' }}>
        <div className="squircle relative overflow-hidden bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(0,0,0,0.32)]" style={{ width: 'clamp(260px, 64vw, 420px)', height: 'clamp(260px, 64vw, 420px)' }}>
          {avatar && !imageFailed ? <ResponsiveImage src={avatar} alt={`${name} profile image`} onError={() => setImageFailed(true)} priority width={840} height={840} sizes="(min-width: 800px) 420px, 64vw" className="block h-full w-full object-cover" /> : <CreatorAvatar name={name} shape="squircle" className="h-full w-full text-[160px]" />}
        </div>
        <figcaption id={titleId} className="mt-4 break-words px-2 pb-1 text-center font-sans text-large font-medium leading-tight tracking-[-0.02em] text-[var(--text-primary)]" style={{ maxWidth: 'min(84vw, 520px)' }}>{name}</figcaption>
      </figure>
    </div></ModalPortal>;
}
