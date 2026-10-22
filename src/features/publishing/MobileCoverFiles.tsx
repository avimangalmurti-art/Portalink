import React, { useRef, useState } from 'react';
import { ArrowUpDownIcon, FileIcon, PlusIcon } from 'lucide-react';
import { CoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { MediaPicker } from '../../components/publishing/MediaPicker';
import { MobileActionSheet } from '../../components/messages/MobileActionSheet';
import { canBeCover } from './assetTypes';
import type { MediaPreparation } from './useMediaPreparation';
import type { MediaUpload } from './useMediaUpload';
import { usePresentation } from '../../presentation/usePresentation';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import './onboarding-files-cover.css';

/** Cover authoring stays in the draft; file management is a separate disclosure. */
export function MobileCoverFiles({ media, upload, disabled, onboarding = false }: { media: MediaPreparation; upload: MediaUpload; disabled: boolean; onboarding?: boolean }) {
  const mobile = usePresentation() === 'mobile';
  const fullSelection = mobile || onboarding;
  const input = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [reordering, setReordering] = useState(false);
  const locked = disabled || upload.phase === 'uploaded';
  const cover = media.items.find(item => item.isCover && canBeCover(item.family, item.capability));
  const needsDocumentCover = !cover && media.items.some(item => item.family === 'document' && !canBeCover(item.family, item.capability));
  return <div className="mobile-cover-files" data-onboarding-files-cover={onboarding || undefined} data-files-empty={(onboarding && media.items.length === 0) || undefined}>
    <input ref={input} type="file" multiple hidden disabled={locked || media.isFull} aria-label={onboarding ? 'Add idea files' : 'Add project files'} onChange={event => {
      if (!locked && !media.isFull && event.target.files?.length) void media.select(event.target.files);
      event.target.value = '';
    }} />
    {onboarding && needsDocumentCover && <input ref={coverInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.svg" hidden disabled={locked || media.isFull} aria-label="Add PDF or image cover" onChange={event => {
      if (!locked && !media.isFull && event.target.files?.length) void media.select(event.target.files);
      event.target.value = '';
    }} />}
    {onboarding && media.items.length > 0 && <div className="onboarding-files-brand"><img src="/onboarding/portals.webp" alt="" width="1254" height="1254" draggable={false}/><p>{needsDocumentCover ? 'Add a PDF or image for your cover.' : 'Choose your cover.'}</p></div>}
    {cover ? <CoverFilmstrip media={media} disabled={locked} focused onboardingControls={onboarding} cropInstructions={mobile ? 'Drag to reposition. Use the slider to zoom.' : undefined} /> : onboarding ? media.items.length === 0 ? <section className="onboarding-files-empty" aria-labelledby="onboarding-files-title">
      <div className="onboarding-files-art" aria-hidden="true"><img src="/onboarding/portals.webp" alt="" width="1254" height="1254" draggable={false}/></div>
      <h3 id="onboarding-files-title">Bring your idea to life</h3>
      <p>Add files. Choose a cover.</p>
      <button type="button" className="onboarding-files-choose" data-ui-control="button" data-control-size="lg" data-control-variant="primary" disabled={locked || media.isFull} onClick={() => input.current?.click()}><InterfaceIcon icon={PlusIcon} weight="medium"/>Choose files</button>
    </section> : <button type="button" className="onboarding-files-add-cover" data-ui-control="button" data-control-size="lg" data-control-variant="secondary" disabled={locked || media.isFull} onClick={() => (needsDocumentCover ? coverInput : input).current?.click()}><InterfaceIcon icon={PlusIcon} weight="medium"/>{needsDocumentCover ? 'Add PDF or image cover' : 'Add a cover file'}</button> : <button type="button" className="mobile-cover-empty" disabled={locked || (mobile && media.isFull)} onClick={() => input.current?.click()} aria-label={mobile ? media.items.length ? 'Add a cover image' : 'Choose project files' : 'Choose an image'}><PlusIcon size={32} aria-hidden="true" />{mobile && <span className="mobile-cover-empty-copy"><strong>{media.items.length ? 'Add a cover image' : 'Choose files'}</strong><span>{media.items.length ? 'Add an image to use as your project cover.' : 'Images, documents, video and more. Choose a cover next.'}</span></span>}</button>}
    {(!fullSelection || media.items.length > 0) && <section className="mobile-selected-files" data-mobile-selected-files={fullSelection || undefined} aria-label="Selected files">
      <div className="mobile-selected-summary"><span>Selected files</span><strong>{media.items.length} {media.items.length === 1 ? 'file' : 'files'} selected</strong>
        <div className="mobile-selected-thumbnails" role={fullSelection ? 'group' : undefined} aria-label={fullSelection ? 'Choose a cover from selected files' : undefined}>{(fullSelection ? media.items : media.items.slice(0, 4)).map(item => <button key={item.id} type="button" aria-label={`Use ${item.displayTitle} as cover`} aria-pressed={item.isCover && canBeCover(item.family, item.capability)} disabled={locked || !canBeCover(item.family, item.capability)} onClick={() => media.setCover(item.id)}>
          {item.family === 'image' && item.previewUrl ? <img src={item.previewUrl} alt="" /> : <FileIcon aria-hidden="true" size={20} />}
        </button>)}</div>
      </div>
      <div className="mobile-selected-actions"><button type="button" data-ui-control={onboarding ? 'button' : undefined} data-control-size={onboarding ? 'lg' : undefined} data-control-variant={onboarding ? 'secondary' : undefined} disabled={locked || media.items.length === 0} onClick={() => setReordering(true)}>{onboarding ? <InterfaceIcon icon={ArrowUpDownIcon} weight="medium"/> : <ArrowUpDownIcon size={18} aria-hidden="true" />}Reorder</button><button type="button" data-ui-control={onboarding ? 'button' : undefined} data-control-size={onboarding ? 'lg' : undefined} data-control-variant={onboarding ? 'secondary' : undefined} disabled={locked || media.isFull} onClick={() => input.current?.click()}>{onboarding ? <InterfaceIcon icon={PlusIcon} weight="medium"/> : <PlusIcon size={18} aria-hidden="true" />}Add</button></div>
    </section>}
    {media.error && <p role="alert" className="mobile-cover-error">{media.error}</p>}
    {reordering && <MobileActionSheet onboardingFiles={onboarding} layout={mobile || onboarding ? 'files' : undefined} model={{ title: 'Reorder', primary: [], groups: [] }} onClose={() => setReordering(false)} onAction={() => undefined}>{mobile ? <div className="mobile-reorder-files"><p className="mobile-reorder-summary">{media.items.length} {media.items.length === 1 ? 'file' : 'files'} selected</p><MediaPicker media={media} upload={upload} disabled={locked} compact expanded mobileFileManager onboardingFiles={onboarding}/></div> : <MediaPicker media={media} upload={upload} disabled={locked} compact expanded onboardingFiles={onboarding}/>}</MobileActionSheet>}
  </div>;
}
