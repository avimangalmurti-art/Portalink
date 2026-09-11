import React, { useState } from 'react';
import { ErrorState, LoadingState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';
import { videoSource } from '../../features/media/videoPlayback';
import { Button } from '../ui/Button';
import { useProfileData } from '../../contexts/ProfileDataContext';

type ConversionRetry = { canRetry: boolean; isRetrying: boolean; onRetry: () => void };

/**
 * Native video controls are kept intact — they are the accessible ones — and
 * the element is never substituted with a still image.
 */
export function VideoAttachment({
  attachment, conversion


}: {attachment: ProjectAttachment; conversion?: ConversionRetry;}) {
  const source = videoSource(attachment);
  return <VideoPlayback key={`${attachment.id}:${source}`} attachment={attachment} source={source} conversion={conversion} />;
}

function VideoPlayback({ attachment, source, conversion }: { attachment: ProjectAttachment; source: string | null; conversion?: ConversionRetry }) {
  const { invalidateProfiles } = useProfileData();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  if (!source) {
    return <div className="flex h-full flex-col items-center justify-center p-8">
        <ErrorState title="Nothing to play yet" description={`${attachment.displayName} has no playable source in this session.`} onRetry={invalidateProfiles} />
      </div>;
  }
  if (status === 'error') {
    return <div className="flex h-full flex-col items-center justify-center p-8">
        <ErrorState title="This video could not be played" description={attachment.fileName} onRetry={() => {
        invalidateProfiles();
        setStatus('loading');
        setAttempt((current) => current + 1);
      }} />
      {conversion?.canRetry && <div className="mt-3"><Button onClick={conversion.onRetry} disabled={conversion.isRetrying}>{conversion.isRetrying ? 'Preparing video…' : 'Prepare playable video'}</Button></div>}
      {attachment.sourceUrl && <a href={attachment.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 text-[var(--accent-text)] underline">Open original file</a>}
      </div>;
  }
  return <div className="flex h-full w-full flex-col items-center justify-center p-6">
      {status === 'loading' && <LoadingState label={`Loading ${attachment.displayName}`} />}
      <video key={attempt} src={source} controls playsInline preload="metadata" aria-label={attachment.displayName} onLoadedMetadata={() => setStatus('ready')} onError={() => setStatus('error')} className={`max-h-full max-w-full rounded-[10px] bg-black ${status === 'ready' ? '' : 'opacity-0'}`} />
    </div>;
}
