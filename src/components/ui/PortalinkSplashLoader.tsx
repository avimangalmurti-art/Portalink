import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useViewportPresentation } from '../../presentation/useViewportPresentation';
import { useModalFocus } from '../../hooks/useModalFocus';

const SPLASH_EXIT_SECONDS = 0.32;
const WELCOME_EXIT_SECONDS = 0.25;
const FIRST_FRAME_TIMEOUT_MS = 600;
const SPLASH_TIMEOUT_MS = 2200;
const WEB_PLAYBACK_MS = 880;
const MOBILE_RETURNING_SPLASH_MS = 1500;

/** Startup plays once; the mobile welcome screen loops until an action is chosen. */
export function PortalinkSplashLoader({ onComplete, stillOnly = false, hidden = false, timedIntro = false, landing, welcomeMedia = false, welcomeHandoff = false }: {
  onComplete?: () => void;
  stillOnly?: boolean;
  hidden?: boolean;
  /** Initial mobile session restoration/returning user, never the guest welcome. */
  timedIntro?: boolean;
  /** Reuse the looping Hello World media inside the sign-in form, without a launch overlay. */
  welcomeMedia?: boolean;
  /** Leaving the white welcome scene for the app, including a completed sign-in. */
  welcomeHandoff?: boolean;
  landing?: { ready: boolean; onCreateAccount: () => void; onSignIn: () => void; onForgotPassword: () => void; onContinue: () => void; continueLabel: string };
}) {
  // Startup precedes AppPresentation. Reuse its canonical viewport hook here
  // rather than mounting another app host or introducing device detection.
  const viewportPresentation = useViewportPresentation();
  // Finish the opening animation if the phone rotates during its short run.
  const [presentation] = useState(viewportPresentation);
  const isMobile = presentation === 'mobile' || welcomeMedia || Boolean(landing);
  const loopLanding = isMobile && Boolean(landing);
  const fixedMobileIntro = isMobile && timedIntro && !loopLanding && !stillOnly;
  const playbackHidden = isMobile && hidden;
  const playbackHiddenRef = useRef(playbackHidden);
  playbackHiddenRef.current = playbackHidden;
  const videoSrc = isMobile ? '/portalink-splash-mobile.mp4?v=4d282896' : '/portalink-splash.mp4';
  const posterSrc = isMobile ? '/portalink-welcome-loop.webp?v=6dceb1fd' : '/portalink-splash-poster.png';
  const mediaWidth = isMobile ? 512 : 576;
  const mediaHeight = isMobile ? 720 : 576;
  const shouldReduceMotion = useReducedMotion();
  // MOBILE always uses the requested animation; motion preferences still remove the exit fade.
  const showStill = !isMobile && (shouldReduceMotion || stillOnly);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reported = useRef(false);
  const [failed, setFailed] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const landingRef = useRef<HTMLDivElement>(null);
  const lastLanding = useRef(landing);
  if (landing) lastLanding.current = landing;
  // Keep the exact white scene geometry while a completed sign-in fades it out.
  const sceneLanding = landing ?? (welcomeHandoff ? lastLanding.current : undefined);
  useModalFocus(Boolean(landing) && !hidden, landingRef, () => landing?.onContinue());
  const complete = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onComplete?.();
  }, [onComplete]);
  // The returning-user surface lasts 1.5s in total, including loading. Neither
  // playback events nor failures restart/shorten it, and there is no extra fade.
  useEffect(() => {
    if (!fixedMobileIntro) return;
    const timer = window.setTimeout(complete, MOBILE_RETURNING_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [fixedMobileIntro, complete]);
  const completePlayback = useCallback(() => {
    if (!fixedMobileIntro) complete();
  }, [fixedMobileIntro, complete]);
  useEffect(() => {
    if (showStill || failed) { completePlayback(); return; }
    const video = videoRef.current;
    if (!video) { completePlayback(); return; }
    if (isMobile) {
      // Keep the same clip mounted through interruptions. The animated copy
      // underneath also works when Safari declines video autoplay.
      let active = true;
      let suspended = true;
      let attempt = 0;
      let retries = 0;
      let frame: number | undefined;
      let watchdog: number | undefined;
      let retryTimer: number | undefined;
      const clearPending = () => {
        window.clearTimeout(watchdog);
        window.clearTimeout(retryTimer);
        if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
        frame = undefined;
      };
      const canPlay = () => active && !playbackHiddenRef.current && !document.hidden;
      const suspend = () => {
        suspended = true;
        attempt++;
        clearPending();
        setShowVideo(false);
        video.pause();
      };
      const fail = () => {
        if (!active || suspended) return;
        suspend();
        if (!canPlay()) return;
        completePlayback();
        // Bounded retries; further recovery waits for foreground, connectivity
        // or an actual gesture. Never spin on an autoplay policy rejection.
        if (retries++ < 2) retryTimer = window.setTimeout(resume, 800);
      };
      const playing = () => {
        if (!active || suspended || frame !== undefined) return;
        const currentAttempt = attempt;
        const reveal = () => {
          frame = undefined;
          if (!active || suspended || currentAttempt !== attempt || video.paused || video.readyState < 2) return;
          clearPending();
          retries = 0;
          setShowVideo(true);
          completePlayback();
        };
        if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(reveal);
        else reveal();
      };
      const resume = () => {
        if (!canPlay() || !suspended) return;
        clearPending();
        suspended = false;
        const currentAttempt = ++attempt;
        watchdog = window.setTimeout(fail, SPLASH_TIMEOUT_MS);
        try {
          if (video.error) video.load();
          void video.play()?.catch(() => { if (currentAttempt === attempt) fail(); });
        } catch { fail(); }
        if (!video.paused && video.readyState >= 2) playing();
      };
      const recover = () => {
        if (!canPlay()) return;
        retries = 0;
        if (!video.paused && video.readyState >= 2) { playing(); return; }
        suspend();
        resume();
      };
      const paused = () => {
        if (suspended || !video.paused) return;
        if (!canPlay()) suspend(); else fail();
      };
      const waiting = () => {
        if (!active || suspended) return;
        clearPending();
        setShowVideo(false);
        watchdog = window.setTimeout(fail, SPLASH_TIMEOUT_MS);
      };
      const stalled = () => { if (video.readyState < 3) waiting(); };
      const visibilityChanged = () => { if (document.hidden) suspend(); else recover(); };
      video.addEventListener('playing', playing);
      video.addEventListener('loadeddata', playing);
      video.addEventListener('pause', paused);
      video.addEventListener('ended', paused);
      video.addEventListener('waiting', waiting);
      video.addEventListener('stalled', stalled);
      video.addEventListener('error', fail);
      document.addEventListener('visibilitychange', visibilityChanged);
      document.addEventListener('pointerup', recover);
      document.addEventListener('keydown', recover);
      window.addEventListener('pageshow', recover);
      window.addEventListener('pagehide', suspend);
      window.addEventListener('online', recover);
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
        video.removeEventListener('ended', paused);
        video.removeEventListener('waiting', waiting);
        video.removeEventListener('stalled', stalled);
        video.removeEventListener('error', fail);
        document.removeEventListener('visibilitychange', visibilityChanged);
        document.removeEventListener('pointerup', recover);
        document.removeEventListener('keydown', recover);
        window.removeEventListener('pageshow', recover);
        window.removeEventListener('pagehide', suspend);
        window.removeEventListener('online', recover);
        suspend();
      };
    }
    let active = true;
    let settled = false;
    let revealed = false;
    let attempt = 0;
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
      completePlayback();
    };
    const fail = () => finish(true);
    // While identity is unresolved, keep late frames available: a confirmed
    // guest may switch this same video into the looping welcome.
    const firstFrameTimer = fixedMobileIntro ? undefined : window.setTimeout(fail, FIRST_FRAME_TIMEOUT_MS);
    const deadline = fixedMobileIntro ? undefined : window.setTimeout(fail, SPLASH_TIMEOUT_MS);
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
      if (video.ended) ended(); else if (!fixedMobileIntro) fail();
    };
    const waiting = () => { if (revealed && !fixedMobileIntro) fail(); };
    const stalled = () => { if (revealed && !fixedMobileIntro && video.readyState < 3) fail(); };
    const play = () => {
      const currentAttempt = ++attempt;
      const reject = () => { if (currentAttempt === attempt) fail(); };
      try { void video.play()?.catch(reject); } catch { reject(); }
      if (!video.paused && video.readyState >= 2) playing();
    };
    const visibilityChanged = () => {
      if (document.hidden) { if (fixedMobileIntro) { attempt++; video.pause(); } else fail(); }
      else if (fixedMobileIntro && active && !settled) play();
    };
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
    if (document.hidden) { if (!fixedMobileIntro) fail(); }
    else play();
    return () => {
      active = false;
      attempt++;
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
  }, [showStill, failed, complete, completePlayback, fixedMobileIntro, isMobile, loopLanding, playbackHidden]);

  return (
    <motion.div
      ref={landingRef}
      data-portalink-splash={welcomeMedia ? undefined : 'true'}
      data-presentation={presentation}
      data-share-landing={sceneLanding ? 'true' : undefined}
      data-welcome-handoff={welcomeHandoff || undefined}
      role={welcomeMedia ? 'img' : landing ? 'dialog' : 'status'}
      aria-modal={landing && !hidden ? true : undefined}
      aria-live={landing || welcomeMedia ? undefined : 'polite'}
      aria-label={welcomeMedia ? 'Hello World — Portalink' : landing ? 'Welcome to Portalink' : 'Portalink Networks is opening'}
      aria-hidden={hidden || undefined}
      tabIndex={landing ? -1 : undefined}
      style={hidden ? { display: 'none' } : welcomeHandoff ? { pointerEvents: 'none' } : undefined}
      className={welcomeMedia ? 'portalink-welcome-media' : 'portalink-splash fixed inset-0 z-[1000] grid min-h-[100dvh] w-full place-items-center overflow-hidden'}
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion || fixedMobileIntro ? 0 : landing || welcomeHandoff ? WELCOME_EXIT_SECONDS : SPLASH_EXIT_SECONDS, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="portalink-splash-media" aria-hidden="true" style={{ '--portalink-media-ratio': mediaWidth / mediaHeight } as React.CSSProperties}>
        <div className="portalink-splash-frame">
          <img src={posterSrc} alt="" aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-asset" style={isMobile && showVideo ? { visibility: 'hidden' } : undefined} />
          {!showStill && !failed && <video key={presentation} ref={videoRef} src={videoSrc} poster={isMobile ? undefined : posterSrc} autoPlay={!playbackHidden} loop={isMobile || undefined} muted playsInline preload="auto"
            controls={false} disablePictureInPicture disableRemotePlayback tabIndex={-1}
            aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-asset portalink-splash-video"
            style={{ opacity: showVideo ? 1 : 0 }} />}
        </div>
      </div>
      {sceneLanding && <div className="mobile-share-landing-actions" aria-busy={!sceneLanding.ready}>
        <button type="button" className="mobile-share-create" disabled={!sceneLanding.ready} onClick={sceneLanding.onCreateAccount}>Create account</button>
        <div className="mobile-share-secondary">
          <button type="button" className="mobile-share-signin" disabled={!sceneLanding.ready} onClick={sceneLanding.onSignIn}>Sign in</button>
          <button type="button" className="mobile-share-forgot" disabled={!sceneLanding.ready} onClick={sceneLanding.onForgotPassword}>Forgot password?</button>
          <button type="button" className="mobile-share-guest" disabled={!sceneLanding.ready} onClick={sceneLanding.onContinue}>{sceneLanding.continueLabel}</button>
        </div>
        {!sceneLanding.ready && <span role="status" className="sr-only">Opening Portalink…</span>}
      </div>}
    </motion.div>
  );
}
