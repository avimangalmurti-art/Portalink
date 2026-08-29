import React, { useState } from 'react';
import { ErrorState, LoadingState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';

/**
 * Native video controls are kept intact — they are the accessible ones — and
 * the element is never substituted with a still image.
 */
export function VideoAttachment({
  attachment


}: {attachment: ProjectAttachment;}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  if (!attachment.sourceUrl) {
    return <div className="flex h-full items-center justify-center p-8">
        <ErrorState title="Nothing to play yet" description={`${attachment.displayName} has no playable source in this session.`} />
      </div>;
  }
  if (status === 'error') {
    return <div className="flex h-full items-center justify-center p-8">
        <ErrorState title="This video could not be played" description={attachment.fileName} onRetry={() => {
        setStatus('loading');
        setAttempt((current) => current + 1);
      }} />
      </div>;
  }
  return <div className="flex h-full w-full flex-col items-center justify-center p-6">
      {status === 'loading' && <LoadingState label={`Loading ${attachment.displayName}`} />}
      <video key={attempt} src={attachment.sourceUrl} controls preload="metadata" aria-label={attachment.displayName} onLoadedMetadata={() => setStatus('ready')} onError={() => setStatus('error')} className={`max-h-full max-w-full rounded-[10px] bg-black ${status === 'ready' ? '' : 'hidden'}`} />
    </div>;
}