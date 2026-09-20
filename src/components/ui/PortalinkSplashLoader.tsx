import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useViewportPresentation } from '../../presentation/useViewportPresentation';

const SPLASH_EXIT_SECONDS = 0.32;
const FIRST_FRAME_TIMEOUT_MS = 600;
const SPLASH_TIMEOUT_MS = 2200;
const WEB_PLAYBACK_MS = 880;

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
  const [showVideo, setShowVideo] = useState(false);
  const complete = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onComplete?.();
  }, [onComplete]);
  useEffect(() => {
    if (showStill || failed) { complete(); return; }
    const video = videoRef.current;
    if (!video) { complete(); return; }
    let active = true;
    let settled = false;
    let revealed = false;
    let frame: number | undefined;
    let playbackTimer: number | undefined;
    const clearPending = () => {
      window.clearTimeout(firstFrameTimer);
      window.clearTimeout(deadline);
      window.clearTimeout(playbackTimer);
      if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
      frame = undefined;
    };
    const finish = (fallback: boolean) => {
      if (!active || settled) return;
      settled = true;
      clearPending();
      if (fallback) { setShowVideo(false); setFailed(true); }
      // Keep the final painted frame for the fade on successful completion.
      video.pause();
      complete();
    };
    const fail = () => finish(true);
    const firstFrameTimer = window.setTimeout(fail, FIRST_FRAME_TIMEOUT_MS);
    const deadline = window.setTimeout(fail, SPLASH_TIMEOUT_MS);
    const reveal = () => {
      frame = undefined;
      if (!active || settled || revealed || video.paused || video.readyState < 2) return;
      revealed = true;
      window.clearTimeout(firstFrameTimer);
      setShowVideo(true);
      if (!isMobile) playbackTimer = window.setTimeout(() => finish(false), WEB_PLAYBACK_MS);
    };
    const playing = () => {
      if (!active || settled || revealed || frame !== undefined) return;
      // A resolved play promise alone does not guarantee a painted frame.
      if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(reveal);
      else reveal();
    };
    const ended = () => finish(!revealed);
    const paused = () => {
      // Cleanup can queue a pause event that arrives after a new play attempt.
      if (!video.paused) return;
      if (video.ended) ended(); else fail();
    };
    const waiting = () => { if (revealed) fail(); };
    const stalled = () => { if (revealed && video.readyState < 3) fail(); };
    const visibilityChanged = () => { if (document.hidden) fail(); };
    video.addEventListener('playing', playing);
    video.addEventListener('loadeddata', playing);
    video.addEventListener('ended', ended);
    video.addEventListener('error', fail);
    video.addEventListener('pause', paused);
    video.addEventListener('waiting', waiting);
    video.addEventListener('stalled', stalled);
    document.addEventListener('visibilitychange', visibilityChanged);
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    if (document.hidden) fail();
    else {
      try { void video.play()?.catch(fail); } catch { fail(); }
      if (!video.paused && video.readyState >= 2) playing();
    }
    return () => {
      active = false;
      clearPending();
      video.removeEventListener('playing', playing);
      video.removeEventListener('loadeddata', playing);
      video.removeEventListener('ended', ended);
      video.removeEventListener('error', fail);
      video.removeEventListener('pause', paused);
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('stalled', stalled);
      document.removeEventListener('visibilitychange', visibilityChanged);
      video.pause();
    };
  }, [showStill, failed, complete, isMobile]);

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
      <img src={posterSrc} alt="" aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-media" />
      {!showStill && !failed && <video key={presentation} ref={videoRef} src={videoSrc} poster={posterSrc} autoPlay muted playsInline preload="auto"
        controls={false} disablePictureInPicture disableRemotePlayback tabIndex={-1}
        aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-media portalink-splash-video"
        style={{ opacity: showVideo ? 1 : 0 }} />}
    </motion.div>
  );
}
