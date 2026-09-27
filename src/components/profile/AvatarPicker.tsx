import React, { useRef, useState } from 'react';
import { AlertCircleIcon, CameraIcon, ImageIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import type { PreparedAvatar } from '../../types/profile';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { imageDimensionsLabel, imageResolutionNotice } from '../../utils/imageMetadata';
import { ImageRepositionDialog } from '../media/ImageRepositionDialog';

/**
 * Choose → validate → preview → replace → remove. Presentation only.
 *
 * NOTHING IS UPLOADED. `pending` is a locally previewed file; `currentUrl` is
 * whatever the profile actually carries today. The two are labelled separately
 * so a chosen file is never mistaken for a saved one.
 */
export type AvatarPickerProps = {
  pending: PreparedAvatar | null;
  error: string | null;
  currentUrl?: string;
  currentInitials?: string;
  disabled?: boolean;
  labelId?: string;
  label?: string;
  presentation?: 'compact' | 'featured' | 'onboarding';
  /**
   * What the media transport says will happen to the chosen file. Rendered
   * verbatim rather than paraphrased, so this component never asserts a storage
   * outcome of its own.
   */
  storageNotice?: string | null;
  onSelect: (file: File | null, crop?: Pick<PreparedAvatar, 'originalSource' | 'crop'>) => void;
  onClear: () => void;
};
export function AvatarPicker({
  pending,
  error,
  currentUrl,
  currentInitials,
  disabled = false,
  labelId = 'avatar-picker-label',
  label = 'Profile picture',
  presentation = 'compact',
  storageNotice = null,
  onSelect,
  onClear
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [repositioning, setRepositioning] = useState(false);
  const source = pending?.originalSource ?? pending?.file ?? currentUrl;
  const dimensions = pending?.widthPixels && pending.heightPixels ? {
    widthPixels: pending.widthPixels,
    heightPixels: pending.heightPixels
  } : null;
  const resolutionNotice = imageResolutionNotice(dimensions, 'avatar');
  const featured = presentation !== 'compact';
  const selectedUrl = pending?.previewUrl ?? currentUrl;
  return <div className={`flex flex-col gap-2 ${featured ? 'items-center py-1' : ''}`}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-label={featured ? 'Choose profile image' : label} disabled={disabled} onChange={(event) => {
        onSelect(event.target.files?.[0] ?? null);
        event.target.value = '';
      }} />
      {featured ? <>
        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 rounded-[16px] p-1 text-[14px] font-medium text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-45" aria-label={selectedUrl ? 'Replace profile image' : 'Choose profile image'}>
          <span className={`flex h-[clamp(104px,21dvh,144px)] w-[clamp(104px,21dvh,144px)] items-center justify-center overflow-hidden rounded-[22px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ${presentation === 'onboarding' ? 'border border-[var(--hairline-strong)]' : ''}`}>
            {selectedUrl ? <ResponsiveImage src={selectedUrl} alt="Selected profile image" width={144} height={144} sizes="144px" priority className="h-full w-full object-cover" /> : presentation === 'onboarding' ? <CameraIcon className="h-10 w-10" aria-hidden="true" /> : <ImageIcon className="h-10 w-10" aria-hidden="true" />}
          </span>
          <span id={labelId} className={presentation === 'onboarding' && !selectedUrl ? 'sr-only' : undefined}>{selectedUrl ? 'Change profile image' : 'Choose profile image'}</span>
        </button>
        {source && <div className="flex flex-wrap justify-center gap-2">
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setRepositioning(true)}>Reposition</Button>
          {pending && <Button variant="ghost" size="sm" disabled={disabled} onClick={onClear}>Remove</Button>}
        </div>}
      </> : <>
      <span id={labelId} className="flex items-baseline gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
        {label}
        <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Optional</span>
      </span>
      <div className="flex items-center gap-3">
        {pending ? <ResponsiveImage src={pending.previewUrl} alt={`Preview of the selected replacement picture, ${pending.fileName}`} width={40} height={40} sizes="40px" priority className="shape-compact h-10 w-10 shrink-0 object-cover" /> : currentUrl ? <ResponsiveImage src={currentUrl} alt="Your current profile picture" width={40} height={40} sizes="40px" priority className="shape-compact h-10 w-10 shrink-0 object-cover" /> : <span aria-hidden="true" className="shape-compact flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--surface-sunken)] text-[13px] font-semibold text-[var(--text-tertiary)]">
            {currentInitials || <ImageIcon className="h-5 w-5" />}
          </span>}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
            {pending || currentUrl ? 'Replace' : 'Choose image'}
          </Button>
          {source ? <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setRepositioning(true)}>Reposition</Button> : null}
          {pending && <Button variant="ghost" size="sm" disabled={disabled} onClick={onClear}>Remove</Button>}
        </div>
      </div>
      </>}
      {pending && !featured && <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {pending.fileName} · {(pending.sizeBytes / 1024).toFixed(0)} KB
          {imageDimensionsLabel(dimensions) ? ` · ${imageDimensionsLabel(dimensions)}` : ''}
          {storageNotice ? <> · previewed on this device. {storageNotice}</> : null}
        </p>}
      {pending && featured && storageNotice && <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{storageNotice}</p>}
      {resolutionNotice && <p role="status" className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{resolutionNotice}</p>}
      {error && <p role="alert" className="flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]">
          <AlertCircleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>}
      {repositioning && source ? <ImageRepositionDialog title="Reposition profile picture" source={source} alt="Profile picture" shape="square" initialCrop={pending?.crop} outputWidth={512} mimeType="image/webp" onClose={() => setRepositioning(false)} onSave={({ blob, crop }) => {
        const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
        const file = new File([blob], `profile-picture.${extension}`, { type: blob.type });
        onSelect(file, { originalSource: source, crop });
        setRepositioning(false);
      }} /> : null}
    </div>;
}
