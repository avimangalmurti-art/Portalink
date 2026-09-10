import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const SPLASH_DURATION_MS = 1200;
const SPLASH_EXIT_SECONDS = 0.32;

/** A short, unaltered excerpt of the supplied animation, played once at startup. */
export function PortalinkSplashLoader({ onComplete, stillOnly = false }: { onComplete: () => void; stillOnly?: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const showStill = shouldReduceMotion || stillOnly;
  const videoRef = useRef<HTMLVideoElement>(null);
  const reported = useRef(false);
  const [failed, setFailed] = useState(false);
  const complete = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onComplete();
  }, [onComplete]);
  const fail = useCallback(() => { setFailed(true); complete(); }, [complete]);

  useEffect(() => {
    if (showStill || failed) { complete(); return; }
    const video = videoRef.current;
    if (!video) { complete(); return; }
    // Include the exit fade in the 1.2-second presentation budget. Session
    // restoration still owns whether the application is ready.
    const timeout = window.setTimeout(complete, SPLASH_DURATION_MS - SPLASH_EXIT_SECONDS * 1000);
    video.muted = true;
    video.defaultMuted = true;
    try { void video.play()?.catch(fail); } catch { fail(); }
    return () => { window.clearTimeout(timeout); video.pause(); };
  }, [showStill, failed, complete, fail]);

  return (
    <motion.div
      data-portalink-splash="true"
      role="status"
      aria-live="polite"
      aria-label="Portalink Networks is opening"
      className="portalink-splash fixed inset-0 z-[1000] grid min-h-[100dvh] w-full place-items-center overflow-hidden"
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : SPLASH_EXIT_SECONDS, ease: [0.22, 1, 0.36, 1] }}
    >
      {showStill || failed ? <img src="/portalink-splash-poster.png" alt="" aria-hidden="true" width={576} height={576} className="portalink-splash-media" /> :
        <video ref={videoRef} src="/portalink-splash.mp4" poster="/portalink-splash-poster.png" autoPlay muted playsInline preload="auto" disablePictureInPicture
          aria-hidden="true" width={576} height={576} className="portalink-splash-media" onEnded={complete} onError={fail} />}
    </motion.div>
  );
}
