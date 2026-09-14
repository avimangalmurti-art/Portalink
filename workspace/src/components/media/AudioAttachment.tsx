import React, { useState } from 'react';
import { AudioLinesIcon } from 'lucide-react';
import { ErrorState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';

/**
 * A real audio file plays through the native element — its transport is the
 * accessible one, and the duration comes from the file rather than being
 * derived. The synthetic player is reserved for seeded work that has no file.
 */
export function AudioAttachment({
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
        <ErrorState title="This track could not be played" description={attachment.fileName} onRetry={() => {
        setStatus('loading');
        setAttempt((current) => current + 1);
      }} />
      </div>;
  }
  return <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-[520px] text-center">
        <span aria-hidden="true" className="mx-auto flex h-24 w-24 items-center justify-center rounded-[12px] bg-[var(--surface-inset)] ring-1 ring-[var(--hairline)]">
          <AudioLinesIcon className="h-8 w-8" style={{
          color: 'var(--studio-audio)'
        }} />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-[var(--text-primary)]">{attachment.displayName}</p>
        <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{attachment.typeLabel}</p>
        <audio key={attempt} src={attachment.sourceUrl} controls preload="metadata" aria-label={attachment.displayName} onLoadedMetadata={() => setStatus('ready')} onError={() => setStatus('error')} className="mt-5 w-full" />
      </div>
    </div>;
}