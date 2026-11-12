import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';
import { videoSources } from '../../features/media/videoPlayback';
import { Button } from '../ui/Button';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { usePresentation } from '../../presentation/usePresentation';

type ConversionRetry = { canRetry: boolean; isRetrying: boolean; onRetry: () => void; state?: ProjectAttachment['status']; message?: string | null };

/**
 * Native video controls are kept intact — they are the accessible ones — and
 * the element is never substituted with a still image.
 */
export function VideoAttachment({
  attachment, conversion, active = true, inlinePreview = false


}: {attachment: ProjectAttachment; conversion?: ConversionRetry; active?: boolean; inlinePreview?: boolean;}) {
  const sources = videoSources(attachment);
  return <VideoPlayback key={JSON.stringify([attachment.id, ...sources])} attachment={attachment} sources={sources} conversion={conversion} active={active} inlinePreview={inlinePreview} />;
}

function VideoPlayback({ attachment, sources, conversion, active, inlinePreview }: { attachment: ProjectAttachment; sources: string[]; conversion?: ConversionRetry; active: boolean; inlinePreview: boolean }) {
  const { invalidateProfiles } = useProfileData();
  const isMobile = usePresentation() === 'mobile';
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  const [controlsRequested, setControlsRequested] = useState(false);
  const source = sources[sourceIndex];
  const videoRef = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!active) video?.pause();
    return () => video?.pause();
  }, [active, attempt, sourceIndex]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      setControlsRequested(false);
    } else if (isMobile && !inlinePreview) {
      // A newly selected clip always starts with sound, even when this retained
      // queue element was muted earlier. Do not override mute during rerenders.
      video.defaultMuted = false;
      video.muted = false;
      void video.play().catch(() => { /* Audible autoplay may require the first tap. */ });
    }
  }, [active, attempt, sourceIndex, isMobile, inlinePreview]);
  const revealPlayerControls = (video: HTMLVideoElement) => {
    if (!isMobile || !active || controlsRequested) return;
    setControlsRequested(true);
    // Play in the gesture itself so Safari can authorize sound. Later taps
    // belong to the native scrubber, AirPlay and transport controls.
    video.muted = false;
    void video.play().catch(() => { /* Keep native retry controls available. */ });
  };
  if (!source) {
    return <div className="flex h-full flex-col items-center justify-center p-8">
        <ErrorState title="Nothing to play yet" description={`${attachment.displayName} has no playable source in this session.`} onRetry={invalidateProfiles} />
      </div>;
  }
  if (status === 'error') {
    const conversionMessage = conversion?.state === 'processing' || conversion?.state === 'processing-failed'
      ? conversion.message ?? (conversion.state === 'processing' ? 'Preparing a compatible video…' : 'The compatible video copy could not be prepared.')
      : null;
    return <div className="flex h-full flex-col items-center justify-center p-8">
        <ErrorState title={unsupported ? 'This browser could not play this video' : 'This video could not be loaded'} description={conversionMessage ?? (unsupported ? 'A compatible playback copy may be needed. You can still open the original file.' : attachment.fileName)} onRetry={() => {
        invalidateProfiles();
        setStatus('loading');
        setSourceIndex(0);
        setUnsupported(false);
        setControlsRequested(false);
        setAttempt((current) => current + 1);
      }} />
      {conversion?.canRetry && <div className="mt-3"><Button onClick={conversion.onRetry} disabled={conversion.isRetrying}>{conversion.isRetrying ? 'Preparing video…' : 'Prepare playable video'}</Button></div>}
      {attachment.sourceUrl && <a href={attachment.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 text-[var(--accent-text)] underline">Open original file</a>}
      </div>;
  }
  return <div className={`relative flex h-full w-full items-center justify-center p-3${isMobile ? ' mobile-video-playback' : ''}`}>
      {status === 'loading' && <div className="pointer-events-none absolute left-0 right-0 top-3 z-10"><LoadingState label={`Loading ${attachment.displayName}`} /></div>}
      <video ref={videoRef} key={`${attempt}:${sourceIndex}`} src={source} autoPlay={active && !inlinePreview} loop={!inlinePreview && isMobile || undefined}
        controls={inlinePreview || (isMobile ? active && controlsRequested : true)} muted={inlinePreview ? false : !isMobile}
        data-video-controls-requested={isMobile ? active && controlsRequested : undefined}
        tabIndex={inlinePreview ? 0 : isMobile ? (active ? 0 : -1) : undefined}
        onClick={inlinePreview ? undefined : event => revealPlayerControls(event.currentTarget)}
        onKeyDown={event => {
          if (!inlinePreview && isMobile && active && !controlsRequested && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            revealPlayerControls(event.currentTarget);
          }
        }}
        playsInline preload="metadata" aria-label={!inlinePreview && isMobile && !controlsRequested ? `${attachment.displayName}. Tap to play with sound and show controls.` : attachment.displayName}
        onLoadedMetadata={() => setStatus('ready')} onPlay={event => { if (!active) event.currentTarget.pause(); else setStatus('ready'); }} onError={event => {
        if (sourceIndex + 1 < sources.length) {
          setSourceIndex(sourceIndex + 1);
          setControlsRequested(false);
          setStatus('loading');
          return;
        }
        setUnsupported(event.currentTarget.error?.code === 3 || event.currentTarget.error?.code === 4);
        setStatus('error');
      }} className="max-h-full w-full max-w-full rounded-[10px] bg-black" />
    </div>;
}
