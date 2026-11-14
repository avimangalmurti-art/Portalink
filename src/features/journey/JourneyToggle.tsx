import React from 'react';
import './journey.css';
export function JourneyToggle({ view, onChange, disabled = false, portalsButton, showTimeline = true }: {
  view: 'portfolio' | 'journey';
  onChange: (view: 'portfolio' | 'journey') => void;
  disabled?: boolean;
  portalsButton?: React.ReactNode;
  showTimeline?: boolean;
}) {
  return <div className="journey-toggle" role="group" aria-label="Profile view">
    <button type="button" aria-pressed={view === 'portfolio'} disabled={disabled} onClick={() => onChange('portfolio')}>Catalogue</button>
    {portalsButton}
    {showTimeline && <button type="button" aria-pressed={view === 'journey'} disabled={disabled} onClick={() => onChange('journey')}>Timeline</button>}
  </div>;
}
