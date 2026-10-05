import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, BoxIcon, BriefcaseBusinessIcon, BrushIcon, CameraIcon, CheckIcon, ChevronRightIcon, FileIcon, FolderIcon, GlobeIcon, ImageIcon, LaptopIcon, LayersIcon, MoreHorizontalIcon, MusicIcon, RulerIcon, TagIcon, TypeIcon } from 'lucide-react';
import type { Profile, PortfolioCategory } from '../../types/domain';
import type { PublishResult } from '../../types/publishing';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { PortalIconLibrary } from '../../components/profile/PortalIconLibrary';
import { CoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { generateCoverThumbnails } from '../media/coverThumbnailRenderer';
import { usePublishProject } from './usePublishProject';
import { validateTitle, TITLE_MAX_LENGTH } from './validation';
import { MAX_CATEGORY_LABEL, validateCategoryLabel } from '../profile/useCategoryManagement';
import { beginActivation, readActivation, writeActivation, type ActivationProgress } from './activationState';
import './first-run-activation.css';

const icons = [
  ['lucide:briefcase-business', 'Work', BriefcaseBusinessIcon], ['lucide:camera', 'Photography', CameraIcon], ['lucide:type', 'Typography', TypeIcon], ['lucide:box', 'Objects', BoxIcon],
  ['lucide:brush', 'Art', BrushIcon], ['lucide:book-open', 'Study', BookOpenIcon], ['lucide:globe', 'World', GlobeIcon], ['lucide:laptop', 'Digital', LaptopIcon],
  ['lucide:ruler', 'Design', RulerIcon], ['lucide:music', 'Music', MusicIcon], ['lucide:layers', 'Layers', LayersIcon],
] as const;
type Flow = ReturnType<typeof usePublishProject>;
type Step = 'files' | 'details' | 'review';

/** The six-screen activation presentation uses the same persisted draft and publish hook as Studio. */
export function FirstRunActivation({ accountId, profile, onViewProject, onAnotherProject }: {
  accountId: string; profile: Profile; onViewProject: (result: PublishResult) => void; onAnotherProject: () => void;
}) {
  const { profiles } = useServices();
  const { invalidateProfiles } = useProfileData();
  const [progress, setProgress] = useState<ActivationProgress>(() => readActivation(accountId) ?? beginActivation(accountId, profile.id));
  const progressRef = useRef(progress); progressRef.current = progress;
  const flow = usePublishProject(profile.id, progress.portal?.id ?? null, Boolean(progress.portal) && progress.stage !== 'live', progress.portal?.label ?? '', true, true, '', { persist: true, activation: true });
  const [portalBusy, setPortalBusy] = useState(false);
  const portalLock = useRef(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [showIcons, setShowIcons] = useState(false);
  const viewport = useDialogViewport();
  const panel = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = portalBusy || flow.state === 'publishing' || flow.isSavingDraft || flow.upload.isBusy || flow.media.state === 'selecting';
  const update = (patch: Partial<ActivationProgress>) => {
    const next = { ...progressRef.current, ...patch }; progressRef.current = next;
    writeActivation(accountId, next); setProgress(next);
  };
  const step: Step = flow.step === 'preview' || flow.hasCommittedProject ? 'review' : flow.firstProjectStage === 'details' ? 'details' : 'files';
  const edit = (next: 'files' | 'details') => {
    if (busy || flow.hasCommittedProject) return;
    flow.upload.dismissFailure(); flow.publish.reset(); flow.dismissSaveDraftError();
    flow.setFirstProjectStage(next); flow.setStep('metadata');
  };
  const back = () => {
    if (busy || flow.hasCommittedProject || progress.stage === 'live') return;
    if (showIcons) { setShowIcons(false); return; }
    if (progress.stage === 'portal') update({ stage: 'start' });
    else if (progress.stage === 'project') {
      if (step === 'review') edit('details');
      else if (step === 'details') edit('files');
      else update({ stage: 'portal' });
    }
  };
  useModalFocus(true, panel, back, true);
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true });
  }, [progress.stage, step, showIcons]);
  useEffect(() => {
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !panel.current?.contains(active) || !active.matches('input,textarea')) return;
        const field = active.getBoundingClientRect(), bounds = panel.current.getBoundingClientRect();
        if (field.bottom > bounds.bottom - 12 || field.top < bounds.top + 12) active.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
    };
    window.visualViewport?.addEventListener('resize', reveal);
    return () => { cancelAnimationFrame(frame); window.visualViewport?.removeEventListener('resize', reveal); };
  }, []);
  useEffect(() => {
    if (flow.step === 'done' && flow.result?.mediaPersisted && !flow.result.sessionOnly && progressRef.current.stage !== 'live') {
      const next = { ...progressRef.current, stage: 'live' as const, result: flow.result };
      progressRef.current = next; writeActivation(accountId, next); setProgress(next);
    }
  }, [flow.step, flow.result, accountId]);
  async function createPortal() {
    if (portalLock.current) return;
    const invalid = validateCategoryLabel(progress.name, profile.categories, progress.portal?.id ?? null);
    if (invalid) { setPortalError(invalid.replace(/category/g, 'portal')); return; }
    portalLock.current = true; setPortalBusy(true); setPortalError(null);
    try {
      let portal: PortfolioCategory;
      if (progress.portal) {
        portal = progress.portal as PortfolioCategory;
        if (progress.name.trim() !== portal.label) portal = await profiles.renameCategory(profile.id, portal.id, progress.name.trim());
        update({ portal: { id: portal.id, label: portal.label, iconName: progress.portal.iconName } });
        if (progress.icon !== progress.portal.iconName) portal = await profiles.setCategoryIcon(profile.id, portal.id, progress.icon);
      } else {
        portal = await profiles.createCategory(profile.id, { label: progress.name.trim(), iconName: progress.icon });
      }
      update({ portal: { id: portal.id, label: progress.name.trim(), iconName: progress.icon }, stage: 'project' });
      invalidateProfiles();
    } catch (error) { setPortalError(error instanceof Error ? error.message : 'Could not create your portal. Please try again.'); }
    finally { portalLock.current = false; setPortalBusy(false); }
  }
  const titles = { files: 'Add your first project', details: 'Add project details', review: 'Review your project' };
  const descriptions = { files: 'Upload a file and choose a cover image.', details: 'Give your project a title and a short description.', review: 'Make sure everything looks good before publishing.' };
  const title = progress.stage === 'start' ? 'Your work starts here.' : progress.stage === 'portal' ? 'Create your first portal' : progress.stage === 'live' ? 'Your first project is live!' : titles[step];
  const advancing = useRef(false);
  async function advance() {
    if (busy || advancing.current) return;
    advancing.current = true;
    try {
      if (step === 'files' && flow.media.isComplete && !flow.media.error) flow.setFirstProjectStage('details');
      else if (step === 'details') await flow.goToPreview();
      else if (flow.upload.failure) await flow.retryUpload();
      else if (flow.publish.status === 'error') await flow.retryPublish();
      else if (flow.canPublish) await flow.publish.run();
    } finally { advancing.current = false; }
  }
  const revealField = (event: React.FocusEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('input,textarea')) return;
    event.target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  };
  return <ModalPortal><div ref={viewport} className="first-run-viewport">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="activation-title" tabIndex={-1} className="first-run-panel" data-activation-stage={progress.stage} data-activation-step={step}>
      <div ref={scroll} className="first-run-scroll" onFocusCapture={revealField}>
        {progress.stage !== 'start' && progress.stage !== 'live' && <button type="button" className="activation-back" aria-label="Back" disabled={busy || flow.hasCommittedProject} onClick={back}><ArrowLeftIcon size={24}/></button>}
        {progress.stage === 'project' && <ol className="activation-progress" aria-label="Project steps">{['File', 'Details', 'Review', 'Publish'].map((label, index) => {
          const active = flow.state === 'publishing' ? 3 : ['files', 'details', 'review'].indexOf(step);
          return <li key={label} aria-current={index === active ? 'step' : undefined} data-complete={index < active || undefined}><span>{index < active ? <CheckIcon size={18}/> : index + 1}</span>{label}</li>;
        })}</ol>}
        {progress.stage === 'live' && <img className="activation-success-art" src="/portalink-favicon.png" alt="Portalink figure holding the world" width={1254} height={1254}/>}
        <header className="activation-heading"><h1 id="activation-title" ref={heading} tabIndex={-1}>{progress.stage === 'start' ? <>Your work starts here<span className="activation-required">.</span></> : title}</h1><p>{progress.stage === 'start' ? 'Create your first project and begin building a record of what you make.' : progress.stage === 'portal' ? 'A portal is where you keep related projects together.' : progress.stage === 'live' ? 'You’ve created your first portal and shared a project. Keep going and build your world.' : descriptions[step]}</p></header>
        {progress.stage === 'start' && <img className="activation-start-art" src="/portalink-first-work.png" alt="Portalink figure holding DON’T THINK / THINK TWICE artwork" width={1254} height={1254}/>}
        {progress.stage === 'portal' && <form id="activation-portal-form" className="activation-fields" onSubmit={event => { event.preventDefault(); void createPortal(); }} noValidate>
          <label htmlFor="activation-portal-name">Portal name <span className="activation-required">*</span></label>
          <input id="activation-portal-name" required maxLength={MAX_CATEGORY_LABEL} value={progress.name} disabled={portalBusy} placeholder="e.g. Work, Design, School…" autoComplete="off" onChange={event => { update({ name: event.target.value }); setPortalError(null); }}/>
          <fieldset className="activation-icons"><legend>Choose an icon</legend><div>{icons.map(([name, label, Icon]) => <button key={name} type="button" aria-label={label} aria-pressed={progress.icon === name} disabled={portalBusy} onClick={() => update({ icon: name })}><Icon size={28}/></button>)}<button type="button" aria-label="More icons" aria-expanded={showIcons} onClick={() => setShowIcons(value => !value)}><MoreHorizontalIcon size={28}/></button></div></fieldset>
          {showIcons && <PortalIconLibrary selected={progress.icon} compact disabled={portalBusy} onSelect={icon => { update({ icon }); setShowIcons(false); }}/ >}
          {portalError && <p role="alert" className="activation-error">{portalError}</p>}
        </form>}
        {progress.stage === 'project' && <>
          {(flow.restoringDraft || !flow.draft) ? <div className="activation-loading" role={flow.draftError ? 'alert' : 'status'}>{flow.draftError ?? 'Preparing your project…'}{flow.draftError && <button type="button" onClick={() => window.location.reload()}>Try again</button>}</div>
            : step === 'files' ? <ActivationFiles flow={flow} busy={busy}/>
            : step === 'details' ? <ActivationDetails flow={flow} busy={busy} isPrivate={Boolean(profile.isPrivate)}/>
            : <ActivationReview flow={flow} portal={progress.portal!} isPrivate={Boolean(profile.isPrivate)} busy={busy} onEdit={edit} onPortal={() => update({ stage: 'portal' })}/>}
          {flow.step === 'done' && flow.result && (!flow.result.mediaPersisted || flow.result.sessionOnly) && <p role="alert" className="activation-error">This is a local preview. Your project has not been saved online.</p>}
          {flow.localDraftError && <p role="alert" className="activation-error">{flow.localDraftError}</p>}
          {flow.saveDraftError && <p role="alert" className="activation-error">{flow.saveDraftError}</p>}
          {(flow.upload.failure || flow.publish.status === 'error') && <p role="alert" className="activation-error">{flow.upload.failure?.message ?? flow.publish.error} Your work is still here. Try again.</p>}
          {flow.state === 'publishing' && <p role="status" className="activation-status">{flow.upload.fraction != null ? `Uploading ${Math.round(flow.upload.fraction * 100)}%…` : 'Publishing your project…'}</p>}
        </>}
        <footer className="activation-actions">
          {progress.stage === 'start' ? <Primary onClick={() => update({ stage: 'portal' })}>Create your first project</Primary>
            : progress.stage === 'portal' ? <Primary form="activation-portal-form" pending={portalBusy} disabled={Boolean(validateCategoryLabel(progress.name, profile.categories, progress.portal?.id ?? null))}>Create portal</Primary>
            : progress.stage === 'live' && progress.result ? <><Primary onClick={() => onViewProject(progress.result!)}>View project</Primary><button type="button" className="activation-secondary" onClick={onAnotherProject}>Create another project</button></>
            : <Primary pending={busy} disabled={busy || !flow.draft || flow.restoringDraft || (step === 'files' ? !flow.media.isComplete || Boolean(flow.media.error) : step === 'details' ? Boolean(validateTitle(flow.metadata.title)) : !flow.canPublish && !flow.upload.failure && flow.publish.status !== 'error')} onClick={() => void advance()}>{step === 'review' ? flow.upload.failure || flow.publish.status === 'error' ? 'Try again' : 'Publish project' : 'Continue'}</Primary>}
        </footer>
      </div>
    </section>
  </div></ModalPortal>;
}
function Primary({ children, onClick, form, disabled, pending }: { children: React.ReactNode; onClick?: () => void; form?: string; disabled?: boolean; pending?: boolean }) {
  return <button type={form ? 'submit' : 'button'} form={form} className="activation-primary" disabled={disabled || pending} aria-busy={pending || undefined} onClick={onClick}><span>{pending ? 'Please wait…' : children}</span>{!pending && <ArrowRightIcon size={24}/>}</button>;
}

