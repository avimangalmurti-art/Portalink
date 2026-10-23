import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircleIcon, ChevronRightIcon, ImageIcon, MoveIcon, UploadIcon } from 'lucide-react';
import type { RelativeImageCrop } from '../../types/imageCrop';
import type { PreparedAvatar } from '../../types/profile';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { ProfilePhotoEditor } from './ProfilePhotoEditor';
import { validateAvatarFile } from '../../features/profile/avatarValidation';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ModalPortal } from '../ui/ModalPortal';
import './profilePhotoSettings.css';

export type MobileProfileAvatarEditorProps = {
  appearance?: 'default' | 'settings';
  pending: PreparedAvatar | null;
  error: string | null;
  currentUrl?: string;
  currentInitials?: string;
  disabled?: boolean;
  storageNotice?: string | null;
  onSelect: (file: File | null, crop?: Pick<PreparedAvatar, 'originalSource' | 'crop'>) => boolean | void | Promise<boolean | void>;
  onClear: () => void;
  /** Keep the outer Save action disabled until the photo transaction is closed. */
  onBusyChange: (busy: boolean) => void;
  children?: ReactNode;
};

type PhotoDraft = { source: string | File; crop?: RelativeImageCrop };

/** The profile preview has one transactional photo editor, shared by both presentations. */
export function MobileProfileAvatarEditor({ appearance = 'default', pending, error, currentUrl, currentInitials, disabled = false, storageNotice, onSelect, onClear, onBusyChange, children }: MobileProfileAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<PhotoDraft | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [choices, setChoices] = useState(false);
  const choicesRef = useRef<HTMLElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const mountedRef = useRef(true);
  const callbacks = useRef({ onSelect, onBusyChange });
  callbacks.current = { onSelect, onBusyChange };
  const source = pending?.originalSource ?? pending?.file ?? currentUrl;
  const selectedUrl = pending?.previewUrl ?? currentUrl;
  const locked = disabled || Boolean(draft);
  useModalFocus(appearance === 'settings' && choices, choicesRef, () => setChoices(false), true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; callbacks.current.onBusyChange(false); };
  }, []);

  const open = (next: PhotoDraft) => {
    if (disabled || draftRef.current) return;
    if (next.source instanceof File) {
      const rejection = validateAvatarFile(next.source);
      if (rejection) { setSourceError(rejection); return; }
    }
    setSourceError(null);
    draftRef.current = next;
    setDraft(next);
    callbacks.current.onBusyChange(true);
  };
  const close = () => {
    if (!mountedRef.current) return;
    draftRef.current = null;
    setDraft(null);
    callbacks.current.onBusyChange(false);
  };
  const replace = () => { if (!locked) { setChoices(false); inputRef.current?.click(); } };
  const reposition = () => { if (!locked && source) { setChoices(false); open({ source, crop: pending?.crop }); } };
  const showChoices = () => { if (!locked) setChoices(true); };

  return <div className={`mobile-profile-avatar${appearance === 'settings' ? ' mobile-profile-avatar--settings' : ''}`}>
    <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-label="Choose profile image" disabled={locked} onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      // Replacement is a draft until the user saves the same pan/pinch editor.
      if (file) open({ source: file });
    }} />
    <button type="button" className="mobile-profile-avatar-preview" disabled={locked} aria-label={selectedUrl ? 'Edit profile photo' : 'Choose profile image'} aria-haspopup={appearance === 'settings' ? 'dialog' : undefined} onClick={appearance === 'settings' ? showChoices : () => source ? open({ source, crop: pending?.crop }) : inputRef.current?.click()}>
      {selectedUrl ? <ResponsiveImage src={selectedUrl} alt="Profile picture preview" width={160} height={160} sizes="160px" priority className="h-full w-full object-cover" /> : <span className="mobile-profile-avatar-placeholder" aria-hidden="true">{currentInitials || <ImageIcon size={40} />}</span>}
    </button>
    {appearance === 'settings' ? <>
      <button type="button" className="profile-photo-settings-edit" disabled={locked} onClick={showChoices} aria-haspopup="dialog" aria-expanded={choices}>Edit photo</button>
      {children}
      <section className="profile-settings-section" aria-label="Profile photo actions"><div className="profile-settings-group">
        <button type="button" className="profile-settings-row profile-settings-action" disabled={locked} onClick={replace}><span className="profile-settings-label">Replace photo</span><ChevronRightIcon className="profile-settings-chevron" aria-hidden="true" /></button>
        <button type="button" className="profile-settings-row profile-settings-action" disabled={locked || !source} onClick={reposition}><span className="profile-settings-label">Reposition photo</span><ChevronRightIcon className="profile-settings-chevron" aria-hidden="true" /></button>
      </div></section>
      {sourceError || error ? <p className="profile-settings-error" role="alert"><AlertCircleIcon size={14} aria-hidden="true" />{sourceError ?? error}</p> : null}
      {choices ? <ModalPortal><div className="profile-photo-choices-backdrop" onClick={event => { if (event.target === event.currentTarget) setChoices(false); }}><section ref={choicesRef} className="profile-photo-choices" role="dialog" aria-modal="true" aria-label="Edit photo" tabIndex={-1}>
        <h2>Edit photo</h2>
        <div className="profile-settings-group">
          <button type="button" className="profile-settings-row profile-settings-action" disabled={locked} onClick={replace}><UploadIcon size={20} aria-hidden="true" /><span>Replace photo</span></button>
          <button type="button" className="profile-settings-row profile-settings-action" disabled={locked || !source} onClick={reposition}><MoveIcon size={20} aria-hidden="true" /><span>Reposition photo</span></button>
        </div>
        <button type="button" className="profile-photo-choices-cancel" onClick={() => setChoices(false)}>Cancel</button>
      </section></div></ModalPortal> : null}
    </> : <><div className="mobile-profile-avatar-controls">
      <button type="button" className="mobile-profile-avatar-action" disabled={locked} onClick={() => inputRef.current?.click()}><UploadIcon size={16} aria-hidden="true" /><span>{selectedUrl ? 'Replace' : 'Choose image'}</span></button>
      <button type="button" className="mobile-profile-avatar-action" disabled={locked || !source} onClick={() => { if (source) open({ source, crop: pending?.crop }); }}><MoveIcon size={16} aria-hidden="true" /><span>Reposition</span></button>
      {children ? <div className="mobile-profile-avatar-visibility">{children}</div> : null}
    </div>
    {pending || error || sourceError ? <div className="mobile-profile-avatar-status">
      {pending ? <button type="button" className="mobile-profile-avatar-reset" disabled={locked} onClick={onClear}>Undo photo changes</button> : null}
      {pending && storageNotice ? <p>{storageNotice}</p> : null}
      {pending?.originalSource instanceof File && pending.originalSource.type === 'image/gif' ? <p>Saving this crop creates a still image.</p> : null}
      {sourceError || error ? <p role="alert"><AlertCircleIcon size={14} aria-hidden="true" />{sourceError ?? error}</p> : null}
    </div> : null}</>}
    {draft ? <ProfilePhotoEditor appearance={appearance === 'settings' ? 'settings' : undefined} source={draft.source} initialCrop={draft.crop} onCancel={close} onSave={async ({ blob, crop }) => {
      if (!mountedRef.current || draftRef.current !== draft) return;
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
      const selected = await callbacks.current.onSelect(new File([blob], `profile-picture.${extension}`, { type: blob.type }), { originalSource: draft.source, crop });
      if (selected === false) throw new Error('The photo could not be prepared. Try saving again, or cancel and choose another image.');
      if (mountedRef.current && draftRef.current === draft) close();
    }} /> : null}
  </div>;
}
