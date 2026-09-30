import React from 'react';
import './journey.css';
export function JourneyToggle({ view, onChange, disabled = false }: { view: 'portfolio' | 'journey'; onChange: (view: 'portfolio' | 'journey') => void; disabled?: boolean }) {
  return <div className="journey-toggle" role="group" aria-label="Profile view">{(['portfolio', 'journey'] as const).map(item =>
    <button type="button" key={item} aria-pressed={view === item} disabled={disabled} onClick={() => onChange(item)}>{item === 'portfolio' ? 'Portfolio' : 'Journey'}</button>)}</div>;
}
