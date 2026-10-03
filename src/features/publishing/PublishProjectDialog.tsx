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
import { MobilePublishFlow, type MobilePublishStep } from './MobilePublishFlow';
import type { ProjectDraft, PublishResult } from '../../types/publishing';

/**
 * Creating a project inside a category the signed-in account owns.
 *
 * Presentation only: the draft, validation, media rules, and publish request
 * all live in `usePublishProject`. Ownership is enforced by the caller and
 * re-checked by the service — hiding this dialog is UX, not authorization.
 */
type PublishProjectDialogProps = {
  resumeDraft?: ProjectDraft;
  firstProject?: { madeIn?: string; name: string; categories: string[] };
  isOpen: boolean;
  profileId: string | null;
  categoryId: string | null;
  categoryLabel: string;
  onClose: () => void;
  onPublished: (result: PublishResult, title: string) => void;
};
export function PublishProjectDialog({
  isOpen,
  firstProject,
  resumeDraft,
  profileId,
  categoryId,
  categoryLabel,
  onClose,
  onPublished
}: PublishProjectDialogProps) {
  const isMobile = usePresentation() === 'mobile';
  const publishFlow = usePublishProject(profileId, categoryId, isOpen, categoryLabel, isMobile, Boolean(firstProject), firstProject?.madeIn, { persist: isMobile, resume: resumeDraft });
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const uploadErrorRef = useRef<HTMLDivElement>(null);
  const announcedProjectRef = useRef<string | null>(null);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const [mobileEditingStep, setMobileEditingStep] = useState<MobilePublishStep>('files');
  const {
    step,
    state,
    isDirty,
    media
  } = publishFlow;
  const isPublishing = state === 'publishing';
  const isRecovering = isPublishing || publishFlow.isSavingDraft || publishFlow.isDiscarding || publishFlow.upload.isBusy || publishFlow.upload.isCleaningUp || (isMobile && media.state === 'selecting');
  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingDiscard(false);
      setMobileEditingStep('files');
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
    if (!isMobile && isOpen && step === 'metadata' && publishFlow.draft) {
      const frame = requestAnimationFrame(() => document.getElementById('publish-add-files')?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [isMobile, isOpen, step, publishFlow.draft]);
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
    if (isMobile || !publishFlow.invalidField) {
      return;
    }
    const field = document.getElementById(`publish-${publishFlow.invalidField === 'summary' ? 'summary' : publishFlow.invalidField}`);
    if (field instanceof HTMLElement) {
      field.focus();
    }
  }, [isMobile, publishFlow.invalidField]);
  // Reviewing with no files chosen sends focus to the picker, so the objection
  // is acted on rather than only read.
  useEffect(() => {
    if (isMobile || !publishFlow.isMediaMissing) {
      return;
    }
    document.getElementById('publish-add-files')?.focus();
  }, [isMobile, publishFlow.isMediaMissing]);
  if (!isOpen || step === 'done') {
    return null;
  }
  async function requestClose() {
    if (isRecovering) {
      return;
    }
    // Bytes are moving. Closing here would abandon an upload silently, so the
    // creator is told to cancel it first rather than losing track of it.
    if (publishFlow.hasUploadInFlight) {
      uploadErrorRef.current?.focus();
      return;
    }
    if (firstProject || isMobile) {
      try { await publishFlow.saveLocalDraft(true); onClose(); } catch { /* Keep files visible when local persistence fails. */ }
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
    : !firstProject && !metadata.summary.trim() ? 'Add a description to publish.'
    : metadata.title.trim().length > TITLE_MAX_LENGTH ? `Keep the title within ${TITLE_MAX_LENGTH} characters.`
    : !media.items.length ? 'Add a file to publish.'
    : publishFlow.upload.isBusy ? 'Wait for your files to finish uploading.' : null;
  const notices = <>
              {/* The transfer itself was refused. Retrying re-sends the same
               files; nothing the creator chose has been reset. Deliberately
               separate from a publish failure, because the recovery differs. */}
              {publishFlow.upload.failure && <div ref={uploadErrorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {publishFlow.upload.failure.message}
                    {' Your details, files, order, and cover are exactly as you left them, and nothing has been published.'}
                    <button type="button" onClick={() => void publishFlow.retryUpload()} disabled={isRecovering} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Retry upload</button>
                    <button type="button" onClick={() => {
                publishFlow.upload.dismissFailure();
              }} disabled={isRecovering} className="ml-2.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Dismiss</button>
                  </span>
                </div>}

              {/* Publication was refused. When the files are already stored this
               retries the publication ONLY — it never uploads twice. */}
              {publishFlow.publish.status === 'error' && !publishFlow.upload.failure && <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {publishFlow.publish.error}
                    {publishFlow.hasCommittedProject ? ' Your project is published. Try again to finish saving its details.' : publishFlow.canRetryPublishOnly ? ' Your files are already stored, so trying again publishes the project without uploading them a second time.' : ' Your draft, details, and selected files are still here.'}
                    <button type="button" onClick={publishFlow.retryPublish} disabled={isRecovering} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Try again</button>
                  </span>
                </div>}

  </>;
  return <ProjectFormDialog mobileFlow={isMobile} title={firstProject?.madeIn ? `Add work from ${(metadata.creationDetails?.madeIn || firstProject.madeIn).slice(0, 4)}` : firstProject ? "Your first project" : "New project"} titleId="publish-dialog-title" description={isMobile && firstProject ? undefined : <>Adding to {categoryLabel}</>} onClose={requestClose} closeDisabled={isRecovering || publishFlow.hasUploadInFlight} confirmation={isConfirmingDiscard ? <ProjectDiscardConfirmation title="Discard this draft?" description="Your details and selected files will be lost." error={publishFlow.discardError} busy={publishFlow.isDiscarding} onKeep={() => {
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
            </div> : (!publishFlow.draft && !firstProject) || publishFlow.restoringDraft ? <div className="project-form-content scrollbar-slim">
              <LoadingState label="Starting a draft" />
            </div> : isMobile || firstProject ? <MobilePublishFlow flow={publishFlow} editingStep={isMobile || firstProject ? publishFlow.firstProjectStage === 'details' ? 'details' : 'files' : mobileEditingStep} onEditingStepChange={isMobile || firstProject ? publishFlow.setFirstProjectStage : setMobileEditingStep} firstProject={firstProject ? { ...firstProject, onSkip: () => void requestClose() } : undefined} categoryLabel={categoryLabel} notices={notices} /> : <form onSubmit={(event) => {
          event.preventDefault();
          if (publishFlow.canPublish && !publishFlow.isSavingDraft) {
            void publishFlow.publish.run();
          }
        }} noValidate aria-describedby={publishHint ? 'publish-hint' : undefined} data-mobile-publish={isMobile || undefined} data-web-publish={!isMobile || undefined} className="project-form-content scrollbar-slim">
              {notices}

              {/* One portrait-oriented reading order at every viewport size:
               files first, followed by every public detail and the action. */}
              <div className="project-form-fields">
                  {/* The picker receives transport state and callbacks only. It
                 knows nothing about storage. */}
                  <MediaPicker compact={isMobile} media={media} upload={publishFlow.upload} disabled={isPublishing || publishFlow.isSavingDraft || publishFlow.hasCommittedProject} />
                  <CoverFilmstrip compact={isMobile} media={media} disabled={isPublishing || publishFlow.isSavingDraft || publishFlow.hasCommittedProject || publishFlow.upload.isBusy || publishFlow.upload.phase === 'uploaded'} />
                  <section className="project-form-details" aria-labelledby="publish-details-label">
                    <h3 id="publish-details-label" className={isMobile ? 'sr-only' : 'text-[13px] font-semibold text-[var(--text-primary)]'}>Project details</h3>
                    {/* Everything a visitor will see is entered here. Nothing is
                   pre-filled or derived, so no public metadata is invented
                   on the creator's behalf. */}
                    <ProfileField ref={firstFieldRef} id="publish-title" label="Title" required value={metadata.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" error={fieldErrors.title} disabled={isPublishing || publishFlow.isSavingDraft || publishFlow.hasCommittedProject} onChange={(value) => setField('title', value)} />
                     <ProfileField id="publish-summary" label="Description" formatting={isMobile} required={!firstProject} multiline value={metadata.summary} placeholder="Describe the work" error={fieldErrors.summary} disabled={isPublishing || publishFlow.isSavingDraft || publishFlow.hasCommittedProject} onChange={(value) => setField('summary', value)} />
                    {isMobile ? <ProfileField id="publish-location" label="Location" optional value={publishFlow.location} maxLength={80} placeholder="City or place" disabled={isPublishing || publishFlow.isSavingDraft || publishFlow.hasCommittedProject} onChange={publishFlow.setLocation} /> : publishFlow.inferredRelevance.contentGeography ? <div className="rounded-[9px] border border-[var(--hairline)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        <p>Project relevance: <strong className="font-semibold text-[var(--text-primary)]">{publishFlow.inferredRelevance.contentGeography.label}</strong>. This describes the work; Portalink city pages use the city chosen on your profile.</p>
                        <button type="button" disabled={publishFlow.hasCommittedProject} onClick={() => publishFlow.setIgnoreInferredLocation(!publishFlow.ignoreInferredLocation)} className="mt-1 font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                          {publishFlow.ignoreInferredLocation ? 'Use the place mentioned in the project' : 'This project is not location-specific'}
                        </button>
                      </div> : null}
                  </section>
                </div>

              <div className="project-form-actions flex flex-col items-end gap-1.5">
                {publishHint ? <p id="publish-hint" role="status" className={isMobile ? 'w-full text-[13px] text-[var(--text-secondary)]' : 'text-[12px] text-[var(--text-secondary)]'}>{publishHint}</p> : null}
                <Button type="submit" variant="primary" size="lg" isLoading={isPublishing} disabled={!publishFlow.canPublish || publishFlow.isSavingDraft}>
                  {isPublishing ? 'Publishing…' : publishFlow.hasCommittedProject ? 'Finish saving details' : 'Publish'}
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
