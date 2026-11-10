import { ProjectCitationFields } from '../citations/ProjectCitationFields';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import '../../components/ui/confirmation-dialog.css';
import { FormattedText } from '../../components/text/FormattedText';
import React, { useEffect, useRef } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, MapPinIcon, LoaderCircleIcon, PencilIcon, FileIcon } from 'lucide-react';
import { MobileCoverFiles } from './MobileCoverFiles';
import './mobile-cover-files.css';
import { MediaPicker } from '../../components/publishing/MediaPicker';
import { CoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { ProfileField } from '../../components/profile/ProfileField';
import { Button } from '../../components/ui/Button';
import type { usePublishProject } from './usePublishProject';
import { TITLE_MAX_LENGTH, validateTitle } from './validation';
import { canBeCover } from './assetTypes';
import { usePresentation } from '../../presentation/usePresentation';

export type MobilePublishStep = 'files' | 'details';
type Flow = ReturnType<typeof usePublishProject>;

/** Presentation steps share the existing draft, validation and upload lifecycle. */
export function MobilePublishFlow({ flow, editingStep, onEditingStepChange, categoryLabel, notices, firstProject, closing = false, detailsFirst = false, onboarding = false, screenTitleId = 'publish-dialog-title' }: {
  closing?: boolean;
  detailsFirst?: boolean;
  onboarding?: boolean;
  firstProject?: { name: string; categories: string[]; onSkip: () => void };
  flow: Flow;
  editingStep: MobilePublishStep;
  onEditingStepChange: (step: MobilePublishStep) => void;
  categoryLabel: string;
  screenTitleId?: string;
  notices: React.ReactNode;
}) {
  const mobile = usePresentation() === 'mobile';
  const singleHeading = mobile || onboarding;
  const stage = flow.hasCommittedProject || flow.step === 'preview' ? 'review' : editingStep;
  const stages = detailsFirst ? ['details', 'files', 'review'] as const : ['files', 'details', 'review'] as const;
  const index = stages.indexOf(stage);
  const previousStage = index > 0 ? stages[index - 1] : null;
  const backStep = singleHeading
    ? previousStage === 'files' || previousStage === 'details' ? previousStage : null
    : stage !== 'files' || detailsFirst ? stage === 'review' || stage === 'files' ? 'details' : 'files' : null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const advancing = useRef(false);
  const preparing = flow.media.state === 'selecting';
  const busy = closing || flow.state === 'publishing' || flow.isSavingDraft || flow.isDiscarding || flow.upload.isCleaningUp || preparing;
  const titles = { files: 'Create your cover', details: 'Project details', review: 'Review project' };
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (singleHeading) document.getElementById(screenTitleId)?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
  }, [stage, singleHeading, screenTitleId]);
  useEffect(() => {
    if (flow.invalidField && stage === 'details') document.getElementById(`publish-${flow.invalidField}`)?.focus();
  }, [flow.invalidField, flow.fieldErrors, stage]);
  const edit = (target: MobilePublishStep) => {
    if (busy || flow.hasCommittedProject) return;
    // Retry upload keeps the old file snapshot. Once editing resumes, Publish
    // must use the currently reviewed files instead; keep any stored data tracked.
    flow.upload.dismissFailure();
    flow.publish.reset();
    flow.dismissSaveDraftError();
    onEditingStepChange(target);
    flow.setStep('metadata');
  };
  const advance = async () => {
    if (busy || advancing.current) return;
    if (onboarding && !flow.hasCommittedProject && stage !== 'review' && validateTitle(flow.metadata.title)) {
      advancing.current = true;
      try {
        onEditingStepChange('details');
        await flow.goToPreview();
      } finally { advancing.current = false; }
      return;
    }
    if (stage === 'files') {
      if (flow.media.isComplete) {
        if (detailsFirst) {
          advancing.current = true;
          try { await flow.goToPreview(); }
          finally { advancing.current = false; }
        }
        else onEditingStepChange('details');
      }
      return;
    }
    advancing.current = true;
    try {
      if (stage === 'details') {
        if (!flow.media.isComplete) { onEditingStepChange('files'); return; }
        await flow.goToPreview();
      }
      else if (flow.canPublish) await flow.publish.run();
    } finally { advancing.current = false; }
  };
  const hint = stage === 'files' ? (preparing ? 'Preparing your files…' : !flow.media.isComplete ? onboarding ? null : 'Choose at least one file to continue.' : null)
    : null;
  const summary = flow.metadata.summary.trim();
  const editAction = (label: string, target: MobilePublishStep) => <button type="button" className={onboarding ? 'onboarding-review-edit' : mobile ? 'mobile-review-edit' : undefined} data-ui-control={onboarding ? 'button' : undefined} data-control-variant={onboarding ? 'ghost' : undefined} data-control-size={onboarding ? 'sm' : undefined} aria-label={label} disabled={busy || flow.hasCommittedProject || (target === 'files' && flow.upload.phase === 'uploaded')} onClick={() => edit(target)}><PencilIcon size={16} aria-hidden="true" />Edit</button>;
  const actionsScrollWithFiles = mobile && stage === 'files';
  const actions = <footer className="mobile-publish-actions">
    {hint && <p id="mobile-publish-hint" role="status">{hint}</p>}
    <div>
      {backStep && <Button type="button" variant="secondary" size="lg" aria-label={singleHeading ? `Back to ${backStep === 'files' ? 'files' : 'project details'}` : undefined} disabled={busy || flow.hasCommittedProject || (singleHeading && backStep === 'files' && flow.upload.phase === 'uploaded')} onClick={() => edit(backStep)}><ArrowLeftIcon size={18} aria-hidden="true" />Back</Button>}
      <Button type="submit" variant="primary" size="lg" fullWidth isLoading={flow.state === 'publishing' || flow.isSavingDraft}
        disabled={busy || (stage === 'files' && !flow.media.isComplete) || (stage === 'review' && !flow.canPublish)}>
        {flow.state === 'publishing' ? 'Publishing…' : flow.isSavingDraft ? 'Saving details…' : stage === 'review' ? flow.hasCommittedProject ? 'Finish saving details' : 'Publish project' : onboarding ? stage === 'files' || flow.media.isComplete ? 'Review project' : 'Continue to upload' : mobile && stage === 'files' ? detailsFirst ? 'Review project' : 'Continue to details' : detailsFirst && !flow.media.isComplete ? 'Continue to upload' : stage === 'details' || detailsFirst ? 'Review project' : 'Continue'}
        {!busy && <ArrowRightIcon size={20} aria-hidden="true" />}
      </Button>
    </div>
  </footer>;
  const content = <>
      {!singleHeading && <header className="mobile-publish-step-heading">
        <h3 id="mobile-publish-step-title" ref={headingRef} tabIndex={-1}>{titles[stage]}</h3>
        {stage === 'files' && !mobile && <p>Choose an image, adjust the crop and make it look its best.</p>}
      </header>}
      {notices}
      {flow.saveDraftError && <p role="alert" className="mobile-publish-error">{flow.saveDraftError} Your details and files are still here. Try again.</p>}
      {flow.localDraftError && <p role="alert" className="mobile-publish-error">{flow.localDraftError} Your work is still open here.</p>}
      {stage === 'files' ? <MobileCoverFiles onboarding={onboarding} media={flow.media} upload={flow.upload} disabled={busy} /> : stage === 'details' ? <section className="project-form-details" aria-labelledby={singleHeading ? screenTitleId : 'mobile-publish-step-title'}>
        <ProfileField id="publish-title" label="Title" required requiredIndicator="asterisk" workspace clearable value={flow.metadata.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" error={flow.fieldErrors.title} disabled={busy} onChange={value => flow.setField('title', value)} />
        <ProfileField id="publish-summary" label="Description" formatting optional optionalParentheses workspace multiline value={flow.metadata.summary} placeholder="Describe the work" error={flow.fieldErrors.summary} disabled={busy} onChange={value => flow.setField('summary', value)} />
        <ProjectCitationFields metadata={flow.metadata} disabled={busy} onChange={flow.setCitationFields}/>
        {onboarding && !mobile ? flow.inferredRelevance.contentGeography ? <div className="rounded-[9px] border border-[var(--hairline)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          <p>Project relevance: <strong className="font-semibold text-[var(--text-primary)]">{flow.inferredRelevance.contentGeography.label}</strong>. This describes the work; Portalink city pages use the city chosen on your profile.</p>
          <button type="button" disabled={busy || flow.hasCommittedProject} onClick={() => flow.setIgnoreInferredLocation(!flow.ignoreInferredLocation)} className="mt-1 font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {flow.ignoreInferredLocation ? 'Use the place mentioned in the project' : 'This project is not location-specific'}
          </button>
        </div> : null : <ProfileField id="publish-location" label="Location" optional optionalParentheses workspace clearable leadingIcon={<MapPinIcon size={20} aria-hidden="true" />} value={flow.location} maxLength={80} placeholder="City or place" disabled={busy} onChange={flow.setLocation} />}
      </section> : onboarding ? <div className="onboarding-idea-review" data-onboarding-idea-review="">
        {flow.hasCommittedProject && <p className="onboarding-review-status" role="status">Your project is published. Finish saving its details.</p>}
        <section className="onboarding-review-cover" aria-label="Cover">
          <header><h4>Cover</h4>{editAction('Edit cover', 'files')}</header>
          {flow.media.items.some(item => item.isCover && canBeCover(item.family, item.capability)) ? <CoverFilmstrip compact readOnly media={flow.media} disabled /> : <p className="onboarding-review-empty-cover">No cover selected</p>}
        </section>
        <section className="onboarding-review-idea" aria-label="Project details">
          {mobile ? <>
            <header className="onboarding-review-fields-heading"><h4>Project details</h4>{editAction('Edit project details', 'details')}</header>
            <dl className="onboarding-review-fields">
              <div><dt>Portal</dt><dd>{categoryLabel}</dd></div>
              <div><dt>Title</dt><dd className="onboarding-review-title-value">{flow.metadata.title.trim()}</dd></div>
              <div>
                <dt id={`${screenTitleId}-description`}>Description</dt>
                <dd>{summary ? <div className="onboarding-review-summary" role="region" tabIndex={0} aria-labelledby={`${screenTitleId}-description`}><FormattedText text={summary} /></div>
                  : <p className="onboarding-review-empty-description">No description added.</p>}</dd>
              </div>
            </dl>
          </> : <>
            <p className="onboarding-review-portal"><span>Portal</span><strong>{categoryLabel}</strong></p>
            <header><h4>{flow.metadata.title.trim()}</h4>{editAction('Edit project details', 'details')}</header>
            <div className="onboarding-review-summary" role="region" tabIndex={0} aria-label="Description">{summary ? <FormattedText text={summary} /> : <p className="onboarding-review-empty-description">No description added.</p>}</div>
          </>}
          {flow.location.trim() && <p className="onboarding-review-location"><MapPinIcon size={16} aria-hidden="true"/><span>{flow.location.trim()}</span></p>}
        </section>
        <section className="onboarding-review-files" aria-label="Selected files">
          <header><h4>{`${flow.media.items.length} ${flow.media.items.length === 1 ? 'file' : 'files'}`}</h4>{editAction('Edit selected files', 'files')}</header>
          <div className="mobile-review-thumbnails onboarding-review-thumbnails" role={mobile ? 'group' : undefined} aria-label={mobile ? 'Selected project files' : undefined}>
            {(mobile ? flow.media.items : flow.media.items.slice(0, 3)).map((item, fileIndex) => <span key={item.id} role={mobile ? 'img' : undefined} aria-label={mobile ? `File ${fileIndex + 1}: ${item.displayTitle}` : undefined}>{item.previewUrl && item.family === 'image' ? <img src={item.previewUrl} alt="" /> : <FileIcon size={24} aria-hidden="true" />}</span>)}
            {!mobile && flow.media.items.length > 3 && <span className="onboarding-review-more">+{flow.media.items.length - 3}</span>}
          </div>
        </section>
        {(flow.upload.failure || flow.upload.cleanupError) && <div className="mobile-review-transport"><MediaPicker compact media={flow.media} upload={flow.upload} disabled /></div>}
      </div> : <div className={`mobile-publish-review${mobile ? ' mobile-publish-review--compact' : ''}`}>
        <section className={`mobile-review-card mobile-review-cover${mobile ? ' mobile-review-cover--primary' : ''}`} aria-label="Cover">
          <header><h4>Cover</h4>{editAction('Edit cover', 'files')}</header>
          <CoverFilmstrip compact readOnly media={flow.media} disabled />
        </section>
        <section className="mobile-review-card mobile-publish-review-details" aria-label="Project details">
          <header><h4>Project details</h4>{editAction('Edit project details', 'details')}</header>
          <dl><div><dt>Title</dt><dd>{flow.metadata.title.trim()}</dd></div>
            {(mobile || flow.metadata.summary.trim()) && <div><dt>Description{mobile && <span className="mobile-review-optional"> (optional)</span>}</dt><dd className={flow.metadata.summary.trim() ? 'mobile-review-summary' : 'mobile-review-empty'}>{flow.metadata.summary.trim() ? <FormattedText text={flow.metadata.summary.trim()} /> : 'Not added'}</dd></div>}
            {flow.location.trim() && <div><dt>Location</dt><dd><MapPinIcon size={16} aria-hidden="true" />{flow.location.trim()}</dd></div>}
          </dl>
        </section>
        <section className="mobile-review-card mobile-review-files" aria-label="Selected files">
          <header><h4>Selected files</h4>{editAction('Edit selected files', 'files')}</header>
          <div className="mobile-review-file-summary"><div className="mobile-review-thumbnails" role={mobile ? 'group' : undefined} aria-label={mobile ? 'Selected project files' : undefined}>{(mobile ? flow.media.items : flow.media.items.slice(0, 3)).map((item, fileIndex) => <span key={item.id} role={mobile ? 'img' : undefined} aria-label={mobile ? `File ${fileIndex + 1}: ${item.displayTitle}` : undefined}>{item.previewUrl && item.family === 'image' ? <img src={item.previewUrl} alt="" /> : <FileIcon size={24} aria-hidden="true" />}</span>)}{!mobile && flow.media.items.length > 3 && <span className="mobile-review-more">+{flow.media.items.length - 3}</span>}</div><span>{flow.media.items.length} {flow.media.items.length === 1 ? 'file' : 'files'}</span></div>
        </section>
        {/* Exceptional transport states retain the existing retry/cleanup actions. */}
        {(flow.upload.failure || flow.upload.cleanupError) && <div className="mobile-review-transport"><MediaPicker compact media={flow.media} upload={flow.upload} disabled /></div>}
      </div>}
  </>;
  return <form className="project-form-content mobile-publish-flow" data-mobile-publish="" data-onboarding-publish={onboarding || undefined} data-cover-step={stage === 'files' || undefined} data-details-step={stage === 'details' || undefined} data-review-step={stage === 'review' || undefined} data-first-project={Boolean(firstProject) || undefined} aria-describedby={hint ? 'mobile-publish-hint' : undefined} onSubmit={event => { event.preventDefault(); void advance(); }} noValidate>
    {!singleHeading && <ol className="mobile-publish-progress" aria-label="Upload steps">
      {(detailsFirst ? ['Details', 'Files', 'Review'] : ['Files', 'Details', 'Review']).map((label, stepIndex) => <li key={label} aria-current={stepIndex === index ? 'step' : undefined} data-complete={stepIndex < index || undefined}>
        <span aria-hidden="true">{stepIndex < index ? <CheckIcon size={14} /> : stepIndex + 1}</span>{label}
      </li>)}
    </ol>}
    {flow.state === 'publishing' && <PublishingProgress flow={flow} onboarding={onboarding} />}
    <div ref={bodyRef} className="mobile-publish-body scrollbar-slim">
      {actionsScrollWithFiles ? <div className="mobile-publish-file-content">{content}</div> : content}
      {actionsScrollWithFiles && actions}
    </div>
    {!actionsScrollWithFiles && actions}
  </form>;
}