function ActivationFiles({ flow, busy }: { flow: Flow; busy: boolean }) {
  const photos = useRef<HTMLInputElement>(null), files = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const cover = flow.media.cover, file = flow.media.items[0];
  const [customizing, setCustomizing] = useState(false);
  const initialized = useRef(new Set<string>());
  useEffect(() => {
    if (!cover || initialized.current.has(cover.id)) return;
    initialized.current.add(cover.id);
    if (!cover.metadata?.coverFrame) flow.media.setCoverFrame(cover.id, { x: .5, y: .5, zoom: 1, aspectRatio: 1 });
  }, [cover, flow.media]);
  const select = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) flow.media.select(Array.from(event.target.files).slice(0, 1), file?.id);
    event.target.value = '';
  };
  const ratio = cover?.metadata?.coverFrame?.aspectRatio ?? 1;
  const shapes = [['Square', '1:1', 1], ['Portrait', '3:4', 3 / 4], ['Landscape', '4:3', 4 / 3], ['Custom', 'Free', 0]] as const;
  return <div className="activation-file">
    <input ref={photos} className="sr-only" type="file" accept="image/*,video/*" aria-label="Choose from Photos" disabled={busy} onChange={select}/>
    <input ref={files} className="sr-only" type="file" aria-label="Choose from Files" disabled={busy} onChange={select}/>
    <input ref={camera} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take a photo" disabled={busy} onChange={select}/>
    <div className="activation-file-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) flow.media.select(Array.from(event.dataTransfer.files).slice(0, 1), file?.id); }}>
      {file ? <ActivationCover flow={flow}/> : <ImageIcon size={38}/>}<button type="button" disabled={busy} onClick={() => files.current?.click()}>{file ? 'Choose another file' : 'Choose a file'}</button>{!file && <small>PNG, JPG, PDF, or other files</small>}
    </div>
    <div className="activation-sources"><button type="button" disabled={busy} onClick={() => photos.current?.click()}><ImageIcon/>Photos</button><button type="button" disabled={busy} onClick={() => files.current?.click()}><FolderIcon/>Files</button><button type="button" disabled={busy} onClick={() => camera.current?.click()}><CameraIcon/>Camera</button></div>
    {flow.media.error && <p role="alert" className="activation-error">{flow.media.error}</p>}
    <section className="activation-cover-options"><h2>Cover image</h2><p>Choose how your cover looks.</p><div className="activation-shapes">{shapes.map(([label, subtitle, shape]) => <button type="button" key={label} aria-pressed={shape ? ratio === shape && !customizing : customizing} disabled={!cover || busy || flow.upload.phase === 'uploaded'} onClick={() => {
      if (!cover) return;
      if (!shape) { setCustomizing(true); return; }
      setCustomizing(false);
      flow.media.setCoverFrame(cover.id, { x: .5, y: .5, zoom: 1, aspectRatio: shape });
    }}><span className="activation-shape-tile"><i style={{ aspectRatio: shape || 1 }} data-free={!shape || undefined}/></span><strong>{label}</strong><small>{subtitle}</small></button>)}</div>
      {customizing && cover && <CoverFilmstrip media={flow.media} disabled={busy} naturalShape freeShape/>}
    </section>
  </div>;
}
function ActivationCover({ flow }: { flow: Flow }) {
  const cover = flow.media.cover;
  const [preview, setPreview] = useState<{ key: string; url?: string; error?: string }>({ key: '' });
  const [attempt, setAttempt] = useState(0);
  const key = `${cover?.id}:${cover?.metadata?.coverPageNumber ?? 1}:${JSON.stringify(cover?.metadata?.coverFrame)}`;
  const current = useRef(flow); current.current = flow;
  useEffect(() => {
    if (!cover?.previewUrl || !['image', 'document', 'video'].includes(cover.family)) return;
    let cancelled = false, url: string | undefined;
    void generateCoverThumbnails({ kind: cover.family as 'image' | 'document' | 'video', sourceUrl: cover.previewUrl, pageNumber: cover.metadata?.coverPageNumber ?? 1, frame: cover.metadata?.coverFrame }, info => {
      if (!cancelled) current.current.media.setPageCount(cover.id, info.pageCount, info.width && info.height ? { widthPixels: info.width, heightPixels: info.height } : undefined);
    }).then(variants => {
      if (cancelled) return;
      const variant = variants.find(item => item.size === 800);
      if (!variant) throw new Error('Could not prepare your cover.');
      url = URL.createObjectURL(variant.blob); setPreview({ key, url });
    }).catch(error => { if (!cancelled) setPreview({ key, error: error instanceof Error ? error.message : 'Could not prepare your cover.' }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [cover?.id, cover?.family, cover?.previewUrl, key, attempt]);
  return <span className="activation-cover-preview">{preview.key === key && preview.url ? <img src={preview.url} alt="Your selected project cover"/> : cover?.family === 'image' && cover.previewUrl ? <img src={cover.previewUrl} alt="Your selected project cover"/> : <span role="status">{cover && ['document', 'video'].includes(cover.family) ? 'Preparing your cover…' : <FileIcon size={36}/>}</span>}{preview.key === key && preview.error && <span role="alert">{preview.error}<button type="button" onClick={() => setAttempt(value => value + 1)}>Retry cover</button></span>}</span>;
}
function ActivationDetails({ flow, busy, isPrivate }: { flow: Flow; busy: boolean; isPrivate: boolean }) {
  return <div className="activation-fields">
    <label htmlFor="publish-title">Project title <span className="activation-required">*</span></label><input id="publish-title" required maxLength={TITLE_MAX_LENGTH} value={flow.metadata.title} disabled={busy} placeholder="e.g. Concept Design, Brand Identity…" onChange={event => flow.setField('title', event.target.value)}/>
    {flow.fieldErrors.title && <p role="alert" className="activation-error">{flow.fieldErrors.title}</p>}
    <label htmlFor="publish-summary">Description</label><textarea id="publish-summary" value={flow.metadata.summary} disabled={busy} placeholder="Tell the story behind your project…" onChange={event => flow.setField('summary', event.target.value)}/>
    <label htmlFor="activation-tags" className="activation-divider">Tags <span>(optional)</span></label><input id="activation-tags" value={flow.metadata.tags ?? ''} disabled={busy} placeholder="e.g. Design, Architecture, 3D…" onChange={event => flow.setField('tags', event.target.value)}/>
    <label className="activation-divider">Visibility</label><div className="activation-visibility"><GlobeIcon/><div><strong>{isPrivate ? 'Private profile' : 'Public'}</strong><small>{isPrivate ? 'Visible to your approved followers' : 'Anyone can see this project'}</small></div></div>
  </div>;
}
function ActivationReview({ flow, portal, isPrivate, busy, onEdit, onPortal }: { flow: Flow; portal: NonNullable<ActivationProgress['portal']>; isPrivate: boolean; busy: boolean; onEdit: (step: 'files' | 'details') => void; onPortal: () => void }) {
  return <div className="activation-review"><div className="activation-review-cover"><ActivationCover flow={flow}/><button type="button" disabled={busy || flow.hasCommittedProject} onClick={() => onEdit('files')}>Edit cover</button></div>{[
    ['Project title', flow.metadata.title, TypeIcon, () => onEdit('details')], ['Description', flow.metadata.summary || 'Not added', LayersIcon, () => onEdit('details')], ['Tags', flow.metadata.tags || 'Not added', TagIcon, () => onEdit('details')], ['Visibility', isPrivate ? 'Private profile' : 'Public', GlobeIcon, () => onEdit('details')], ['Portal', portal.label, FolderIcon, onPortal],
  ].map(([label, value, Icon, action]) => {
    const RowIcon = Icon as typeof TypeIcon;
    return <button key={String(label)} type="button" className="activation-review-row" disabled={busy || flow.hasCommittedProject} onClick={action as () => void}><RowIcon size={22}/><span>{String(label)}</span><strong>{String(value)}</strong><ChevronRightIcon size={18}/></button>;
  })}</div>;
}
