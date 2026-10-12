import {useOwnerRecord} from '../record/OwnerRecordProvider';
import {relevantRow} from '../record/model';
import {RecordSingleLine} from '../record/RecordBlock';
import React from 'react';
import { CheckCircle2Icon } from 'lucide-react';

/** A polite, non-blocking announcement outside both the dialog and route layer. */
export function PublishConfirmation({ message,projectId }: { message: string | null;projectId?:string }) {
  const record=useOwnerRecord(),hasStep=record?.status&&relevantRow(record.status,'publish',projectId);
  return <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[100] flex justify-center">
    {message && <div className="pointer-events-auto flex w-fit max-w-[420px] items-start gap-2 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-primary)] shadow-lg">
      <CheckCircle2Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
      <span className="min-w-0 break-words">{hasStep?<RecordSingleLine scope="publish" projectId={projectId}/>:message}</span>
    </div>}
  </div>;
}
