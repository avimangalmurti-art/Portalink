/// <reference lib="es2021.intl" />
import React from 'react';
import { cities } from '../../data/cities';
import { getCountryCode } from '../../data/countryCodes';

// Reuse the existing curated location catalogue; this is not a global city directory.
const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countries = [...new Set(cities.map(city => getCountryCode(city.name)))].filter(Boolean)
  .map(code => ({ code, name: regionNames?.of(code) || code }))
  .sort((a, b) => a.name.localeCompare(b.name));

type Props = {
  id: string;
  value: string;
  disabled?: boolean;
  error?: string | null;
  onChange: (location: string) => void;
};

export function ProfileLocationPicker({ id, value, disabled, error, onChange }: Props) {
  const city = cities.find(item => value === item.name || value === `${item.name}, ${getCountryCode(item.name)}`);
  const country = city ? getCountryCode(city.name) : countries.find(item => value === item.code || value === item.name)?.code || '';
  const unlisted = Boolean(value && !country);
  const choices = cities.filter(item => getCountryCode(item.name) === country).sort((a, b) => a.name.localeCompare(b.name));
  const describedBy = error ? `${id}-error` : unlisted ? `${id}-current` : undefined;
  const selectClass = 'input-shell text-control-shell h-11 w-full min-w-0 rounded-[8px] bg-[var(--surface-sunken)] px-2 text-[14px] text-[var(--text-primary)] disabled:opacity-60';
  return <div id={id} className="flex flex-col gap-1.5">
    <div className="grid grid-cols-2 gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${id}-country`} className="text-[14px] font-medium text-[var(--text-primary)]">Country (optional)</label>
        <select id={`${id}-country`} value={country} disabled={disabled} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={selectClass}
          onChange={event => onChange(countries.find(item => item.code === event.target.value)?.name || '')}>
          <option value="">{unlisted ? 'Choose country' : 'Not selected'}</option>
          {countries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${id}-city`} className="text-[14px] font-medium text-[var(--text-primary)]">City (optional)</label>
        <select id={`${id}-city`} value={city?.name || ''} disabled={disabled || !country} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={selectClass}
          onChange={event => onChange(event.target.value ? `${event.target.value}, ${country}` : countries.find(item => item.code === country)?.name || '')}>
          <option value="">{country ? 'Not selected' : 'Choose country first'}</option>
          {choices.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </div>
    </div>
    {unlisted && <p id={`${id}-current`} className="text-[12px] text-[var(--text-secondary)]">Current location: {value}. <button type="button" disabled={disabled} onClick={() => onChange('')} className="underline">Clear</button></p>}
    {error && <p id={`${id}-error`} role="alert" className="text-[12px] text-[var(--text-primary)]">{error}</p>}
  </div>;
}
