import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// Original first-person prompts inspired by scientific and creative practice.
// These are not quotations or paraphrases attributed to historical figures.
const thoughts = [
  'I can turn a difficult question into a useful experiment.',
  'I can build something better by understanding how it works.',
  'I can make a complex problem simpler, one step at a time.',
  'I can test my assumptions before I trust my answer.',
  'I can learn from the patterns that living systems reveal.',
  'I can turn a small observation into a new way of thinking.',
  'I can give an abstract idea a form others can use.',
  'I can write a clearer solution by asking a better question.',
  'I can improve a design by listening to what fails.',
  'I can connect ideas from fields that rarely meet.',
  'I can look for the simple rule behind a complex pattern.',
  'I can build tools that help other people do more.',
  'I can change my mind when the evidence changes.',
  'I can follow a surprising result toward a better idea.',
  'I can create something meaningful with what I know today.',
  'I can make room for discovery by staying curious.',
  'I can solve a small part of a problem that matters.',
  'I can share what I learn so someone else can go further.',
] as const;

/** A quiet, self-contained rotation that never delays the account actions. */
export function CreativeThought() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reducedMotion) return;
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); };
    const sync = () => {
      stop();
      if (document.visibilityState !== 'hidden') {
        timer = window.setInterval(() => setIndex(previous => (previous + 1) % thoughts.length), 20_000);
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { stop(); document.removeEventListener('visibilitychange', sync); };
  }, [paused, reducedMotion]);

  return <div className="professional-entry-thought">
    <p className="professional-entry-thought-copy" aria-live="off">
      {/* Reserve the tallest wrapped prompt at the current text size and width. */}
      {thoughts.map(thought => <span className="professional-entry-thought-space" aria-hidden="true" key={thought}>{thought}</span>)}
      <span>{thoughts[index]}</span>
    </p>
    {!reducedMotion && <button type="button" className="professional-entry-thought-toggle" aria-pressed={paused} onClick={() => setPaused(previous => !previous)}>
      {paused ? 'Resume changing thoughts' : 'Pause changing thoughts'}
    </button>}
  </div>;
}
