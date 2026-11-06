import React, { useEffect, useId, useRef, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { getCategoryIcon, getPortalIconLabel, profileLinkIconNames, profileLinkIconOptions } from '../../components/profile/categoryIcons';
import { PortalIconLibrary } from '../../components/profile/PortalIconLibrary';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { usePresentation } from '../../presentation/usePresentation';
import { DEFAULT_PROFILE_LINK_ICON } from './profileLinks';
import './profileLinkIconPicker.css';

type ProfileLinkIconPickerProps = {
  value: string;
  onDone: (iconName: string) => void;
  onCancel: () => void;
};

/** Selection stays local until Done; Cancel never changes the parent draft. */
export function ProfileLinkIconPicker({ value, onDone, onCancel }: ProfileLinkIconPickerProps) {
  const [selected, setSelected] = useState(() => profileLinkIconNames.includes(value) ? value : DEFAULT_PROFILE_LINK_ICON);
  const [query, setQuery] = useState('');
  const isMobile = usePresentation() === 'mobile';
  const viewportRef = useDialogViewport();
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  useModalFocus(true, dialogRef, onCancel, true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => (isMobile ? dialogRef.current : searchRef.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [isMobile]);
  const Icon = getCategoryIcon(selected);
  const label = profileLinkIconOptions.find(option => option.name === selected)?.label ?? getPortalIconLabel(selected);

  return <ModalPortal><div ref={viewportRef} className="profile-link-icon-picker-overlay" data-presentation={isMobile ? 'mobile' : 'web'}
    onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={dialogRef} className="profile-link-icon-picker" data-material="content" role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}>
      <header className="profile-link-icon-picker-header">
        <button type="button" data-semantic-action="" onClick={onCancel}>Cancel</button>
        <h2 id={headingId}>Choose icon</h2>
        <button type="button" data-semantic-action="" onClick={() => onDone(selected)}>Done</button>
      </header>
      <div className="profile-link-icon-picker-pinned">
        <span className="profile-link-icon-picker-preview" aria-hidden="true"><Icon /></span>
        <p className="profile-link-icon-picker-selection" aria-live="polite">{label}</p>
        <label className="profile-link-icon-picker-search">
          <InterfaceIcon icon={SearchIcon} size="md" /><span className="sr-only">Search link icons</span>
          <input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search icons" autoComplete="off"
            onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
        </label>
      </div>
      <div className="profile-link-icon-picker-scroll scrollbar-overlay" data-portal-icon-scroll="" onFocus={event => {
        // The shared radio keyboard keeps the page still. Reveal the choice in
        // this dialog's own scroller when keyboard focus advances offscreen.
        if (event.target.matches('button[role="radio"]')) event.target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }}>
        <PortalIconLibrary selected={selected} onSelect={setSelected} compact searchQuery={query} additionalOptions={profileLinkIconOptions} label="Link icon" />
      </div>
    </section>
  </div></ModalPortal>;
}
