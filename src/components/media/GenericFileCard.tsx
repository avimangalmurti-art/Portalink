import React from 'react';
import { FileIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { formatFileSize } from '../../features/publishing/mediaRules';
import { processingLabel } from '../../features/publishing/assetTypes';
import type { ProjectAttachment } from '../../types/domain';

/**
 * The truthful presentation for anything the browser cannot render. It states
 * what the file is rather than pretending to show it, and offers the only
 * action that is real in the prototype: opening the local file.
 */
export function GenericFileCard({
  attachment


}: {attachment: ProjectAttachment;}) {
  const state = processingLabel(attachment.status);
  return <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-[420px] rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-left">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
            <FileIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]" title={attachment.fileName}>{attachment.displayName}</p>
            <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
              {attachment.typeLabel}
              {attachment.sizeBytes > 0 && ` · ${formatFileSize(attachment.sizeBytes)}`}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {state ?? 'This format cannot be displayed in the browser.'} The original file is preserved.
        </p>
        {attachment.sourceUrl && <div className="mt-4">
            <Button variant="secondary" onClick={() => window.open(attachment.sourceUrl ?? '', '_blank', 'noopener')}>Open file</Button>
          </div>}
      </div>
    </div>;
}