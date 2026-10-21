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
  keepFocusOnSelect?: boolean;
  onConfirm?: (place: DirectoryPlace) => void;
};
export function LocationSearch({ hideLabel, citiesOnly, resultLimit, recommendedCities, id, label, value, onChange, onSelect, disabled, maxLength, error, canSelect, above, blurOnSelect, keepFocusOnSelect, onConfirm }: Props) {
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
  const requestVersion = useRef(0);
  const resultQuery = useRef<string | null>(null);
  const optionPointer = useRef<{ id: number; placeId: string; version: number; x: number; y: number; scrollTop: number; moved: boolean } | null>(null);
  const skipPointerClick = useRef(false);
  const matchingResults = resultQuery.current === value ? results : [];
  const searching = open && !disabled && (value.trim().length >= 1 || Boolean(recommendedCities?.length));
  useEffect(() => {
    if (!searching) return;
    let current = true;
    const version = ++requestVersion.current;
    resultQuery.current = null;
    setResults([]); setStatus('loading'); setActive(0);
    const timer = window.setTimeout(() => {
      const request = !value.trim() && recommendedCities?.length
        ? Promise.all(recommendedCities.map(name=>locationDirectory.search(name).then(places=>places.find(place=>place.kind==='city'&&place.name.toLowerCase()===name.toLowerCase())??places.find(place=>place.kind==='city')))).then(places=>places.filter((place):place is DirectoryPlace=>Boolean(place)))
        : locationDirectory.search(value, citiesOnly ? 50 : undefined);
      void request.then(places => {
        if (current && version === requestVersion.current) { resultQuery.current = value; setResults((citiesOnly?places.filter(place=>place.kind==='city'):places).slice(0,resultLimit??places.length)); setStatus('ready'); }
      }).catch(() => { if (current && version === requestVersion.current) setStatus('error'); });
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
    if (disabled || resultQuery.current !== value || (canSelect && !canSelect(place))) return;
    requestVersion.current++;
    resultQuery.current = null;
    setResults([]);
    setActive(0);
    selectedPlace.current = place;
    onSelect(place);
    // Keep the same input/keyboard during the city-choice gesture. Focus can
    // dispatch onFocus synchronously, so close suggestions after restoring it.
    if (keepFocusOnSelect && !confirm) input.current?.focus({ preventScroll: true });
    setOpen(false);
    if (onConfirm && confirm) onConfirm(place);
    if (blurOnSelect && (!onConfirm || confirm)) input.current?.blur();
  };
  const movedFromOption = (event: React.PointerEvent<HTMLLIElement>, start: NonNullable<typeof optionPointer.current>) =>
    (event.clientX - start.x) ** 2 + (event.clientY - start.y) ** 2 > 100;
  return <div className="location-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className={hideLabel ? 'sr-only' : undefined} htmlFor={inputId}>{label}</label>
    <input ref={input} id={inputId} className="input-shell text-control-shell" role="combobox" value={value} disabled={disabled} maxLength={maxLength}
      autoComplete="off" enterKeyHint={keepFocusOnSelect ? 'search' : undefined} aria-autocomplete="list" aria-expanded={searching} aria-controls={searching ? `${inputId}-results` : undefined}
      aria-activedescendant={searching && matchingResults[active] ? `${inputId}-result-${active}` : undefined}
      aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-error` : undefined}
      placeholder="Search city, region or country" onFocus={() => setOpen(true)}
      onChange={event => { selectedPlace.current = null; requestVersion.current++; resultQuery.current = null; setResults([]); setActive(0); setOpen(true); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' && searching) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          setActive(index => !open ? 0 : Math.max(0, Math.min(matchingResults.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key === 'Enter') {
          if (searching && matchingResults[active]) { event.preventDefault(); select(matchingResults[active], true); }
          else if (onConfirm && selectedPlace.current) { event.preventDefault(); onConfirm(selectedPlace.current); if (blurOnSelect) input.current?.blur(); }
        }
      }} />
    {searching && <div className={`location-search-results${above ? ' is-above' : ''}`}>
      <ul ref={list} id={`${inputId}-results`} role="listbox" aria-label="Matching locations">
        {matchingResults.map((place, index) => <li id={`${inputId}-result-${index}`} key={place.id} role="option" aria-selected={active === index}
          aria-disabled={canSelect && !canSelect(place) ? true : undefined} onPointerDown={event => {
            event.preventDefault();
            skipPointerClick.current = false;
            optionPointer.current = null;
            if ((event.pointerType === 'touch' || event.pointerType === 'pen') && event.isPrimary && event.button === 0) {
              optionPointer.current = { id: event.pointerId, placeId: place.id, version: requestVersion.current, x: event.clientX, y: event.clientY, scrollTop: list.current?.scrollTop ?? 0, moved: false };
            }
          }}
          onPointerMove={event => {
            const start = optionPointer.current;
            if (start?.id === event.pointerId && movedFromOption(event, start)) start.moved = true;
          }}
          onPointerCancel={event => {
            if (optionPointer.current?.id !== event.pointerId) return;
            optionPointer.current = null;
            skipPointerClick.current = true;
          }}
          onPointerUp={event => {
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
            const start = optionPointer.current;
            optionPointer.current = null;
            skipPointerClick.current = true;
            // A completed tap commits without waiting for Safari's emulated
            // click. Panning/cancelled/stale gestures retain native scrolling.
            if (!start || start.id !== event.pointerId || start.placeId !== place.id || start.version !== requestVersion.current || start.moved || movedFromOption(event, start) || Math.abs((list.current?.scrollTop ?? 0) - start.scrollTop) > 1) return;
            event.preventDefault();
            select(place);
          }}
          onMouseDown={keepFocusOnSelect ? event => event.preventDefault() : undefined}
          onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(index); }} onClick={event => {
            const skip = skipPointerClick.current;
            skipPointerClick.current = false;
            if (skip && event?.detail !== 0) return;
            select(place);
          }}>
          <span>{place.name}<small>{[place.kind === 'city' ? place.regionName : place.kind === 'region' ? 'Region' : 'Country', place.countryName].filter(Boolean).join(' · ')}</small></span>
          {canSelect && !canSelect(place) && <small>Name exceeds the profile limit</small>}
        </li>)}
      </ul>
      <div role="status" className="location-search-status">
        {status === 'loading' ? 'Finding locations…' : status === 'error' ? <>Locations could not load. <button type="button" onClick={() => { input.current?.focus(); setRetry(number => number + 1); }}>Try again</button></> : matchingResults.length === 0 ? (value.trim().length < 3 ? 'Keep typing to find more cities.' : 'No matching locations. Try the local name or add a country.') : null}
      </div>
      <a className="location-attribution" href="https://www.geonames.org/" target="_blank" rel="noreferrer">Location data: GeoNames · CC BY 4.0</a>
    </div>}
    {error && <p id={`${inputId}-error`} role="alert">{error}</p>}
  </div>;
}
