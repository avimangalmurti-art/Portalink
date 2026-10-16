import React, { useEffect, useState } from 'react';

/** Decorative only: playback never gates or triggers a decision. */
export function DestructiveWarning() {
  const [animate, setAnimate] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAnimate(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return <div className="portalink-destructive-warning" aria-hidden="true">
    {animate && !failed ? <video autoPlay muted playsInline preload="metadata" poster="/animations/destructive-warning.jpg" onError={() => setFailed(true)}>
      <source src="/animations/destructive-warning.mp4" type="video/mp4" />
    </video> : <img src="/animations/destructive-warning.jpg" alt="" width={112} height={112} />}
  </div>;
}
