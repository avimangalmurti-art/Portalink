import { useEffect, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { getCategoryIcon, getPortalIconLabel, profileLinkIconOptions } from '../../components/profile/categoryIcons';
import { ProfileLinkIconPicker } from './ProfileLinkIconPicker';
import { DEFAULT_PROFILE_LINK_ICON, inferProfileLinkIconName } from './profileLinks';
import type { EditableProfileLink } from './useProfileEditor';
import { PROFILE_LINK_LABEL_MAX_LENGTH, PROFILE_LINK_URL_MAX_LENGTH, validateProfileLinkLabel, validateProfileLinkUrl } from './validation';

export type ProfileLinkDetailsValue = Pick<EditableProfileLink, 'label' | 'href' | 'iconName'>;

/** Child-local edits are merged only by Done; unmounting is cancellation. */
export function ProfileLinkDetails({ link, disabled, onDone, onRemove, onDirtyChange, onValidityChange }: {
  link: EditableProfileLink | null;
  disabled: boolean;
  onDone: (value: ProfileLinkDetailsValue) => void;
  onRemove: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const [initial] = useState<ProfileLinkDetailsValue>(() => ({ label: link?.label ?? '', href: link?.href ?? '', iconName: link?.iconName ?? DEFAULT_PROFILE_LINK_ICON }));
  const [draft, setDraft] = useState(initial);
  const [choosingIcon, setChoosingIcon] = useState(false);
  const [touched, setTouched] = useState({ label: false, href: false });
  const labelError = validateProfileLinkLabel(draft.label);
  const hrefError = validateProfileLinkUrl(draft.href);
  const valid = !labelError && !hrefError;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onValidityChange(valid && !choosingIcon), [valid, choosingIcon, onValidityChange]);
  const update = (key: 'label' | 'href', value: string) => {
    setTouched(current => ({ ...current, [key]: true }));
    setDraft(current => {
      const next = { ...current, [key]: value };
      return { ...next, iconName: inferProfileLinkIconName(next.label, next.href, current.iconName) };
    });
  };
  const Icon = getCategoryIcon(draft.iconName ?? DEFAULT_PROFILE_LINK_ICON);
  const iconLabel = profileLinkIconOptions.find(option => option.name === draft.iconName)?.label ?? getPortalIconLabel(draft.iconName ?? DEFAULT_PROFILE_LINK_ICON);

  return <form id="profile-link-form" className="profile-settings-content profile-link-details" noValidate onSubmit={event => {
    event.preventDefault();
    if (disabled || !valid || choosingIcon) { setTouched({ label: true, href: true }); return; }
    onDone({ ...draft, label: draft.label.trim(), href: draft.href.trim() });
  }}>
    <section className="profile-settings-section" aria-labelledby="profile-link-details-heading">
      <h2 id="profile-link-details-heading" className="profile-settings-section-title">Link details</h2>
      <div className="profile-settings-group">
        <label className="profile-settings-row profile-settings-field" htmlFor="profile-link-name"><span>Name</span><input id="profile-link-name" name="linkName" required maxLength={PROFILE_LINK_LABEL_MAX_LENGTH} autoComplete="off" value={draft.label} placeholder="Link name" disabled={disabled} onChange={event => update('label', event.target.value)} aria-invalid={touched.label && Boolean(labelError)} aria-describedby={touched.label && labelError ? 'profile-link-name-error' : undefined} /></label>
        {touched.label && labelError && <p id="profile-link-name-error" className="profile-settings-error" role="alert">{labelError}</p>}
        <label className="profile-settings-row profile-settings-field" htmlFor="profile-link-url"><span>URL</span><input id="profile-link-url" name="linkUrl" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="url" required maxLength={PROFILE_LINK_URL_MAX_LENGTH} value={draft.href} placeholder="https://example.com" disabled={disabled} onChange={event => update('href', event.target.value)} aria-invalid={touched.href && Boolean(hrefError)} aria-describedby={touched.href && hrefError ? 'profile-link-url-error' : undefined} /></label>
        {touched.href && hrefError && <p id="profile-link-url-error" className="profile-settings-error" role="alert">{hrefError}</p>}
      </div>
    </section>
    <section className="profile-settings-section" aria-label="Link icon">
      <div className="profile-settings-group"><button type="button" className="profile-settings-row profile-settings-disclosure" disabled={disabled} onClick={() => setChoosingIcon(true)} aria-label={`Icon, ${iconLabel}`} aria-haspopup="dialog"><Icon className="profile-settings-link-icon" aria-hidden="true" /><span className="profile-settings-label">Icon</span><span className="profile-settings-value">{iconLabel}</span><ChevronRightIcon className="profile-settings-chevron" aria-hidden="true" /></button></div>
      <p className="profile-settings-helper">Choose how this link appears on your profile.</p>
    </section>
    {link && <section className="profile-settings-section" aria-label="Remove link"><div className="profile-settings-group"><button type="button" className="profile-settings-row profile-settings-danger" disabled={disabled} onClick={onRemove}>Remove link</button></div></section>}
    {choosingIcon && <ProfileLinkIconPicker value={draft.iconName ?? DEFAULT_PROFILE_LINK_ICON} onCancel={() => setChoosingIcon(false)} onDone={iconName => {
      const option = profileLinkIconOptions.find(candidate => candidate.name === iconName);
      setDraft(current => ({ ...current, iconName, ...(!current.label.trim() && option?.isBrand ? { label: option.label } : {}) }));
      setChoosingIcon(false);
    }} />}
  </form>;
}
