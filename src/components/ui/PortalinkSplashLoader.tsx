import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useViewportPresentation } from '../../presentation/useViewportPresentation';

const SPLASH_DURATION_MS = 1200;
const SPLASH_EXIT_SECONDS = 0.32;
const MOBILE_SPLASH_TIMEOUT_MS = 3000;

/** Platform artwork plays once; authentication still owns startup readiness. */
export function PortalinkSplashLoader({ onComplete, stillOnly = false }: { onComplete?: () => void; stillOnly?: boolean }) {
  // Startup precedes AppPresentation. Reuse its canonical viewport hook here
  // rather than mounting another app host or introducing device detection.
  const viewportPresentation = useViewportPresentation();
  // Finish the opening animation if the phone rotates during its short run.
  const [presentation] = useState(viewportPresentation);
  const isMobile = presentation === 'mobile';
  const videoSrc = isMobile ? '/portalink-splash-mobile.mp4' : '/portalink-splash.mp4';
  const posterSrc = isMobile ? '/portalink-splash-mobile-poster.png' : '/portalink-splash-poster.png';
  const mediaWidth = isMobile ? 512 : 576;
  const mediaHeight = isMobile ? 720 : 576;
  const shouldReduceMotion = useReducedMotion();
  const showStill = shouldReduceMotion || stillOnly;
  const videoRef = useRef<HTMLVideoElement>(null);
  const reported = useRef(false);
  const [failed, setFailed] = useState(false);
  const complete = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onComplete?.();
  }, [onComplete]);
  const fail = useCallback(() => { setFailed(true); complete(); }, [complete]);

  useEffect(() => {
    if (showStill || failed) { complete(); return; }
    const video = videoRef.current;
    if (!video) { complete(); return; }
    // WEB retains its 1.2-second budget including the fade. MOBILE finishes its
    // complete 1.5-second clip onEnded, with a bound for slow/stalled playback.
    const timeout = window.setTimeout(complete, isMobile ? MOBILE_SPLASH_TIMEOUT_MS : SPLASH_DURATION_MS - SPLASH_EXIT_SECONDS * 1000);
    video.muted = true;
    video.defaultMuted = true;
    try { void video.play()?.catch(fail); } catch { fail(); }
    return () => { window.clearTimeout(timeout); video.pause(); };
  }, [showStill, failed, complete, fail, isMobile]);

  return (
    <motion.div
      data-portalink-splash="true"
      data-presentation={presentation}
      role="status"
      aria-live="polite"
      aria-label="Portalink Networks is opening"
      className="portalink-splash fixed inset-0 z-[1000] grid min-h-[100dvh] w-full place-items-center overflow-hidden"
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : SPLASH_EXIT_SECONDS, ease: [0.22, 1, 0.36, 1] }}
    >
      {showStill || failed ? <img src={posterSrc} alt="" aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-media" /> :
        <video key={presentation} ref={videoRef} src={videoSrc} poster={posterSrc} autoPlay muted playsInline preload="auto" disablePictureInPicture
          aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-media" onEnded={complete} onError={fail} />}
    </motion.div>
  );
}
