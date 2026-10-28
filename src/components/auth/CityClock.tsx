import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const cities = [
  { name: 'San Francisco', zone: 'America/Los_Angeles' },
  { name: 'New York', zone: 'America/New_York' },
  { name: 'London', zone: 'Europe/London' },
  { name: 'Paris', zone: 'Europe/Paris' },
  { name: 'Dubai', zone: 'Asia/Dubai' },
  { name: 'Mumbai', zone: 'Asia/Kolkata' },
  { name: 'Singapore', zone: 'Asia/Singapore' },
  { name: 'Tokyo', zone: 'Asia/Tokyo' },
  { name: 'Sydney', zone: 'Australia/Sydney' },
].map(city => ({ ...city, formatter: new Intl.DateTimeFormat('en-US', {
  timeZone: city.zone, hour: 'numeric', minute: '2-digit', hour12: true,
}) }));

/** Device-clock time with IANA time zones, including their daylight-saving rules. */
export function CityClock() {
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    let tick: number | undefined, rotation: number | undefined;
    const stop = () => { window.clearInterval(tick); window.clearInterval(rotation); };
    const sync = () => {
      stop();
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
      tick = window.setInterval(() => setNow(Date.now()), 1_000);
      if (!paused && !reducedMotion) rotation = window.setInterval(() => {
        setIndex(previous => (previous + 1) % cities.length);
        setNow(Date.now());
      }, 5_000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { stop(); document.removeEventListener('visibilitychange', sync); };
  }, [paused, reducedMotion]);
  const city = cities[index];
  return <div className="professional-entry-thought professional-entry-city-clock">
    <p className="professional-entry-thought-copy" aria-live="off">
      {/* Reserve the longest city/time line at the current text size. */}
      {cities.map(entry => <span className="professional-entry-thought-space" aria-hidden="true" key={entry.zone}>{entry.name} · <span className="professional-entry-clock-time">12:59 AM</span></span>)}
      <span data-city-clock="">{city.name} · <time className="professional-entry-clock-time" dateTime={new Date(now).toISOString()}>{city.formatter.format(now)}</time></span>
    </p>
    {!reducedMotion && <button type="button" className="professional-entry-thought-toggle" aria-pressed={paused} onClick={() => setPaused(previous => !previous)}>
      {paused ? 'Resume changing cities' : 'Pause changing cities'}
    </button>}
  </div>;
}
