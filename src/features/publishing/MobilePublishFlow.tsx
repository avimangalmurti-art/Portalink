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
import { TITLE_MAX_LENGTH } from './validation';

export type MobilePublishStep = 'files' | 'details';
type Flow = ReturnType<typeof usePublishProject>;

/** Presentation steps share the existing draft, validation and upload lifecycle. */
export function MobilePublishFlow({ flow, editingStep, onEditingStepChange, notices, firstProject, detailsFirst = false }: {
  detailsFirst?: boolean;
  firstProject?: { name: string; categories: string[]; onSkip: () => void };
  flow: Flow;
  editingStep: MobilePublishStep;
  onEditingStepChange: (step: MobilePublishStep) => void;
  categoryLabel: string;
  notices: React.ReactNode;
}) {
  const stage = flow.hasCommittedProject || flow.step === 'preview' ? 'review' : editingStep;
  const stages = detailsFirst ? ['details', 'files', 'review'] : ['files', 'details', 'review'];
  const index = stages.indexOf(stage);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const advancing = useRef(false);
  const preparing = flow.media.state === 'selecting';
  const busy = flow.state === 'publishing' || flow.isSavingDraft || flow.isDiscarding || flow.upload.isCleaningUp || preparing;
  const titles = { files: 'Create your cover', details: 'Project details', review: 'Review project' };
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [stage]);
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
    if (stage === 'files') {
      if (flow.media.isComplete) {
        if (detailsFirst) await flow.goToPreview();
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
  const hint = stage === 'files' ? (preparing ? 'Preparing your files…' : !flow.media.isComplete ? 'Choose at least one file to continue.' : null)
    : null;
  const editAction = (label: string, target: MobilePublishStep) => <button type="button" aria-label={label} disabled={busy || flow.hasCommittedProject || (target === 'files' && flow.upload.phase === 'uploaded')} onClick={() => edit(target)}><PencilIcon size={16} aria-hidden="true" />Edit</button>;
  return <form className="project-form-content mobile-publish-flow" data-mobile-publish="" data-cover-step={stage === 'files' || undefined} data-details-step={stage === 'details' || undefined} data-review-step={stage === 'review' || undefined} data-first-project={Boolean(firstProject) || undefined} aria-describedby={hint ? 'mobile-publish-hint' : undefined} onSubmit={event => { event.preventDefault(); void advance(); }} noValidate>
    <ol className="mobile-publish-progress" aria-label="Upload steps">
      {(detailsFirst ? ['Details', 'Files', 'Review'] : ['Files', 'Details', 'Review']).map((label, stepIndex) => <li key={label} aria-current={stepIndex === index ? 'step' : undefined} data-complete={stepIndex < index || undefined}>
        <span aria-hidden="true">{stepIndex < index ? <CheckIcon size={14} /> : stepIndex + 1}</span>{label}
      </li>)}
    </ol>
    {flow.state === 'publishing' && <PublishingProgress flow={flow} />}
    <div ref={bodyRef} className="mobile-publish-body scrollbar-slim">
      <header className="mobile-publish-step-heading">
        <h3 id="mobile-publish-step-title" ref={headingRef} tabIndex={-1}>{titles[stage]}</h3>
        {stage === 'files' && <p>Choose an image, adjust the crop and make it look its best.</p>}
      </header>
      {notices}
      {flow.saveDraftError && <p role="alert" className="mobile-publish-error">{flow.saveDraftError} Your details and files are still here. Try again.</p>}
      {flow.localDraftError && <p role="alert" className="mobile-publish-error">{flow.localDraftError} Your work is still open here.</p>}
      {stage === 'files' ? <MobileCoverFiles media={flow.media} upload={flow.upload} disabled={busy} /> : stage === 'details' ? <section className="project-form-details" aria-labelledby="mobile-publish-step-title">
        <ProfileField id="publish-title" label="Title" required requiredIndicator="asterisk" workspace clearable value={flow.metadata.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" error={flow.fieldErrors.title} disabled={busy} onChange={value => flow.setField('title', value)} />
        <ProfileField id="publish-summary" label="Description" formatting optional optionalParentheses workspace multiline value={flow.metadata.summary} placeholder="Describe the work" error={flow.fieldErrors.summary} disabled={busy} onChange={value => flow.setField('summary', value)} />
        <ProjectCitationFields metadata={flow.metadata} disabled={busy} onChange={flow.setCitationFields}/>
        <ProfileField id="publish-location" label="Location" optional optionalParentheses workspace clearable leadingIcon={<MapPinIcon size={20} aria-hidden="true" />} value={flow.location} maxLength={80} placeholder="City or place" disabled={busy} onChange={flow.setLocation} />
      </section> : <div className="mobile-publish-review">
        <section className="mobile-review-card mobile-review-cover" aria-label="Cover">
          <header><h4>Cover</h4>{editAction('Edit cover', 'files')}</header>
          <CoverFilmstrip compact readOnly media={flow.media} disabled />
        </section>
        <section className="mobile-review-card mobile-publish-review-details" aria-label="Project details">
          <header><h4>Project details</h4>{editAction('Edit project details', 'details')}</header>
          <dl><div><dt>Title</dt><dd>{flow.metadata.title.trim()}</dd></div>
            {flow.metadata.summary.trim() && <div><dt>Description</dt><dd className="mobile-review-summary"><FormattedText text={flow.metadata.summary.trim()} /></dd></div>}
            {flow.location.trim() && <div><dt>Location</dt><dd><MapPinIcon size={16} aria-hidden="true" />{flow.location.trim()}</dd></div>}
          </dl>
        </section>
        <section className="mobile-review-card mobile-review-files" aria-label="Selected files">
          <header><h4>Selected files</h4>{editAction('Edit selected files', 'files')}</header>
          <div className="mobile-review-file-summary"><div className="mobile-review-thumbnails">{flow.media.items.slice(0, 3).map(item => <span key={item.id}>{item.previewUrl && item.family === 'image' ? <img src={item.previewUrl} alt="" /> : <FileIcon size={24} aria-hidden="true" />}</span>)}{flow.media.items.length > 3 && <span className="mobile-review-more">+{flow.media.items.length - 3}</span>}</div><span>{flow.media.items.length} {flow.media.items.length === 1 ? 'file' : 'files'}</span></div>
        </section>
        {/* Exceptional transport states retain the existing retry/cleanup actions. */}
        {(flow.upload.failure || flow.upload.cleanupError) && <div className="mobile-review-transport"><MediaPicker compact media={flow.media} upload={flow.upload} disabled /></div>}
      </div>}
    </div>
    <footer className="mobile-publish-actions">
      {hint && <p id="mobile-publish-hint" role="status">{hint}</p>}
      <div>
        {(stage !== 'files' || detailsFirst) && <Button type="button" variant="secondary" size="lg" disabled={busy || flow.hasCommittedProject} onClick={() => edit(stage === 'review' || stage === 'files' ? 'details' : 'files')}><ArrowLeftIcon size={18} aria-hidden="true" />Back</Button>}
        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={flow.state === 'publishing' || flow.isSavingDraft}
          disabled={busy || (stage === 'files' && !flow.media.isComplete) || (stage === 'review' && !flow.canPublish)}>
          {flow.state === 'publishing' ? 'Publishing…' : flow.isSavingDraft ? 'Saving details…' : stage === 'review' ? flow.hasCommittedProject ? 'Finish saving details' : 'Publish project' : detailsFirst && !flow.media.isComplete ? 'Continue to upload' : stage === 'details' || detailsFirst ? 'Review project' : 'Continue'}
          {!busy && <ArrowRightIcon size={20} aria-hidden="true" />}
        </Button>
      </div>
    </footer>
  </form>;
}

function PublishingProgress({flow}: {flow: Flow}) {
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
    {uploading && <div className="portalink-confirmation-actions"><button type="button" disabled={cancelling} onClick={() => void flow.upload.cancel()}>{cancelling ? 'Cancelling…' : 'Cancel upload'}</button></div>}
  </section></div></ModalPortal>;
}
