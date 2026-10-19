import React, { useRef, useState } from 'react';
import { FileIcon, ListFilterIcon, PlusIcon } from 'lucide-react';
import { CoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { MediaPicker } from '../../components/publishing/MediaPicker';
import { MobileActionSheet } from '../../components/messages/MobileActionSheet';
import { canBeCover } from './assetTypes';
import type { MediaPreparation } from './useMediaPreparation';
import type { MediaUpload } from './useMediaUpload';
import { usePresentation } from '../../presentation/usePresentation';

/** Cover authoring stays in the draft; file management is a separate disclosure. */
export function MobileCoverFiles({ media, upload, disabled }: { media: MediaPreparation; upload: MediaUpload; disabled: boolean }) {
  const mobile = usePresentation() === 'mobile';
  const input = useRef<HTMLInputElement>(null);
  const [reordering, setReordering] = useState(false);
  const locked = disabled || upload.phase === 'uploaded';
  const cover = media.items.find(item => item.isCover);
  return <div className="mobile-cover-files">
    <input ref={input} type="file" multiple hidden disabled={locked || media.isFull} aria-label="Add project files" onChange={event => {
      if (event.target.files?.length) void media.select(event.target.files);
      event.target.value = '';
    }} />
    {cover ? <CoverFilmstrip media={media} disabled={locked} focused cropInstructions={mobile ? 'Drag to reposition. Use the slider to zoom.' : undefined} /> : <button type="button" className="mobile-cover-empty" disabled={locked} onClick={() => input.current?.click()} aria-label="Choose an image"><PlusIcon size={32} aria-hidden="true" /></button>}
    <section className="mobile-selected-files" data-mobile-selected-files={mobile || undefined} aria-label="Selected files">
      <div className="mobile-selected-summary"><span>Selected files</span><strong>{media.items.length} {media.items.length === 1 ? 'file' : 'files'} selected</strong>
        <div className="mobile-selected-thumbnails" role={mobile ? 'group' : undefined} aria-label={mobile ? 'Choose a cover from selected files' : undefined}>{(mobile ? media.items : media.items.slice(0, 4)).map(item => <button key={item.id} type="button" aria-label={`Use ${item.displayTitle} as cover`} aria-pressed={item.isCover} disabled={locked || !canBeCover(item.family, item.capability)} onClick={() => media.setCover(item.id)}>
          {item.family === 'image' && item.previewUrl ? <img src={item.previewUrl} alt="" /> : <FileIcon aria-hidden="true" size={20} />}
        </button>)}</div>
      </div>
      <div className="mobile-selected-actions"><button type="button" disabled={locked || media.items.length === 0} onClick={() => setReordering(true)}><ListFilterIcon size={18} aria-hidden="true" />Reorder</button><button type="button" disabled={locked || media.isFull} onClick={() => input.current?.click()}><PlusIcon size={18} aria-hidden="true" />Add</button></div>
    </section>
    {media.error && <p role="alert" className="mobile-cover-error">{media.error}</p>}
    {reordering && <MobileActionSheet layout={mobile ? 'files' : undefined} model={{ title: 'Reorder', primary: [], groups: [] }} onClose={() => setReordering(false)} onAction={() => undefined}>{mobile ? <div className="mobile-reorder-files"><p className="mobile-reorder-summary">{media.items.length} {media.items.length === 1 ? 'file' : 'files'} selected</p><MediaPicker media={media} upload={upload} disabled={locked} compact expanded mobileFileManager /></div> : <MediaPicker media={media} upload={upload} disabled={locked} compact expanded />}</MobileActionSheet>}
  </div>;
}
