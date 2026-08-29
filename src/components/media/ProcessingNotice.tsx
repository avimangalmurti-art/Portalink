import React from 'react';
import { AlertCircleIcon, Loader2Icon } from 'lucide-react';
import { Button } from '../ui/Button';
import { formatFileSize } from '../../features/publishing/mediaRules';
import type { ProjectAttachment } from '../../types/domain';

/**
 * What a stored file looks like while its preview does not exist yet.
 *
 * The bytes are safe — that is stated plainly, because it is the part that
 * matters and it is the part a spinner over an empty frame fails to say. Nothing
 * here implies a thumbnail, a page render, or a transcode already happened, and a
 * failed job offers re-running THAT job rather than re-uploading a file that is
 * already stored.
 */
export function ProcessingNotice({
  attachment,
  state,
  message,
  canRetry,
  isRetrying,
  onRetry







}: {attachment: ProjectAttachment;state: 'processing' | 'processing-failed';message: string | null;canRetry: boolean;isRetrying: boolean;onRetry: () => void;}) {
  const isFailed = state === 'processing-failed';
  return <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-[440px] rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-left">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
            {isFailed ? <AlertCircleIcon className="h-5 w-5" /> : <Loader2Icon className="h-5 w-5 animate-spin motion-reduce:animate-none" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]" title={attachment.fileName}>{attachment.displayName}</p>
            <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
              {attachment.typeLabel}
              {attachment.sizeBytes > 0 && ` · ${formatFileSize(attachment.sizeBytes)}`}
            </p>
          </div>
        </div>

        {/* Announced, so a state that changes without a visual cue is not silent
           for a screen reader. */}
        <p role={isFailed ? 'alert' : 'status'} aria-live="polite" className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {message ?? (isFailed ? 'This file is stored safely, but its preview could not be prepared.' : 'This file is stored safely. Its preview is still being prepared, so there is nothing to show yet.')}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-tertiary)]">
          {isFailed ? 'Nothing was lost — only the preview is missing. The original file is unchanged.' : 'The original file is already saved, so nothing needs uploading again.'}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canRetry && <Button variant="secondary" onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? 'Starting…' : 'Prepare preview again'}
            </Button>}
          {/* The file itself is always reachable, preview or not. */}
          {attachment.sourceUrl && <Button variant="secondary" onClick={() => window.open(attachment.sourceUrl ?? '', '_blank', 'noopener')}>Open file</Button>}
        </div>
      </div>
    </div>;
}