import React from 'react';
import { LocationSearch } from './LocationSearch';
import { profilePlaceLabel } from '../../data/locationDirectory';
import { LOCATION_MAX_LENGTH } from '../../features/profile/validation';

type Props = { focusedScreen?: boolean; id: string; value: string; disabled?: boolean; error?: string | null; onChange: (location: string) => void };

/** Keep legacy/custom text intact; only an explicit choice replaces it. */
export function ProfileLocationPicker({ id, value, disabled, error, onChange, focusedScreen = false }: Props) {
  return <div className={focusedScreen ? "onboarding-location-search" : undefined}><LocationSearch id={id} label="Location (optional)" value={value} disabled={disabled} error={error}
    above={focusedScreen} blurOnSelect={focusedScreen} onConfirm={focusedScreen ? () => { /* Selection already updates profile state; Enter only finishes editing. */ } : undefined}
    maxLength={LOCATION_MAX_LENGTH} onChange={onChange} canSelect={place => profilePlaceLabel(place) !== null}
    onSelect={place => { const label = profilePlaceLabel(place); if (label !== null) onChange(label); }} /></div>;
}
