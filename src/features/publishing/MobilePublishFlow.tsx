import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import '../../components/ui/confirmation-dialog.css';
import { FormattedText } from '../../components/text/FormattedText';
import { FirstProjectFiles } from './FirstProjectFiles';
import { EMPTY_CREATION } from './firstProject';
import React, { useEffect, useRef } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, LoaderCircleIcon } from 'lucide-react';
import { MediaPicker } from '../../components/publishing/MediaPicker';
import { CoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { ProfileField } from '../../components/profile/ProfileField';
import { Button } from '../../components/ui/Button';
import type { usePublishProject } from './usePublishProject';
import { TITLE_MAX_LENGTH } from './validation';

export type MobilePublishStep = 'files' | 'details';
type Flow = ReturnType<typeof usePublishProject>;

/** Presentation steps share the existing draft, validation and upload lifecycle. */
export function MobilePublishFlow({ flow, editingStep, onEditingStepChange, categoryLabel, notices, firstProject }: {
  firstProject?: { name: string; categories: string[]; onSkip: () => void };
  flow: Flow;
  editingStep: MobilePublishStep;
  onEditingStepChange: (step: MobilePublishStep) => void;
  categoryLabel: string;
  notices: React.ReactNode;
}) {
  const stage = flow.hasCommittedProject || flow.step === 'preview' ? 'review' : editingStep;
  const index = ['files', 'details', 'review'].indexOf(stage);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const advancing = useRef(false);
  const preparing = flow.media.state === 'selecting';
  const busy = flow.state === 'publishing' || flow.isSavingDraft || flow.isDiscarding || flow.upload.isCleaningUp || preparing;
  const titles = { files: 'Choose your files', details: 'Tell the story', review: 'Ready to publish?' };
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
        if (firstProject && !flow.metadata.title.trim()) { document.getElementById('publish-title')?.focus(); return; }
        onEditingStepChange('details');
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
  const introduction = Boolean(firstProject && stage === 'files' && !flow.media.items.length);
  const answers = flow.metadata.creationDetails?.answers ?? EMPTY_CREATION.answers;
  const hint = stage === 'files' ? (preparing ? 'Preparing your files…' : !flow.media.isComplete ? 'Choose at least one file to continue.' : null)
    : stage === 'review' && !busy && !flow.upload.failure && flow.publish.status !== 'error' ? (flow.upload.phase === 'uploaded' ? 'Your files are already uploaded. Publish to finish.' : 'Your files upload when you publish.') : null;
  return <form className="project-form-content mobile-publish-flow" data-mobile-publish="" data-first-project={Boolean(firstProject) || undefined} aria-describedby={hint ? 'mobile-publish-hint' : undefined} onSubmit={event => { event.preventDefault(); void advance(); }} noValidate>
    {!introduction && <ol className="mobile-publish-progress" aria-label="Upload steps">
      {['Files', 'Details', 'Review'].map((label, stepIndex) => <li key={label} aria-current={stepIndex === index ? 'step' : undefined} data-complete={stepIndex < index || undefined}>
        <span aria-hidden="true">{stepIndex < index ? <CheckIcon size={14} /> : stepIndex + 1}</span>{label}
      </li>)}
    </ol>}
    {flow.state === 'publishing' && <PublishingProgress flow={flow} />}
    <div ref={bodyRef} className="mobile-publish-body scrollbar-slim">
      {!firstProject || stage !== 'files' ? <header className="mobile-publish-step-heading">
        <h3 id="mobile-publish-step-title" ref={headingRef} tabIndex={-1}>{firstProject && stage === 'details' ? 'Tell it in your own words' : titles[stage]}</h3>
        {stage !== 'review' && <p>{stage === 'files' ? 'Add your work, arrange the files and choose a cover.' : stage === 'details' ? firstProject ? 'A few words are enough. Every answer is optional.' : 'Give your project a title and describe the work.' : ''}</p>}
      </header> : null}
      {notices}
      {flow.saveDraftError && <p role="alert" className="mobile-publish-error">{flow.saveDraftError} Your details and files are still here. Try again.</p>}
      {flow.localDraftError && <p role="alert" className="mobile-publish-error">{flow.localDraftError} Your work is still open here.</p>}
      {stage === 'files' && firstProject ? <FirstProjectFiles flow={flow} busy={busy} name={firstProject.name} categories={firstProject.categories} onSkip={firstProject.onSkip} /> : stage === 'files' ? <div className="project-form-fields">
        <MediaPicker compact expanded media={flow.media} upload={flow.upload} disabled={busy} />
        <CoverFilmstrip compact media={flow.media} disabled={busy || flow.upload.phase === 'uploaded'} />
      </div> : stage === 'details' ? <section className="project-form-details" aria-labelledby="mobile-publish-step-title">
        {firstProject ? <>
          {([['what', 'What is it?', 'The idea, brief or thing you made.'], ['did', 'What did you do?', 'Your role and what you contributed.'], ['learned', 'What did you learn?', 'Something you’ll take into the next project.']] as const).map(([key, label, placeholder]) =>
            <ProfileField key={key} id={`publish-${key}`} label={label} optional multiline maxLength={20000} value={answers[key]} placeholder={placeholder} disabled={busy}
              onChange={value => flow.setCreationDetails({ ...(flow.metadata.creationDetails ?? EMPTY_CREATION), answers: { ...answers, [key]: value } })} />)}
          <p className="first-project-note">Your answers become the description. You can edit it any time — or connect your AI to draft from them.</p>
        </> : <>
        <ProfileField id="publish-title" label="Title" required value={flow.metadata.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" error={flow.fieldErrors.title} disabled={busy} onChange={value => flow.setField('title', value)} />
        <ProfileField id="publish-summary" label="Description" formatting required multiline value={flow.metadata.summary} placeholder="Describe the work" error={flow.fieldErrors.summary} disabled={busy} onChange={value => flow.setField('summary', value)} />
        <ProfileField id="publish-location" label="Location" optional value={flow.location} maxLength={80} placeholder="City or place" disabled={busy} onChange={flow.setLocation} />
        </>}
      </section> : <div className="mobile-publish-review">
        <CoverFilmstrip naturalShape={Boolean(firstProject)} compact readOnly media={flow.media} disabled />
        <div className="mobile-publish-review-details">
          <button type="button" className="mobile-review-editable mobile-review-title" aria-label="Edit project title" disabled={busy || flow.hasCommittedProject} onClick={() => edit('details')}>{flow.metadata.title.trim()}</button>
          <button type="button" className="mobile-review-editable mobile-review-description" aria-label="Edit project description" disabled={busy || flow.hasCommittedProject} onClick={() => edit('details')}><FormattedText text={flow.metadata.summary.trim()} /></button>
          {firstProject && <p>{[flow.metadata.creationDetails?.madeIn, flow.metadata.creationDetails?.field].filter(Boolean).join(' · ')}</p>}
          <dl><div><dt>Portal</dt><dd>{categoryLabel}</dd></div>{flow.location.trim() && <div><dt>Location</dt><dd>{flow.location.trim()}</dd></div>}</dl>

        </div>
        {/* This preserves the real progress, cancellation and cleanup controls. */}
        <MediaPicker compact media={flow.media} upload={flow.state === 'publishing' ? undefined : flow.upload} disabled />
        <button type="button" className="mobile-publish-edit" disabled={busy || flow.hasCommittedProject || flow.upload.phase === 'uploaded'} onClick={() => edit('files')}>Edit files and cover</button>
      </div>}
    </div>
    {!introduction && <footer className="mobile-publish-actions">
      {hint && <p id="mobile-publish-hint" role="status">{hint}</p>}
      <div>
        {stage !== 'files' && <Button type="button" variant="secondary" size="lg" disabled={busy || flow.hasCommittedProject} onClick={() => edit(stage === 'review' ? 'details' : 'files')}><ArrowLeftIcon size={18} aria-hidden="true" />Back</Button>}
        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={flow.state === 'publishing' || flow.isSavingDraft}
          disabled={busy || (stage === 'files' && !flow.media.isComplete) || (stage === 'review' && !flow.canPublish)}>
          {flow.state === 'publishing' ? 'Publishing…' : flow.isSavingDraft ? 'Saving details…' : stage === 'review' ? flow.hasCommittedProject ? 'Finish saving details' : 'Publish project' : stage === 'details' ? 'Review project' : 'Continue'}
          {!busy && stage !== 'review' && <ArrowRightIcon size={20} aria-hidden="true" />}
        </Button>
      </div>
    </footer>}
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