function PublishingProgress({flow, onboarding = false}: {flow: Flow; onboarding?: boolean}) {
  const viewport = useDialogViewport();
  const dialog = useRef<HTMLElement>(null);
  useModalFocus(true, dialog, () => { /* Publishing is dismissed by completion or transport cancellation. */ }, true);
  const uploading = flow.upload.isBusy;
  const cancelling = flow.upload.phase === 'cancelling';
  const fraction = uploading ? flow.upload.fraction : null;
  const percentage = fraction === null ? null : Math.round(fraction * 100);
  return <ModalPortal><div ref={viewport} className="portalink-confirmation-overlay modal-scrim"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="publish-progress-title" className="portalink-confirmation">
    <LoaderCircleIcon aria-hidden="true" className="mx-auto mb-4 animate-spin" size={28} />
    <h2 id="publish-progress-title">{cancelling ? 'Cancelling upload…' : uploading ? 'Uploading your files' : 'Publishing your project'}</h2>
    <p className="portalink-confirmation-description" role="status">{percentage !== null ? `${percentage}% uploaded` : 'Please wait. Keep this screen open.'}</p>
    {uploading && <progress aria-label="Upload progress" value={fraction === null ? undefined : fraction} max={1} className="mt-4 w-full" />}
    {uploading && <div className="portalink-confirmation-actions"><button type="button" data-ui-shape={onboarding ? 'action' : undefined} disabled={cancelling} onClick={() => void flow.upload.cancel()}>{cancelling ? 'Cancelling…' : 'Cancel upload'}</button></div>}
  </section></div></ModalPortal>;
}
