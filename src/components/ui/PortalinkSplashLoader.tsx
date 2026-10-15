import './portalink-welcome-mobile.css';
import { SPLASH_POSTER_DATA_URL } from './splashPoster';
import { motionSeconds, motionCurve } from '../../presentation/motion/motion';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useViewportPresentation } from '../../presentation/useViewportPresentation';
import { useModalFocus } from '../../hooks/useModalFocus';

const SPLASH_TIMEOUT_MS = 2200;
const PRIMARY_LOAD_TIMEOUT_MS = 10_000;
const FALLBACK_CYCLE_MS = 1500;

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
  const isMobile = presentation === 'mobile' || welcomeMedia || Boolean(landing) || welcomeHandoff;
  const loopLanding = isMobile && (Boolean(landing) || welcomeHandoff);
  const mobileStartupIntro = isMobile && !loopLanding && !welcomeMedia && !stillOnly;
  const fixedMobileIntro = mobileStartupIntro && timedIntro;
  const playbackHidden = hidden;
  const playbackHiddenRef = useRef(playbackHidden);
  playbackHiddenRef.current = playbackHidden;
  const videoSrc = '/portalink-splash-mobile.mp4?v=9c1a9457';
  const animatedBackupSrc = '/portalink-welcome-loop.webp?v=307bdea0';
  const mediaWidth = 512;
  const mediaHeight = 720;
  const shouldReduceMotion = useReducedMotion();
  // MOBILE always uses the requested animation; motion preferences still remove the exit fade.
  const showStill = (stillOnly && !loopLanding && !welcomeMedia) || (!isMobile && shouldReduceMotion);
  const [startupVideo] = useState<HTMLVideoElement | null>(() => {
    if (welcomeMedia || showStill || typeof document.getElementById !== 'function') return null;
    const candidate = document.getElementById('portalink-preboot-video');
    return candidate?.tagName === 'VIDEO' && candidate.dataset.portalinkAdopted !== 'true' ? candidate as HTMLVideoElement : null;
  });
  const [introComplete, setIntroComplete] = useState(() => startupVideo
    ? startupVideo.ended && startupVideo.dataset.portalinkPainted === 'true'
    : showStill || Boolean(landing) || welcomeMedia || welcomeHandoff);
  const endedBeforeAdoption = useRef(Boolean(startupVideo?.ended && startupVideo.dataset.portalinkPainted === 'true'));
  const introPending = !introComplete && !showStill && !welcomeMedia;
  const playbackModeRef = useRef({ loop: loopLanding || welcomeMedia, introPending });
  playbackModeRef.current = { loop: loopLanding || welcomeMedia, introPending };
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoHostRef = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const [backupRequested, setBackupRequested] = useState(false);
  const [backupReady, setBackupReady] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const backupReadyRef = useRef(false);
  const backupFailedRef = useRef(false);
  const backupEventRef = useRef<((ready: boolean) => void) | null>(null);
  const [showVideo, setShowVideo] = useState(() => startupVideo?.dataset.portalinkPainted === 'true');
  const landingRef = useRef<HTMLDivElement>(null);
  const lastLanding = useRef(landing);
  if (landing) lastLanding.current = landing;
  // Keep the exact white scene geometry while a completed sign-in fades it out.
  const sceneLanding = introPending ? undefined : landing ?? (welcomeHandoff ? lastLanding.current : undefined);
  useModalFocus(Boolean(landing && sceneLanding) && !hidden, landingRef, () => landing?.onContinue(), true);
  const complete = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onComplete?.();
  }, [onComplete]);
  useLayoutEffect(() => {
    if (welcomeMedia) return;
    const preboot = typeof document.getElementById === 'function' ? document.getElementById('portalink-preboot') : null;
    if (startupVideo && videoHostRef.current) {
      // Move the already-playing native element, rather than replacing it with
      // a second download/decoder or rewinding the opening frames.
      videoHostRef.current.appendChild(startupVideo);
      videoRef.current = startupVideo;
      startupVideo.dispatchEvent(new Event('portalink:splash-adopt'));
      startupVideo.dataset.portalinkAdopted = 'true';
      startupVideo.removeAttribute('id');
      startupVideo.className = 'portalink-splash-asset portalink-splash-video';
      Object.assign(startupVideo.style, { position: 'absolute', inset: '0', display: 'block', width: '100%', height: '100%', objectFit: 'fill', background: 'var(--portalink-splash-background)' });
      startupVideo.controls = false;
      startupVideo.disablePictureInPicture = true;
      startupVideo.disableRemotePlayback = true;
      startupVideo.tabIndex = -1;
      startupVideo.setAttribute('aria-hidden', 'true');
    } else if (preboot) {
      const unusedVideo = document.getElementById('portalink-preboot-video') as HTMLVideoElement | null;
      unusedVideo?.dispatchEvent(new Event('portalink:splash-adopt'));
      unusedVideo?.pause();
    }
    // The React poster is already committed underneath, including when WEB
    // reduced motion deliberately keeps the opening scene still.
    preboot?.remove();
  }, [startupVideo, welcomeMedia]);
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.loop = (loopLanding || welcomeMedia) && !introPending;
    if (startupVideo) video.style.opacity = showVideo && !showBackup ? '1' : '0';
  }, [introPending, loopLanding, welcomeMedia, showVideo, showBackup, startupVideo]);
  useEffect(() => {
    if (showStill) { complete(); return; }
    const video = videoRef.current;
    if (!video) { complete(); return; }
    let active = true, suspended = true, playingAttempt = false, finished = false;
    let attempt = 0, retries = 0, painted = video.dataset?.portalinkPainted === 'true', fallbackActive = false;
    let lastReadiness = '', lastProgress = -1;
    let primaryExpired = false, primaryUnavailable = false;
    let frame: number | undefined, watchdog: number | undefined, retryTimer: number | undefined;
    let backupTimer: number | undefined, cycleTimer: number | undefined;
    let primaryTimer: number | undefined;
    const canPlay = () => active && !playbackHiddenRef.current && !document.hidden && !finished;
    const clearPlayback = () => {
      window.clearTimeout(watchdog); window.clearTimeout(retryTimer);
      if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
      frame = undefined; watchdog = undefined;
    };
    const clearBackup = () => {
      window.clearTimeout(backupTimer); window.clearTimeout(cycleTimer);
      backupTimer = undefined; cycleTimer = undefined;
    };
    const clearPrimary = () => { window.clearTimeout(primaryTimer); primaryTimer = undefined; };
    const unavailable = (error: unknown) => typeof error === 'object' && error !== null && 'name' in error
      && typeof error.name === 'string' && ['NotAllowedError', 'NotSupportedError'].includes(error.name);
    const canUseBackup = () => painted || primaryUnavailable || primaryExpired;
    const finishBackup = () => {
      if (!canPlay() || !fallbackActive) return;
      clearBackup();
      // A slow cold download is still a healthy candidate. Backup loading has
      // its own shorter bound, but static artwork cannot cut off the primary
      // clip's first real frame while its initial loading window remains open.
      if (!canUseBackup()) return;
      clearPrimary();
      setIntroComplete(true);
      complete();
    };
    const adoptBackup = () => {
      if (!canPlay() || !fallbackActive) return;
      window.clearTimeout(backupTimer); backupTimer = undefined;
      if (!backupReadyRef.current) { finishBackup(); return; }
      // Even a cached animation must not replace a still-loading healthy
      // primary clip. Its full loading opportunity takes priority.
      if (!canUseBackup()) return;
      setShowBackup(true);
      if (cycleTimer === undefined) cycleTimer = window.setTimeout(finishBackup, FALLBACK_CYCLE_MS);
    };
    const requestBackup = () => {
      fallbackActive = true;
      setBackupRequested(true);
      if (backupReadyRef.current) { adoptBackup(); return; }
      if (backupFailedRef.current) { finishBackup(); return; }
      if (backupTimer === undefined) backupTimer = window.setTimeout(finishBackup, SPLASH_TIMEOUT_MS);
    };
    const backupEvent = (ready: boolean) => {
      if (!active || !fallbackActive) return;
      if (ready) adoptBackup(); else finishBackup();
    };
    backupEventRef.current = backupEvent;
    const suspend = (pausePrimary = false) => {
      suspended = true; playingAttempt = false; attempt++;
      clearPlayback();
      if (pausePrimary) { clearBackup(); clearPrimary(); }
      video.pause();
    };
    const fail = () => {
      if (!active || suspended || finished) return;
      suspend();
      // A brief stall keeps the last real frame. If decoding itself failed,
      // the always-present inline artwork covers the invalid video surface.
      if (video.error) { primaryUnavailable = true; setShowVideo(false); }
      if (!canPlay()) return;
      requestBackup();
      if (retries++ < 2) retryTimer = window.setTimeout(() => resume(), 800);
    };
    const armWatchdog = () => {
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(fail, SPLASH_TIMEOUT_MS);
    };
    const reveal = (currentAttempt: number) => {
      frame = undefined;
      if (!canPlay() || suspended || currentAttempt !== attempt || video.paused || video.readyState < 2) return;
      painted = true; retries = 0; fallbackActive = false;
      if (video.dataset) video.dataset.portalinkPainted = 'true';
      clearPrimary();
      clearBackup(); window.clearTimeout(retryTimer);
      setShowVideo(true); setShowBackup(false);
      // Healthy startup finishes only at its natural end, never on a clock
      // that also runs while decoding, buffering or the page is backgrounded.
      if (playbackModeRef.current.loop && !playbackModeRef.current.introPending) { window.clearTimeout(watchdog); watchdog = undefined; complete(); }
      else armWatchdog();
    };
    const playing = () => {
      if (!canPlay() || suspended || frame !== undefined) return;
      const currentAttempt = attempt;
      if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(() => reveal(currentAttempt));
      else reveal(currentAttempt);
    };
    const play = () => {
      if (!canPlay() || suspended || playingAttempt) return;
      playingAttempt = true;
      const currentAttempt = ++attempt;
      armWatchdog();
      try {
        if (video.ended) video.currentTime = 0;
        void video.play()?.catch((error: unknown) => {
          if (!active || currentAttempt !== attempt) return;
          primaryUnavailable ||= unavailable(error);
          fail();
        });
      } catch (error) {
        primaryUnavailable ||= unavailable(error);
        fail();
      }
      if (!video.paused && video.readyState >= 2) playing();
    };
    const ready = () => {
      if (!canPlay() || video.readyState < 2 || playingAttempt) return;
      const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
      const readiness = `${video.readyState}:${end}:${video.currentTime}`;
      if (suspended) {
        // Newly decoded/buffered data may recover even after automatic retries.
        // Repeated events for identical cached readiness cannot spin on a
        // rejected autoplay attempt or restart its bounded retries.
        if (readiness === lastReadiness) return;
        clearPlayback(); suspended = false; retries = 0; armWatchdog();
      }
      lastReadiness = readiness;
      play();
    };
    const resume = () => {
      if (!canPlay() || !suspended) return;
      clearPlayback(); suspended = false;
      if (!painted && !primaryExpired && primaryTimer === undefined) {
        primaryTimer = window.setTimeout(() => {
          primaryTimer = undefined; primaryExpired = true;
          if (fallbackActive) {
            if (backupReadyRef.current) adoptBackup(); else finishBackup();
          } else fail();
        }, PRIMARY_LOAD_TIMEOUT_MS);
      }
      if (video.error) { lastReadiness = ''; video.load(); }
      if (fallbackActive) requestBackup();
      armWatchdog();
      // A play request also primes Safari when preload has not decoded data.
      // Frame confirmation still owns visibility and natural ended completion.
      play();
    };
    const recover = () => {
      if (!canPlay()) return;
      retries = 0;
      if (!video.paused && video.readyState >= 2) { suspended = false; playing(); return; }
      suspend(); resume();
    };
    const gesture = () => recover();
    const ended = () => {
      if (!active || suspended || finished || !video.ended) return;
      if (!painted) { fail(); return; }
      if (playbackModeRef.current.introPending) setIntroComplete(true);
      if (playbackModeRef.current.loop) {
        // The initial clip has now really ended. A guest welcome can begin its
        // independent loop without moving/restarting the introductory clip.
        video.loop = true;
        playingAttempt = false;
        complete();
        play();
        return;
      }
      finished = true; clearPlayback(); clearBackup();
      video.pause(); complete();
    };
    const paused = () => {
      if (suspended || !video.paused || finished) return;
      if (video.ended) ended();
      else if (!canPlay()) suspend();
      else fail();
    };
    const waiting = () => {
      if (!active || suspended || finished) return;
      // Retain the painted video while a small buffer gap recovers.
      if (watchdog === undefined) armWatchdog();
    };
    const progress = () => {
      if (!active || suspended || finished || video.paused || video.readyState < 2) return;
      if (video.currentTime === lastProgress) return;
      lastProgress = video.currentTime;
      if (playbackModeRef.current.loop && !playbackModeRef.current.introPending) { window.clearTimeout(watchdog); watchdog = undefined; }
      else armWatchdog();
    };
    const stalled = () => { if (video.readyState < 3) waiting(); };
    const visibilityChanged = () => { if (document.hidden) suspend(true); else recover(); };
    const pageHidden = () => suspend(true);
    video.addEventListener('canplaythrough', ready);
    video.addEventListener('canplay', ready);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', playing);
    video.addEventListener('timeupdate', progress);
    video.addEventListener('ended', ended);
    video.addEventListener('pause', paused);
    video.addEventListener('waiting', waiting);
    video.addEventListener('stalled', stalled);
    video.addEventListener('error', fail);
    document.addEventListener('visibilitychange', visibilityChanged);
    document.addEventListener('pointerup', gesture);
    document.addEventListener('keydown', gesture);
    const restored = () => recover();
    window.addEventListener('pageshow', restored);
    window.addEventListener('pagehide', pageHidden);
    window.addEventListener('online', restored);
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    if (painted && endedBeforeAdoption.current) {
      endedBeforeAdoption.current = false;
      setIntroComplete(true);
      if (playbackModeRef.current.loop) { complete(); resume(); }
      else { finished = true; complete(); }
    }
    else if (painted && video.ended) { suspended = false; ended(); }
    else if (document.hidden || playbackHiddenRef.current) suspend(true);
    else if (!video.paused && video.readyState >= 2) { suspended = false; playingAttempt = true; armWatchdog(); playing(); }
    else resume();
    return () => {
      active = false;
      if (backupEventRef.current === backupEvent) backupEventRef.current = null;
      video.removeEventListener('canplaythrough', ready);
      video.removeEventListener('canplay', ready);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('playing', playing);
      video.removeEventListener('timeupdate', progress);
      video.removeEventListener('ended', ended);
      video.removeEventListener('pause', paused);
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('stalled', stalled);
      video.removeEventListener('error', fail);
      document.removeEventListener('visibilitychange', visibilityChanged);
      document.removeEventListener('pointerup', gesture);
      document.removeEventListener('keydown', gesture);
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('pagehide', pageHidden);
      window.removeEventListener('online', restored);
      suspend(true);
    };
  }, [showStill, complete, playbackHidden]);

  return (
    <motion.div
      ref={landingRef}
      data-portalink-splash={welcomeMedia ? undefined : 'true'}
      data-presentation={presentation}
      data-share-landing={sceneLanding ? 'true' : undefined}
      data-startup-playing={introPending ? 'true' : undefined}
      data-welcome-handoff={welcomeHandoff || undefined}
      role={welcomeMedia ? 'img' : landing && sceneLanding ? 'dialog' : 'status'}
      aria-modal={landing && sceneLanding && !hidden ? true : undefined}
      aria-live={sceneLanding || welcomeMedia ? undefined : 'polite'}
      aria-label={welcomeMedia ? 'Hello World — Portalink' : sceneLanding ? 'Welcome to Portalink' : 'Portalink Networks is opening'}
      aria-hidden={hidden || undefined}
      tabIndex={landing && sceneLanding ? -1 : undefined}
      style={hidden ? { display: 'none' } : welcomeHandoff ? { pointerEvents: 'none' } : undefined}
      className={welcomeMedia ? 'portalink-welcome-media' : 'portalink-splash fixed inset-0 z-[1000] grid min-h-[100dvh] w-full place-items-center overflow-hidden'}
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion || fixedMobileIntro ? 0 : motionSeconds('base'), ease: motionCurve() }}
    >
      <div className="portalink-splash-media" aria-hidden="true" style={{ '--portalink-media-ratio': mediaWidth / mediaHeight } as React.CSSProperties}>
        <div className="portalink-splash-frame">
          <img src={SPLASH_POSTER_DATA_URL} alt="" aria-hidden="true" width={mediaWidth} height={mediaHeight} decoding="sync" className="portalink-splash-asset" />
          {!showStill && backupRequested && <img src={animatedBackupSrc} alt="" aria-hidden="true" width={mediaWidth} height={mediaHeight}
            className="portalink-splash-asset" style={{ opacity: backupReady && showBackup ? 1 : 0 }}
            onLoad={() => { backupReadyRef.current = true; setBackupReady(true); backupEventRef.current?.(true); }}
            onError={() => { backupFailedRef.current = true; backupEventRef.current?.(false); }} />}
          {!showStill && (startupVideo ? <div ref={videoHostRef} className="portalink-splash-asset portalink-splash-video-host" style={{ background: 'transparent' }} /> : <video key={presentation} ref={videoRef} src={videoSrc} autoPlay loop={(loopLanding || welcomeMedia) && !introPending} muted playsInline preload="auto"
            controls={false} disablePictureInPicture disableRemotePlayback tabIndex={-1}
            aria-hidden="true" width={mediaWidth} height={mediaHeight} className="portalink-splash-asset portalink-splash-video"
            style={{ opacity: showVideo && !showBackup ? 1 : 0 }} />)}
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
