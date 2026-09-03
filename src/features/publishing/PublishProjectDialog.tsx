import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircleIcon, CheckCircle2Icon, InfoIcon, XIcon } from 'lucide-react';
import { ProfileField } from '../../components/profile/ProfileField';
import { MediaPicker } from '../../components/publishing/MediaPicker';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { usePublishProject } from './usePublishProject';
import { SUMMARY_MAX_LENGTH, TITLE_MAX_LENGTH } from './validation';

/**
 * Creating a project inside a category the signed-in account owns.
 *
 * Presentation only: the draft, validation, media rules, and publish request
 * all live in `usePublishProject`. Ownership is enforced by the caller and
 * re-checked by the service — hiding this dialog is UX, not authorization.
 */
type PublishProjectDialogProps = {
  isOpen: boolean;
  profileId: string | null;
  categoryId: string | null;
  categoryLabel: string;
  onClose: () => void;
  onPublished: (projectId: string) => void;
};
export function PublishProjectDialog({
  isOpen,
  profileId,
  categoryId,
  categoryLabel,
  onClose,
  onPublished
}: PublishProjectDialogProps) {
  const publishFlow = usePublishProject(profileId, categoryId, isOpen, categoryLabel);
  const shouldReduceMotion = useReducedMotion();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const uploadErrorRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const {
    step,
    state,
    isDirty,
    media
  } = publishFlow;
  const isPublishing = state === 'publishing';
  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingDiscard(false);
    }
  }, [isOpen]);

  // Escape asks first, and never interrupts a publish in flight.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || isPublishing) {
        return;
      }
      // An upload in progress is never abandoned by a keystroke.
      if (publishFlow.hasUploadInFlight) {
        return;
      }
      if (isDirty && step !== 'done') {
        setIsConfirmingDiscard(true);
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, isDirty, isPublishing, step, onClose, publishFlow.hasUploadInFlight]);
  // A refused upload takes focus, because it needs a decision: retry the same
  // files, or go back and change them.
  useEffect(() => {
    if (publishFlow.upload.failure) {
      uploadErrorRef.current?.focus();
    }
  }, [publishFlow.upload.failure]);
  useEffect(() => {
    if (isOpen && step === 'metadata' && publishFlow.draft) {
      const frame = requestAnimationFrame(() => document.getElementById('publish-add-files')?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [isOpen, step, publishFlow.draft]);
  useEffect(() => {
    // The completed result announces itself after the one-page form publishes.
    if (step === 'done') {
      stepHeadingRef.current?.focus();
    }
  }, [step]);
  useEffect(() => {
    if (state === 'failed') {
      errorRef.current?.focus();
    }
  }, [state]);
  // A failed validation pass moves focus to the first field that needs
  // attention, so the reason is read rather than merely displayed.
  useEffect(() => {
    if (!publishFlow.invalidField) {
      return;
    }
    const field = document.getElementById(`publish-${publishFlow.invalidField === 'summary' ? 'summary' : publishFlow.invalidField}`);
    if (field instanceof HTMLElement) {
      field.focus();
    }
  }, [publishFlow.invalidField]);
  // Reviewing with no files chosen sends focus to the picker, so the objection
  // is acted on rather than only read.
  useEffect(() => {
    if (!publishFlow.isMediaMissing) {
      return;
    }
    document.getElementById('publish-add-files')?.focus();
  }, [publishFlow.isMediaMissing]);
  if (!isOpen) {
    return null;
  }
  function requestClose() {
    if (isPublishing) {
      return;
    }
    // Bytes are moving. Closing here would abandon an upload silently, so the
    // creator is told to cancel it first rather than losing track of it.
    if (publishFlow.hasUploadInFlight) {
      uploadErrorRef.current?.focus();
      return;
    }
    if (isDirty && step !== 'done') {
      setIsConfirmingDiscard(true);
      return;
    }
    onClose();
  }
  const {
    metadata,
    fieldErrors,
    setField
  } = publishFlow;
  return <AnimatePresence>
      <motion.div className="modal-scrim fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-8 sm:items-center" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} transition={{
      duration: shouldReduceMotion ? 0 : 0.18,
      ease: [0.22, 1, 0.36, 1]
    }} onPointerDown={(event) => {
      if (event.target === event.currentTarget) {
        requestClose();
      }
    }}>
        <motion.section role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title" className="scrollbar-slim flex max-h-[calc(100dvh-32px)] flex-col overflow-y-auto rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-6 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-7" style={{
        width: 'min(520px, calc(100vw - 32px), calc(100dvh - 80px))',
        height: 'min(720px, calc(100dvh - 32px))'
      }} initial={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.985
      }} animate={{
        opacity: 1,
        scale: 1
      }} exit={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.99
      }} transition={{
        duration: shouldReduceMotion ? 0 : 0.18,
        ease: [0.22, 1, 0.36, 1]
      }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="publish-dialog-title" ref={stepHeadingRef} tabIndex={-1} className="text-[20px] font-semibold leading-tight focus:outline-none">
                {step === 'done' ? publishFlow.result?.mediaPersisted ? 'Project published' : 'Published to this session' : 'New project'}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {step === 'done' ? `${categoryLabel} · draft cleared` : `Adding to ${categoryLabel}`}
              </p>
            </div>
            <button type="button" onClick={requestClose} disabled={isPublishing} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 motion-reduce:transition-none">
              <InterfaceIcon icon={XIcon} weight="medium" />
            </button>
          </div>

          {!publishFlow.isOwner ? <div className="mt-5">
              <ErrorState description="Only the owner of this profile can publish work here." />
            </div> : publishFlow.draftError ? <div className="mt-5">
              <ErrorState description={publishFlow.draftError} />
            </div> : !publishFlow.draft ? <div className="mt-5">
              <LoadingState label="Starting a draft" />
            </div> : step === 'done' ? <div className="mt-5 flex flex-col gap-4">
              <div role="status" className="flex items-start gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] leading-relaxed">
                <CheckCircle2Icon className="mt-[2px] h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                <span>
                  <strong className="font-semibold">{metadata.title.trim()}</strong> now appears in {categoryLabel}.
                  {publishFlow.result && !publishFlow.result.mediaPersisted && ' Your files stayed on this device — no storage is connected yet, so this project is only here for the current session and a reload will clear it.'}
                </span>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" size="lg" onClick={() => onPublished(publishFlow.result?.projectId ?? '')}>Done</Button>
              </div>
            </div> : <form onSubmit={(event) => {
          event.preventDefault();
          if (publishFlow.canPublish) {
            void publishFlow.publish.run();
          }
        }} noValidate className="mt-5 flex flex-col gap-4">
              {/* The transfer itself was refused. Retrying re-sends the same
               files; nothing the creator chose has been reset. Deliberately
               separate from a publish failure, because the recovery differs. */}
              {publishFlow.upload.failure && <div ref={uploadErrorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {publishFlow.upload.failure.message}
                    {' Your details, files, order, and cover are exactly as you left them, and nothing has been published.'}
                    <button type="button" onClick={() => void publishFlow.retryUpload()} disabled={publishFlow.upload.isBusy} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Retry upload</button>
                    <button type="button" onClick={() => {
                publishFlow.upload.dismissFailure();
              }} disabled={publishFlow.upload.isBusy} className="ml-2.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Dismiss</button>
                  </span>
                </div>}

              {/* Publication was refused. When the files are already stored this
               retries the publication ONLY — it never uploads twice. */}
              {publishFlow.publish.status === 'error' && !publishFlow.upload.failure && <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {publishFlow.publish.error}
                    {publishFlow.canRetryPublishOnly ? ' Your files are already stored, so trying again publishes the project without uploading them a second time.' : ' Your draft, details, and selected files are still here.'}
                    <button type="button" onClick={publishFlow.retryPublish} disabled={isPublishing} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Try again</button>
                  </span>
                </div>}

              {/* One portrait-oriented reading order at every viewport size:
               files first, followed by every public detail and the action. */}
              <div className="flex flex-col gap-4">
                  {/* The picker receives transport state and callbacks only. It
                 knows nothing about storage. */}
                  <MediaPicker media={media} upload={publishFlow.upload} disabled={isPublishing} />
                  <div className="flex min-w-0 flex-col gap-4">
                    {/* Everything a visitor will see is entered here. Nothing is
                   pre-filled or derived, so no public metadata is invented
                   on the creator's behalf. */}
                    <ProfileField ref={firstFieldRef} id="publish-title" label="Title" required value={metadata.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" error={fieldErrors.title} disabled={isPublishing} onChange={(value) => setField('title', value)} />
                     <ProfileField id="publish-summary" label="Description (optional)" multiline value={metadata.summary} maxLength={SUMMARY_MAX_LENGTH} placeholder="Describe the work" error={fieldErrors.summary} disabled={isPublishing} onChange={(value) => setField('summary', value)} />
                    {publishFlow.inferredRelevance.contentGeography ? <div className="rounded-[9px] border border-[var(--hairline)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        <p>Project relevance: <strong className="font-semibold text-[var(--text-primary)]">{publishFlow.inferredRelevance.contentGeography.label}</strong>. This describes the work; Portalink city pages use the city chosen on your profile.</p>
                        <button type="button" onClick={() => publishFlow.setIgnoreInferredLocation(!publishFlow.ignoreInferredLocation)} className="mt-1 font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                          {publishFlow.ignoreInferredLocation ? 'Use the place mentioned in the project' : 'This project is not location-specific'}
                        </button>
                      </div> : null}
                  </div>
                </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="submit" variant="primary" size="lg" isLoading={isPublishing} disabled={!publishFlow.canPublish}>
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </Button>
              </div>
            </form>}

          {/* Keep the prototype warning truthful without showing it in a
           configured deployment where projects and files are persisted. */}
          {publishFlow.media.capability && !publishFlow.media.capability.isAvailable && <p className="mt-6 flex items-start gap-2 border-t border-[var(--hairline)] pt-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              <InfoIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Prototype publishing. {publishFlow.media.capability.reason} Published work is cleared on reload.
            </p>}
        </motion.section>

        {isConfirmingDiscard && <div role="alertdialog" aria-modal="true" aria-labelledby="discard-draft-title" className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-[340px] rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
              <h3 id="discard-draft-title" className="text-[16px] font-semibold leading-tight">Discard this draft?</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">Your details and selected files will be lost.</p>
              {/* A refused discard is reported as refused. The flow used to close
               regardless, telling the creator their draft was thrown away when
               the service had rejected it. */}
              {publishFlow.discardError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{publishFlow.discardError} Your draft is still here, exactly as you left it.</span>
                </p>}
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="secondary" disabled={publishFlow.isDiscarding} onClick={() => {
              publishFlow.dismissDiscardError();
              setIsConfirmingDiscard(false);
            }}>Keep editing</Button>
                <Button variant="danger" isLoading={publishFlow.isDiscarding} disabled={publishFlow.isDiscarding} onClick={async () => {
              // Only leave once the service has actually discarded it.
              const didDiscard = await publishFlow.discard();
              if (!didDiscard) {
                return;
              }
              setIsConfirmingDiscard(false);
              onClose();
            }}>{publishFlow.discardError ? 'Try again' : 'Discard draft'}</Button>
              </div>
            </div>
          </div>}
      </motion.div>
    </AnimatePresence>;
}
