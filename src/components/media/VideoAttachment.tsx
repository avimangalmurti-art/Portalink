import React, { useState } from 'react';
import { ErrorState, LoadingState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';
import { videoSources } from '../../features/media/videoPlayback';
import { Button } from '../ui/Button';
import { useProfileData } from '../../contexts/ProfileDataContext';

type ConversionRetry = { canRetry: boolean; isRetrying: boolean; onRetry: () => void; state?: ProjectAttachment['status']; message?: string | null };

/**
 * Native video controls are kept intact — they are the accessible ones — and
 * the element is never substituted with a still image.
 */
export function VideoAttachment({
  attachment, conversion


}: {attachment: ProjectAttachment; conversion?: ConversionRetry;}) {
  const sources = videoSources(attachment);
  return <VideoPlayback key={JSON.stringify([attachment.id, ...sources])} attachment={attachment} sources={sources} conversion={conversion} />;
}

function VideoPlayback({ attachment, sources, conversion }: { attachment: ProjectAttachment; sources: string[]; conversion?: ConversionRetry }) {
  const { invalidateProfiles } = useProfileData();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  const source = sources[sourceIndex];
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
        setAttempt((current) => current + 1);
      }} />
      {conversion?.canRetry && <div className="mt-3"><Button onClick={conversion.onRetry} disabled={conversion.isRetrying}>{conversion.isRetrying ? 'Preparing video…' : 'Prepare playable video'}</Button></div>}
      {attachment.sourceUrl && <a href={attachment.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 text-[var(--accent-text)] underline">Open original file</a>}
      </div>;
  }
  return <div className="relative flex h-full w-full items-center justify-center p-3">
      {status === 'loading' && <div className="pointer-events-none absolute left-0 right-0 top-3 z-10"><LoadingState label={`Loading ${attachment.displayName}`} /></div>}
      <video key={`${attempt}:${sourceIndex}`} src={source} controls muted playsInline preload="metadata" aria-label={attachment.displayName} onLoadedMetadata={() => setStatus('ready')} onPlay={() => setStatus('ready')} onError={event => {
        if (sourceIndex + 1 < sources.length) {
          setSourceIndex(sourceIndex + 1);
          setStatus('loading');
          return;
        }
        setUnsupported(event.currentTarget.error?.code === 3 || event.currentTarget.error?.code === 4);
        setStatus('error');
      }} className="max-h-full w-full max-w-full rounded-[10px] bg-black" />
    </div>;
}
