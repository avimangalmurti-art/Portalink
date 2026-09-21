import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useViewportPresentation } from '../../presentation/useViewportPresentation';
import { useModalFocus } from '../../hooks/useModalFocus';

const SPLASH_EXIT_SECONDS = 0.32;
const FIRST_FRAME_TIMEOUT_MS = 600;
const SPLASH_TIMEOUT_MS = 2200;
const WEB_PLAYBACK_MS = 880;

/** Startup plays once; the mobile welcome screen loops until an action is chosen. */
export function PortalinkSplashLoader({ onComplete, stillOnly = false, hidden = false, landing }: {
  onComplete?: () => void;
  stillOnly?: boolean;
  hidden?: boolean;
  landing?: { ready: boolean; onCreateAccount: () => void; onSignIn: () => void; onForgotPassword: () => void; onContinue: () => void; continueLabel: string };
}) {
  // Startup precedes AppPresentation. Reuse its canonical viewport hook here
  // rather than mounting another app host or introducing device detection.
  const viewportPresentation = useViewportPresentation();
  // Finish the opening animation if the phone rotates during its short run.
  const [presentation] = useState(viewportPresentation);
  const isMobile = presentation === 'mobile';
  const loopLanding = isMobile && Boolean(landing);
  const playbackHidden = loopLanding && hidden;
  const playbackHiddenRef = useRef(playbackHidden);
  playbackHiddenRef.current = playbackHidden;
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
  const landingRef = useRef<HTMLDivElement>(null);
  useModalFocus(Boolean(landing) && !hidden, landingRef, () => landing?.onContinue());
  const complete = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onComplete?.();
  }, [onComplete]);
  useEffect(() => {
    if (showStill || failed) { complete(); return; }
    const video = videoRef.current;
    if (!video) { complete(); return; }
    if (loopLanding) {
      // Loading may outlast the first-frame budget on a cold mobile visit.
      // Keep the video mounted so delayed frames can replace the still without
      // reloading. Only actual media/autoplay errors end this playback attempt.
      let active = true;
      let suspended = true;
      let attempt = 0;
      let frame: number | undefined;
      let watchdog: number | undefined;
      const clearPending = () => {
        window.clearTimeout(watchdog);
        if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
        frame = undefined;
      };
      const suspend = () => {
        suspended = true;
        attempt++;
        clearPending();
        video.pause();
      };
      const fail = () => {
        if (!active || suspended) return;
        if (playbackHiddenRef.current || document.hidden) { suspend(); return; }
        suspend();
        setShowVideo(false);
        setFailed(true);
        complete();
      };
      const showLoadingStill = () => {
        if (!active || suspended) return;
        if (playbackHiddenRef.current || document.hidden) { suspend(); return; }
        setShowVideo(false);
        complete();
      };
      const playing = () => {
        if (!active || suspended || frame !== undefined) return;
        const currentAttempt = attempt;
        const reveal = () => {
          if (!active || suspended || currentAttempt !== attempt || video.paused || video.readyState < 2) return;
          clearPending();
          setShowVideo(true);
          complete();
        };
        if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(reveal);
        else reveal();
      };
      const resume = () => {
        if (!active || playbackHidden || document.hidden || !suspended) return;
        suspended = false;
        const currentAttempt = ++attempt;
        watchdog = window.setTimeout(showLoadingStill, FIRST_FRAME_TIMEOUT_MS);
        try {
          void video.play()?.catch(() => { if (currentAttempt === attempt) fail(); });
        } catch { fail(); }
        if (!video.paused && video.readyState >= 2) playing();
      };
      const paused = () => {
        if (suspended || !video.paused) return;
        if (document.hidden || playbackHiddenRef.current) suspend(); else fail();
      };
      const waiting = () => {
        if (!active || suspended) return;
        clearPending();
        watchdog = window.setTimeout(showLoadingStill, SPLASH_TIMEOUT_MS);
      };
      const stalled = () => { if (video.readyState < 3) waiting(); };
      const visibilityChanged = () => { if (document.hidden) suspend(); else resume(); };
      video.addEventListener('playing', playing);
      video.addEventListener('loadeddata', playing);
      video.addEventListener('pause', paused);
      video.addEventListener('waiting', waiting);
      video.addEventListener('stalled', stalled);
      video.addEventListener('error', fail);
      document.addEventListener('visibilitychange', visibilityChanged);
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('webkit-playsinline', '');
      resume();
      return () => {
        active = false;
        video.removeEventListener('playing', playing);
        video.removeEventListener('loadeddata', playing);
        video.removeEventListener('pause', paused);
        video.removeEventListener('waiting', waiting);
        video.removeEventListener('stalled', stalled);
        video.removeEventListener('error', fail);
        document.removeEventListener('visibilitychange', visibilityChanged);
        suspend();
      };
    }
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
  }, [showStill, failed, complete, isMobile, loopLanding, playbackHidden]);

  return (
    <motion.div
      ref={landingRef}
      data-portalink-splash="true"
      data-presentation={presentation}
      data-share-landing={landing ? 'true' : undefined}
      role={landing ? 'dialog' : 'status'}
      aria-modal={landing && !hidden ? true : undefined}
      aria-live={landing ? undefined : 'polite'}
      aria-label={landing ? 'Welcome to Portalink' : 'Portalink Networks is opening'}
      aria-hidden={hidden || undefined}
      tabIndex={landing ? -1 : undefined}
      style={hidden ? { display: 'none' } : undefined}
      className="portalink-splash fixed inset-0 z-[1000] grid min-h-[100dvh] w-full place-items-center overflow-hidden"
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : SPLASH_EXIT_SECONDS, ease: [0.22, 1, 0.36, 1] }}
    >
      <img src={posterSrc} alt="" aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-media" />
      {!showStill && !failed && <video key={presentation} ref={videoRef} src={videoSrc} poster={posterSrc} autoPlay={!playbackHidden} loop={loopLanding || undefined} muted playsInline preload="auto"
        controls={false} disablePictureInPicture disableRemotePlayback tabIndex={-1}
        aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-media portalink-splash-video"
        style={{ opacity: showVideo ? 1 : 0 }} />}
      {landing && <div className="mobile-share-landing-actions" aria-busy={!landing.ready}>
        <button type="button" className="mobile-share-signin" disabled={!landing.ready} onClick={landing.onSignIn}>Sign in</button>
        <button type="button" className="mobile-share-create" disabled={!landing.ready} onClick={landing.onCreateAccount}>Create account</button>
        <div className="mobile-share-secondary">
          <button type="button" className="mobile-share-forgot" disabled={!landing.ready} onClick={landing.onForgotPassword}>Forgot password?</button>
          <button type="button" className="mobile-share-guest" disabled={!landing.ready} onClick={landing.onContinue}>{landing.continueLabel}</button>
        </div>
        {!landing.ready && <span role="status" className="sr-only">Opening Portalink…</span>}
      </div>}
    </motion.div>
  );
}
