import { useCallback, useEffect, useRef, useState } from 'react';
import { MobileProfileAvatarEditor } from '../../components/profile/MobileProfileAvatarEditor';
import { ProfileLocationPicker } from '../../components/profile/ProfileLocationPicker';
import type { PreparedAvatar } from '../../types/profile';
import { useAvatarSelection } from './useProfileOnboarding';
import { deriveInitials, NAME_MAX_LENGTH, validateLocation, validateProfileName } from './validation';

export type ProfilePersonalDetailsValue = { name: string; location: string; avatar: PreparedAvatar | null };
export type ProfilePersonalDetailsProps = ProfilePersonalDetailsValue & {
  currentUrl?: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onValidityChange: (valid: boolean) => void;
  onDone: (details: ProfilePersonalDetailsValue) => boolean | void;
};

/** A child-local transaction: Back discards it; Done lets the parent adopt it. */
export function ProfilePersonalDetails({ name, location, avatar, currentUrl, disabled, onBusyChange, onDirtyChange, onValidityChange, onDone }: ProfilePersonalDetailsProps) {
  const [initial] = useState(() => ({ name, location }));
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState({ name: false, location: false });
  const [failure, setFailure] = useState<string | null>(null);
  const scratch = useAvatarSelection();
  const photoBusy = useRef(false);
  const submitted = useRef(false);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const pending = scratch.avatar ?? avatar;
  const nameError = validateProfileName(draft.name);
  const locationError = validateLocation(draft.location);
  const valid = !nameError && !locationError;
  const dirty = draft.name !== initial.name || draft.location !== initial.location || scratch.avatar !== null;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onValidityChange(valid); }, [valid, onValidityChange]);
  const reportBusy = useCallback((busy: boolean) => {
    photoBusy.current = busy;
    busyCallback.current(busy);
  }, []);
  const update = (key: 'name' | 'location', value: string) => {
    setFailure(null);
    setTouched(current => ({ ...current, [key]: true }));
    setDraft(current => ({ ...current, [key]: value }));
  };

  return <form id="profile-personal-form" className="profile-settings-content profile-personal-details" noValidate onSubmit={event => {
    event.preventDefault();
    if (!mounted.current || submitted.current || disabled || photoBusy.current) return;
    if (!valid) { setTouched({ name: true, location: true }); return; }
    submitted.current = true;
    setFailure(null);
    try {
      // The parent adopts a selected File before this scratch preview is released.
      if (onDone({ name: draft.name.trim(), location: draft.location.trim(), avatar: scratch.avatar }) === false) {
        submitted.current = false;
        setFailure('Your changes could not be prepared. Try again.');
      }
    } catch (caught) {
      submitted.current = false;
      setFailure(caught instanceof Error ? caught.message : 'Your changes could not be prepared. Try again.');
    }
  }}>
    <MobileProfileAvatarEditor appearance="settings" pending={pending} error={scratch.error} currentUrl={currentUrl} currentInitials={deriveInitials(draft.name)} disabled={disabled} onSelect={scratch.select} onClear={scratch.clear} onBusyChange={reportBusy}>
      <section className="profile-settings-section" aria-labelledby="profile-personal-info-heading">
        <h2 id="profile-personal-info-heading" className="profile-settings-section-title">Profile information</h2>
        <div className="profile-settings-group">
          <label className="profile-settings-row profile-settings-field" htmlFor="profile-personal-name"><span>Name</span><input id="profile-personal-name" name="name" autoComplete="name" required maxLength={NAME_MAX_LENGTH} value={draft.name} placeholder="Your name" disabled={disabled} onChange={event => update('name', event.target.value)} onBlur={() => setTouched(current => ({ ...current, name: true }))} aria-invalid={touched.name && Boolean(nameError)} aria-describedby={touched.name && nameError ? 'profile-personal-name-error' : undefined} /></label>
          {touched.name && nameError && <p id="profile-personal-name-error" className="profile-settings-error" role="alert">{nameError}</p>}
          <div className="profile-settings-row profile-personal-location" onBlur={() => setTouched(current => ({ ...current, location: true }))}>
            <ProfileLocationPicker id="profile-personal-location" label="Location" value={draft.location} disabled={disabled} error={touched.location ? locationError : null} onChange={value => update('location', value)} />
          </div>
        </div>
        <p className="profile-settings-helper">Name is required. Location is optional.</p>
      </section>
    </MobileProfileAvatarEditor>
    {failure && <p role="alert" className="profile-settings-error">{failure}</p>}
  </form>;
}
