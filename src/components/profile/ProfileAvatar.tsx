import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { CreatorAvatar } from './CreatorAvatar';
import { ModalPortal } from '../ui/ModalPortal';
import { ResponsiveImage, type ImagePriority } from '../ui/ResponsiveImage';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { usePresentation } from '../../presentation/usePresentation';
import { containModalFocus } from '../../hooks/useModalFocus';

/** Compact identities share a preview with the larger profile-page avatar. */
export function ProfileAvatar({ name, avatar, videoSrc, size = 'compact', priority = false, inlinePreview = false, previewHost }: { name: string; avatar?: string | null; videoSrc?: string; size?: 'compact' | 'profile'; priority?: ImagePriority; inlinePreview?: boolean; previewHost?: React.RefObject<HTMLElement> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const reducedMotion = useReducedMotion();
  const paused = autoplayBlocked || Boolean(reducedMotion);
  useEffect(() => { setVideoFailed(false); setAutoplayBlocked(false); }, [videoSrc]);
  const failVideo = useCallback(() => setVideoFailed(true), []);
  const blockedVideo = useCallback(() => setAutoplayBlocked(true), []);
  const activeVideo = videoFailed ? undefined : videoSrc;
  const thumbnail = activeVideo ? <span aria-hidden="true" className="squircle block h-full w-full overflow-hidden">
    <AvatarLoop src={activeVideo} poster={avatar} paused={paused} onError={failVideo} onBlocked={blockedVideo} />
  </span> : <CreatorAvatar name={name} avatar={avatar} priority={priority} shape="squircle" className={`h-full w-full ${size === 'profile' ? 'text-[24px]' : 'text-[12px]'}`} />;

  return <>
      <button type="button" onClick={() => setIsOpen(true)} aria-haspopup="dialog" aria-expanded={isOpen} aria-label={`View ${name}'s profile ${activeVideo ? 'video' : 'image'}`} className={`${size === 'profile' ? 'profile-identity-avatar shape-squircle' : 'h-10 w-10 shape-squircle-compact'} flex shrink-0 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}>
          {thumbnail}
        </button>
      {isOpen ? <ProfileAvatarPreview name={name} avatar={avatar} videoSrc={activeVideo} paused={paused} onVideoError={failVideo} onVideoBlocked={blockedVideo} inlinePreview={inlinePreview} previewHost={previewHost} onClose={() => setIsOpen(false)} /> : null}
    </>;
}

function AvatarLoop({ src, poster, paused, onError, onBlocked }: { src: string; poster?: string | null; paused: boolean; onError: () => void; onBlocked: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    if (paused) { video.pause(); return; }
    let active = true;
    void video.play()?.catch(() => { if (active) onBlocked(); });
    return () => { active = false; video.pause(); };
  }, [src, paused, onBlocked]);
  return <video ref={ref} src={src} poster={poster || undefined} autoPlay={!paused} loop muted playsInline preload="auto" aria-hidden="true" onError={onError} className="block h-full w-full object-contain" style={{ background: '#fff' }} />;
}

function ProfileAvatarPreview({ name, avatar, videoSrc, paused, onVideoError, onVideoBlocked, onClose, inlinePreview, previewHost }: { name: string; avatar?: string | null; videoSrc?: string; paused: boolean; onVideoError: () => void; onVideoBlocked: () => void; onClose: () => void; inlinePreview: boolean; previewHost?: React.RefObject<HTMLElement> }) {
  const presentation = usePresentation();
  const captionStyle = presentation === 'mobile' && !inlinePreview ? 'font-[700] text-white' : 'font-medium text-[var(--text-primary)]';
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [avatar]);
  const titleId = useId();
  const dialogRef = useDialogViewport<HTMLDivElement>(presentation === 'mobile');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if ((inlinePreview || videoSrc) && dialogRef.current) return containModalFocus(dialogRef.current, () => closeRef.current(), true);
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
  }, [dialogRef, inlinePreview, videoSrc]);

  const preview = <>{presentation === 'mobile' && <div data-avatar-preview-backdrop="" data-presentation="mobile" aria-hidden="true" className="modal-scrim" />}<div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-description="Press Escape or click to close." data-avatar-preview-scrim="" data-presentation={presentation} className="modal-scrim fixed inset-0 z-[90] flex cursor-pointer items-center justify-center overflow-y-auto p-6 outline-none" onClick={onClose}>
      <figure data-avatar-preview="" className="m-0 flex max-w-full flex-col items-center" style={{ maxHeight: 'calc(100dvh - 48px)' }}>
        <div data-avatar-preview-image="" className="squircle relative overflow-hidden bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(0,0,0,0.32)]" style={{ width: 'clamp(260px, 64vw, 420px)', height: 'clamp(260px, 64vw, 420px)' }}>
          {videoSrc ? <AvatarLoop src={videoSrc} poster={avatar} paused={paused} onError={onVideoError} onBlocked={onVideoBlocked} /> : avatar && !imageFailed ? <ResponsiveImage src={avatar} alt={`${name} profile image`} onError={() => setImageFailed(true)} priority width={840} height={840} sizes="(min-width: 800px) 420px, 64vw" className="block h-full w-full object-cover" /> : <CreatorAvatar name={name} shape="squircle" className="h-full w-full text-[160px]" />}
        </div>
        <figcaption id={titleId} className={`mt-4 break-words px-2 pb-1 text-center font-sans text-large leading-tight tracking-[-0.02em] ${captionStyle}`} style={{ maxWidth: 'min(84vw, 520px)' }}>{name}</figcaption>
      </figure>
    </div></>;
  // A welcome card can create a containing block through its glass material.
  // Keep that preview in the themed welcome root, above every card and control.
  if (inlinePreview && previewHost?.current) return createPortal(preview, previewHost.current);
  return inlinePreview ? preview : <ModalPortal>{preview}</ModalPortal>;
}
