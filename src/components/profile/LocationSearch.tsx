import React, { useEffect, useId, useRef, useState } from 'react';
import { locationDirectory, type DirectoryPlace } from '../../data/locationDirectory';
import './locationSearch.css';

type Props = {
  hideLabel?: boolean;
  citiesOnly?: boolean;
  resultLimit?: number;
  recommendedCities?: readonly string[];
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: DirectoryPlace) => void;
  disabled?: boolean;
  maxLength?: number;
  error?: string | null;
  canSelect?: (place: DirectoryPlace) => boolean;
  above?: boolean;
  blurOnSelect?: boolean;
  onConfirm?: (place: DirectoryPlace) => void;
};
export function LocationSearch({ hideLabel, citiesOnly, resultLimit, recommendedCities, id, label, value, onChange, onSelect, disabled, maxLength, error, canSelect, above, blurOnSelect, onConfirm }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DirectoryPlace[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selectedPlace = useRef<DirectoryPlace | null>(null);
  const searching = open && !disabled && (value.trim().length >= 1 || Boolean(recommendedCities?.length));
  useEffect(() => {
    if (!searching) return;
    let current = true;
    setResults([]); setStatus('loading'); setActive(0);
    const timer = window.setTimeout(() => {
      const request = !value.trim() && recommendedCities?.length
        ? Promise.all(recommendedCities.map(name=>locationDirectory.search(name).then(places=>places.find(place=>place.kind==='city'&&place.name.toLowerCase()===name.toLowerCase())??places.find(place=>place.kind==='city')))).then(places=>places.filter((place):place is DirectoryPlace=>Boolean(place)))
        : locationDirectory.search(value, citiesOnly ? 50 : undefined);
      void request.then(places => {
        if (current) { setResults((citiesOnly?places.filter(place=>place.kind==='city'):places).slice(0,resultLimit??places.length)); setStatus('ready'); }
      }).catch(() => { if (current) setStatus('error'); });
    }, 180);
    return () => { current = false; window.clearTimeout(timer); };
  }, [searching, value, retry, citiesOnly, resultLimit, recommendedCities]);
  useEffect(() => {
    const item = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const parent = list.current;
    if (!item || !parent) return;
    if (item.offsetTop < parent.scrollTop) parent.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > parent.scrollTop + parent.clientHeight) parent.scrollTop = item.offsetTop + item.offsetHeight - parent.clientHeight;
  }, [active, results]);
  const select = (place: DirectoryPlace, confirm = false) => {
    if (canSelect && !canSelect(place)) return;
    setOpen(false);
    selectedPlace.current = place;
    onSelect(place);
    if (onConfirm && confirm) onConfirm(place);
    if (blurOnSelect && (!onConfirm || confirm)) input.current?.blur();
  };
  return <div className="location-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className={hideLabel ? 'sr-only' : undefined} htmlFor={inputId}>{label}</label>
    <input ref={input} id={inputId} className="input-shell text-control-shell" role="combobox" value={value} disabled={disabled} maxLength={maxLength}
      autoComplete="off" aria-autocomplete="list" aria-expanded={searching} aria-controls={searching ? `${inputId}-results` : undefined}
      aria-activedescendant={searching && results[active] ? `${inputId}-result-${active}` : undefined}
      aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-error` : undefined}
      placeholder="Search city, region or country" onFocus={() => setOpen(true)}
      onChange={event => { selectedPlace.current = null; setResults([]); setActive(0); setOpen(true); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' && searching) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          setActive(index => !open ? 0 : Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key === 'Enter') {
          if (searching && results[active]) { event.preventDefault(); select(results[active], true); }
          else if (onConfirm && selectedPlace.current) { event.preventDefault(); onConfirm(selectedPlace.current); if (blurOnSelect) input.current?.blur(); }
        }
      }} />
    {searching && <div className={`location-search-results${above ? ' is-above' : ''}`}>
      <ul ref={list} id={`${inputId}-results`} role="listbox" aria-label="Matching locations">
        {results.map((place, index) => <li id={`${inputId}-result-${index}`} key={place.id} role="option" aria-selected={active === index}
          aria-disabled={canSelect && !canSelect(place) ? true : undefined} onPointerDown={event => event.preventDefault()}
          onPointerEnter={() => setActive(index)} onClick={() => select(place)}>
          <span>{place.name}<small>{[place.kind === 'city' ? place.regionName : place.kind === 'region' ? 'Region' : 'Country', place.countryName].filter(Boolean).join(' · ')}</small></span>
          {canSelect && !canSelect(place) && <small>Name exceeds the profile limit</small>}
        </li>)}
      </ul>
      <div role="status" className="location-search-status">
        {status === 'loading' ? 'Finding locations…' : status === 'error' ? <>Locations could not load. <button type="button" onClick={() => { input.current?.focus(); setRetry(number => number + 1); }}>Try again</button></> : results.length === 0 ? (value.trim().length < 3 ? 'Keep typing to find more cities.' : 'No matching locations. Try the local name or add a country.') : null}
      </div>
      <a className="location-attribution" href="https://www.geonames.org/" target="_blank" rel="noreferrer">Location data: GeoNames · CC BY 4.0</a>
    </div>}
    {error && <p id={`${inputId}-error`} role="alert">{error}</p>}
  </div>;
}
