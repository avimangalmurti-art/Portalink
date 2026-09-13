import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, InfoIcon } from 'lucide-react';
import { ProjectFormDialog, ProjectDiscardConfirmation } from '../../components/publishing/ProjectFormDialog';
import { ProfileField } from '../../components/profile/ProfileField';
import { MediaPicker } from '../../components/publishing/MediaPicker';
import { CoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { usePublishProject } from './usePublishProject';
import { TITLE_MAX_LENGTH } from './validation';
import { usePresentation } from '../../presentation/usePresentation';
import type { PublishResult } from '../../types/publishing';

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
  onPublished: (result: PublishResult, title: string) => void;
};
export function PublishProjectDialog({
  isOpen,
  profileId,
  categoryId,
  categoryLabel,
  onClose,
  onPublished
}: PublishProjectDialogProps) {
  const isMobile = usePresentation() === 'mobile';
  const publishFlow = usePublishProject(profileId, categoryId, isOpen, categoryLabel, isMobile);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const uploadErrorRef = useRef<HTMLDivElement>(null);
  const announcedProjectRef = useRef<string | null>(null);
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
      announcedProjectRef.current = null;
    }
  }, [isOpen]);

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
    // Only a confirmed project result completes the flow. A finished transfer,
    // cancelled upload, or failed publication must leave the form available.
    const result = publishFlow.result;
    if (!isOpen || step !== 'done' || !result?.projectId || announcedProjectRef.current === result.projectId) return;
    announcedProjectRef.current = result.projectId;
    onPublished(result, publishFlow.metadata.title.trim());
  }, [isOpen, step, publishFlow.result, publishFlow.metadata.title, onPublished]);
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
  if (!isOpen || step === 'done') {
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
  const publishHint = !metadata.title.trim() ? 'Add a title to publish.'
    : !metadata.summary.trim() ? 'Add a description to publish.'
    : metadata.title.trim().length > TITLE_MAX_LENGTH ? `Keep the title within ${TITLE_MAX_LENGTH} characters.`
    : !media.items.length ? 'Add a file to publish.'
    : publishFlow.upload.isBusy ? 'Wait for your files to finish uploading.' : null;
  return <ProjectFormDialog title="New project" titleId="publish-dialog-title" description={<>Adding to {categoryLabel}</>} onClose={requestClose} closeDisabled={isPublishing || publishFlow.hasUploadInFlight || publishFlow.isDiscarding} confirmation={isConfirmingDiscard ? <ProjectDiscardConfirmation title="Discard this draft?" description="Your details and selected files will be lost." error={publishFlow.discardError} busy={publishFlow.isDiscarding} onKeep={() => {
    publishFlow.dismissDiscardError();
    setIsConfirmingDiscard(false);
  }} onDiscard={async () => {
    if (!await publishFlow.discard()) return;
    setIsConfirmingDiscard(false);
    onClose();
  }} /> : null}>
          {!publishFlow.isOwner ? <div className="project-form-content scrollbar-slim">
              <ErrorState description="Only the owner of this profile can publish work here." />
            </div> : publishFlow.draftError ? <div className="project-form-content scrollbar-slim">
              <ErrorState description={publishFlow.draftError} />
            </div> : !publishFlow.draft ? <div className="project-form-content scrollbar-slim">
              <LoadingState label="Starting a draft" />
            </div> : <form onSubmit={(event) => {
          event.preventDefault();
          if (publishFlow.canPublish) {
            void publishFlow.publish.run();
          }
        }} noValidate aria-describedby={publishHint ? 'publish-hint' : undefined} data-mobile-publish={isMobile || undefined} className="project-form-content scrollbar-slim">
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
              <div className="project-form-fields">
                  {/* The picker receives transport state and callbacks only. It
                 knows nothing about storage. */}
                  <MediaPicker compact={isMobile} media={media} upload={publishFlow.upload} disabled={isPublishing} />
                  <CoverFilmstrip compact={isMobile} media={media} disabled={isPublishing || publishFlow.upload.isBusy || publishFlow.upload.phase === 'uploaded'} />
                  <section className="project-form-details" aria-labelledby="publish-details-label">
                    <h3 id="publish-details-label" className={isMobile ? 'sr-only' : 'text-[13px] font-semibold text-[var(--text-primary)]'}>Project details</h3>
                    {/* Everything a visitor will see is entered here. Nothing is
                   pre-filled or derived, so no public metadata is invented
                   on the creator's behalf. */}
                    <ProfileField ref={firstFieldRef} id="publish-title" label="Title" required value={metadata.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" error={fieldErrors.title} disabled={isPublishing} onChange={(value) => setField('title', value)} />
                     <ProfileField id="publish-summary" label="Description" required multiline value={metadata.summary} placeholder="Describe the work" error={fieldErrors.summary} disabled={isPublishing} onChange={(value) => setField('summary', value)} />
                    {isMobile ? <ProfileField id="publish-location" label="Location" optional value={publishFlow.location} maxLength={80} placeholder="City or place" disabled={isPublishing} onChange={publishFlow.setLocation} /> : publishFlow.inferredRelevance.contentGeography ? <div className="rounded-[9px] border border-[var(--hairline)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        <p>Project relevance: <strong className="font-semibold text-[var(--text-primary)]">{publishFlow.inferredRelevance.contentGeography.label}</strong>. This describes the work; Portalink city pages use the city chosen on your profile.</p>
                        <button type="button" onClick={() => publishFlow.setIgnoreInferredLocation(!publishFlow.ignoreInferredLocation)} className="mt-1 font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                          {publishFlow.ignoreInferredLocation ? 'Use the place mentioned in the project' : 'This project is not location-specific'}
                        </button>
                      </div> : null}
                  </section>
                </div>

              <div className="project-form-actions flex flex-col items-end gap-1.5">
                {publishHint ? <p id="publish-hint" role={isMobile ? undefined : 'status'} className={isMobile ? 'sr-only' : 'text-[12px] text-[var(--text-secondary)]'}>{publishHint}</p> : null}
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
    </ProjectFormDialog>;
}
