import React from 'react';
import './journey.css';
export function JourneyToggle({ view, onChange, disabled = false, portalsButton, portalsOpen = false, showTimeline = true }: {
  view: 'portfolio' | 'journey';
  onChange: (view: 'portfolio' | 'journey') => void;
  disabled?: boolean;
  portalsButton?: React.ReactNode;
  portalsOpen?: boolean;
  showTimeline?: boolean;
}) {
  return <div className="journey-toggle" role="group" aria-label="Profile view">
    <button type="button" aria-pressed={!portalsOpen && view === 'portfolio'} disabled={disabled} onClick={() => onChange('portfolio')}>Catalogue</button>
    {portalsButton && <>
      <span className="journey-toggle-separator" aria-hidden="true">·</span>
      {portalsButton}
    </>}
    {showTimeline && <>
      <span className="journey-toggle-separator" aria-hidden="true">·</span>
      <button type="button" aria-pressed={!portalsOpen && view === 'journey'} disabled={disabled} onClick={() => onChange('journey')}>Timeline</button>
    </>}
  </div>;
}
