import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowLeftIcon, AlertCircleIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, FileIcon, InfoIcon, PlusIcon, StarIcon, XIcon } from 'lucide-react';
import { ProjectCoverRepositionDialog } from '../../components/media/ProjectCoverRepositionDialog';
import { ProjectCover } from '../../components/media/ProjectCover';
import { PublishedCoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { ProjectFormDialog, ProjectDiscardConfirmation } from '../../components/publishing/ProjectFormDialog';
import { useAuthoringFocus } from '../../components/publishing/useAuthoringFocus';
import { ProjectPreviewFrame } from '../../components/publishing/ProjectPreviewFrame';
import { ProfileField } from '../../components/profile/ProfileField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ResponsiveImage } from '../../components/ui/ResponsiveImage';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { TITLE_MAX_LENGTH } from '../publishing/validation';
import { usePresentation } from '../../presentation/usePresentation';
import type { ProjectManagement } from './useProjectManagement';

const madeOnFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const projectAccessNote = "Others' AI tools may use single pages or images from this project, always with your name and a link back.";

/**
 * Editing a published project's real public record.
 *
 * It edits the SAME canonical fields the project already has — title, summary,
 * and each attachment's title, order, and cover flag — rather than a
 * parallel "editable project". Removing a file here only drops it from the edit;
 * the published project keeps every file until the save commits, and cleaning up
 * storage afterwards is the service's business.
 */
export function ProjectEditorDialog({
  management


}: {management: ProjectManagement;}) {
  const {
    editor
  } = management;
  const isMobile = usePresentation() === 'mobile';
  const isOpen = editor.projectId !== null;
  const [section, setSection] = useState<'details' | 'files'>('details');
  useEffect(() => {
    setSection(editor.mode === 'files' || editor.mode === 'cover-choice' ? 'files' : 'details');
  }, [editor.projectId, editor.mode]);
  const EditorFrame = isMobile ? MobileProjectEditorScreen : ProjectFormDialog;
  const [repositionId, setRepositionId] = useState<string | null>(null);
  const coverEdit = editor.attachmentEdits.find((item) => item.isCover);
  const coverSource = editor.originalAttachments.find((item) => item.id === coverEdit?.id);
  const coverPreviewRatio = coverEdit?.coverFrame?.aspectRatio ?? coverSource?.metadata?.aspectRatio ??
    (coverSource?.metadata?.widthPixels && coverSource.metadata.heightPixels ? coverSource.metadata.widthPixels / coverSource.metadata.heightPixels : 1);
  const repositionSource = editor.originalAttachments.find((item) => item.id === repositionId);
  const repositionEdit = editor.attachmentEdits.find((item) => item.id === repositionId);
  useEffect(() => setRepositionId(null), [editor.projectId]);
  // Preparation AND transport are owned by the management boundary. This dialog
  // only reads their state and calls their callbacks; it never touches a service.
  const added = editor.addedMedia;
  const upload = editor.upload;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  useEffect(() => {
    if (!isOpen) setIsConfirmingDiscard(false);
  }, [isOpen]);
  const isLocked = editor.isSaving || editor.isTransferring;
  const queuedFilesLocked = isLocked || (isMobile && upload.hasPersistedMedia);
  const requestClose = () => {
    if (isLocked || upload.isCleaningUp) return;
    if (editor.isDirty) {
      setIsConfirmingDiscard(true);
      return;
    }
    void editor.close();
  };
  useEffect(() => {
    if (editor.phase === 'editing') {
      const frame = requestAnimationFrame(() => {
        if (editor.mode === 'journey') { document.getElementById('project-made-in')?.focus(); return; }
        if (editor.mode === 'files') {
          document.getElementById('project-replacement-files')?.focus();
          return;
        }
        if (editor.mode === 'story') {
          document.getElementById('project-summary')?.focus();
          return;
        }
        if (editor.mode === 'description') {
          document.getElementById('project-summary')?.focus();
          return;
        }
        if (editor.mode === 'cover' || editor.mode === 'cover-choice') {
          const choice = dialogRef.current?.querySelector<HTMLButtonElement>('[data-project-cover-choice]:not(:disabled)');
          (choice ?? document.getElementById('project-replacement-files'))?.focus({ preventScroll: true });
          return;
        }
        document.getElementById('project-replacement-files')?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [editor.mode, editor.phase]);
  if (!isOpen) {
    return null;
  }
  // A card's Reposition action is one transaction; only confirmed Save
  // writes to the project. Closing or cancelling leaves the existing crop.
  if (editor.mode === 'cover') {
    if (editor.phase !== 'loading' && editor.phase !== 'load-failed' && coverSource?.sourceUrl && ['image', 'document', 'video'].includes(coverSource.kind) && coverEdit) {
      return <ProjectCoverRepositionDialog key={`${editor.projectId}:${coverSource.id}`} source={coverSource.sourceUrl} kind={coverSource.kind === 'document' ? 'document' : coverSource.kind === 'video' ? 'video' : 'image'} pageNumber={coverSource.metadata?.coverPageNumber} alt={editor.metadata.title} aspectRatio={editor.previewAspectRatio} frame={coverEdit.coverFrame} onClose={() => { void editor.close(); }} onSave={async ({ frame }) => {
        const outcome = await editor.save({ attachmentId: coverSource.id, frame });
        if (outcome === 'failed') throw new Error('The preview could not be saved. Your adjustments are still here; try Save again.');
        if (outcome) throw new Error(`Add a project ${outcome === 'summary' ? 'description' : 'title'} in Edit project before saving this preview.`);
        await editor.close();
      }} />;
    }
    return <ProjectFormDialog mobileFlow={isMobile} title={isMobile ? 'Edit cover' : 'Reposition project preview'} titleId="project-preview-editor-title" onClose={() => { void editor.close(); }}>
      <div className="project-form-content scrollbar-slim">{editor.phase === 'loading' ? <LoadingState label="Loading project preview…" /> : editor.phase === 'load-failed' ? <ErrorState title="The preview could not be opened" description={editor.loadError ?? undefined} onRetry={editor.retryLoad} /> : <ErrorState title="No cover preview is available" description="Choose a cover file in Edit project first." />}</div>
    </ProjectFormDialog>;
  }
  const canAddFiles = added.capability?.isAvailable === true;
  const focusField = (key: string) => {
    requestAnimationFrame(() => document.getElementById(`project-${key}`)?.focus());
  };
  async function saveChanges() {
    // One call: the boundary uploads any new files, waits for real persisted
    // references, and only then updates the published project.
    const outcome = await editor.save(undefined, isMobile);
    if (outcome && outcome !== 'failed') {
      if (isMobile) setSection('details');
      focusField(outcome);
    }
  }
  const saveDisabled = (!editor.isDirty && editor.mode !== 'cover-choice') || isLocked || editor.phase === 'loading' || editor.phase === 'load-failed';
  const saveLabel = editor.isTransferring ? 'Uploading…' : editor.isSaving ? 'Saving…' : 'Save changes';
  const saveFeedback = editor.failure || (editor.phase === 'saved' && editor.result) ? <>
    {editor.failure && <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
      <AlertCircleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {editor.failure.message}
        {editor.failure.code === 'conflict' && ' Reopen this project to see the current version before saving again.'}
        {editor.failure.retry && <button type="button" onClick={isMobile ? () => void saveChanges() : editor.failure.retry} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Try again</button>}
      </span>
    </p>}
    {editor.phase === 'saved' && editor.result && <p role="status" className="flex items-start gap-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
      <InterfaceIcon icon={CheckIcon} size="sm" weight="medium" className="mt-[2px]" />
      <span className="min-w-0">{editor.result.message ?? 'Your changes are saved.'}</span>
    </p>}
  </> : null;
  const mobileHeader = isMobile ? {
    saveAction: <Button type="submit" form="project-editor-form" className="project-editor-header-save" data-ui-shape="action"
      variant="primary" size="sm" isLoading={isLocked} disabled={saveDisabled} aria-label={saveLabel}>
      {isLocked ? null : 'Save'}
    </Button>,
    saveFeedback,
  } : {};
  const attachmentSources = new Map(editor.originalAttachments.map(attachment => [attachment.id, attachment]));
  const photoIds = isMobile ? editor.attachmentEdits.filter(edit => attachmentSources.get(edit.id)?.kind === 'image').map(edit => edit.id) : [];
  const queuedPhotoIds = isMobile && !upload.hasPersistedMedia ? added.items.filter(item => item.family === 'image').map(item => item.id) : [];
  const canEditCover = Boolean(coverSource?.sourceUrl && ['image', 'video', 'document'].includes(coverSource.kind));
  const coverPage = coverSource?.metadata?.coverPageNumber ?? 1;
  const renderedCoverPage = coverSource?.metadata?.renderedPages?.find(page => page.withinDocumentIndex === coverPage)?.sourceUrl ?? undefined;
  const madeOn = editor.metadata.madeOn ?? '';
  const madeOnDate = new Date(`${madeOn}T00:00:00Z`);
  const accessControls = <label className={isMobile ? 'project-editor-access' : undefined}>
    Access
    <select data-ui-shape={isMobile ? 'field' : undefined} aria-describedby={isMobile ? 'project-editor-access-note' : undefined}
      value={editor.metadata.accessLevel ?? 'public'} disabled={isLocked} onChange={event => editor.setField('accessLevel', event.target.value)}>
      <option value="private">Private</option>
      <option value="public">Public</option>
      <option value="citable">Citable</option>
    </select>
  </label>;
  return <EditorFrame {...mobileHeader} mobileFlow={isMobile} title={!isMobile && editor.mode === 'cover-choice' ? 'Set a cover' : editor.mode === 'story' ? 'Add a description' : 'Edit project'} titleId="project-editor-title" description={isMobile ? undefined : editor.mode === 'story' ? 'Describe your project.' : editor.mode === 'journey' ? 'Update when you made this work.' : 'Update your project’s files and details.'} dialogRef={dialogRef} onClose={requestClose} closeDisabled={isLocked || upload.isCleaningUp} confirmation={isConfirmingDiscard ? <ProjectDiscardConfirmation title="Discard these changes?" description="Your project will stay as it was before this edit." error={upload.cleanupError} busy={upload.isCleaningUp} onKeep={() => setIsConfirmingDiscard(false)} onDiscard={async () => {
    if (await editor.close()) setIsConfirmingDiscard(false);
  }} /> : null}>
        <form id="project-editor-form" noValidate onSubmit={(event) => { event.preventDefault(); void saveChanges(); }} className="project-form-content scrollbar-slim">
          {isMobile && !['journey', 'story'].includes(editor.mode) && <nav className="project-editor-sections" aria-label="Edit project sections">
            <Button data-ui-shape="action" size="sm" aria-pressed={section === 'details'} onClick={() => setSection('details')}>Details</Button>
            <Button data-ui-shape="action" size="sm" aria-pressed={section === 'files'} onClick={() => setSection('files')}>Files</Button>
            <label className="project-editor-date" data-ui-control="button" data-control-size="sm" data-ui-shape="action"
              aria-disabled={isLocked || editor.phase === 'loading' || editor.phase === 'load-failed' || undefined}>
              <span aria-hidden="true">Made on</span>
              {Number.isFinite(madeOnDate.getTime()) && <time dateTime={madeOn} aria-hidden="true">{madeOnFormat.format(madeOnDate)}</time>}
              <input id="project-details-made-on" type="date" aria-label="Made on" value={madeOn}
                disabled={isLocked || editor.phase === 'loading' || editor.phase === 'load-failed'}
                onChange={event => editor.setField('madeOn', event.target.value)} />
            </label>
          </nav>}
          {editor.phase === 'loading' ? <LoadingState label="Loading this project…" /> : editor.phase === 'load-failed' ? <ErrorState title="This project could not be opened" description={editor.loadError ?? undefined} onRetry={editor.retryLoad} /> : <>
              {!isMobile && editor.mode === 'cover-choice' ? <PublishedCoverFilmstrip attachments={editor.originalAttachments} selectedId={coverEdit?.id} disabled={isLocked} onSelect={editor.setCover} onAddFiles={() => { if (editor.projectId) editor.open(editor.projectId, 'files'); }} /> : editor.mode === 'story' ? <div className="project-form-details">
                <ProfileField id="project-summary" label="Description" formatting={isMobile} optional multiline value={editor.metadata.summary} placeholder="Describe the work" error={editor.fieldErrors.summary} disabled={isLocked} onChange={value => editor.setField('summary', value)} />

              </div> : editor.mode === 'journey' ? <div className="project-form-details">
                <label className="flex flex-col gap-2 text-sm" htmlFor="project-made-on">Made on<input id="project-made-on" type="date" className="text-control p-3" disabled={isLocked} value={editor.metadata.madeOn ?? ''} onChange={e=>editor.setField('madeOn',e.target.value)}/></label><label>Access<select value={editor.metadata.accessLevel ?? 'public'} disabled={isLocked} onChange={e=>editor.setField('accessLevel',e.target.value)}><option value="private">Private</option><option value="public">Public</option><option value="citable">Citable</option></select></label><p>Others' AI tools may use single pages or images from this project, always with your name and a link back.</p>
                <ProfileField id="project-then-now-caption" label="Then/Now caption" maxLength={180} value={editor.metadata.thenNowCaption ?? ''} placeholder="Add a short comparison caption" disabled={isLocked} onChange={value => editor.setJourneyField('caption', value)} />
              </div> : <>
              <section hidden={isMobile && section !== 'files'} aria-labelledby="project-files-title" className="project-form-media project-form-media--edit">
                <div className={isMobile ? 'project-editor-file-tools' : 'flex items-center justify-between gap-3'}>
                  <h3 id="project-files-title" className={isMobile ? undefined : 'text-[13px] font-semibold text-[var(--text-primary)]'}>Project files</h3>
                  <Button id="project-replacement-files" variant={isMobile ? 'secondary' : 'ghost'} data-ui-shape={isMobile ? 'action' : undefined} size="sm" onClick={() => fileInputRef.current?.click()} disabled={queuedFilesLocked || added.isFull}><InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />{isMobile ? 'Add files' : 'Add'}</Button>
                </div>
                {!isMobile && <details><summary className="min-h-11 cursor-pointer py-3 text-sm">How to replace a file</summary><p className="text-sm text-[var(--text-secondary)]">Add the new version and remove the old one. Changes apply when you save.</p></details>}
                {canEditCover && coverSource && (isMobile ? section === 'files' && <div className="project-editor-cover-summary" data-ui-shape="row">
                  <div className="project-editor-cover-thumb" aria-hidden="true">
                    <ProjectCover source={coverSource.sourceUrl} alt="" kind={coverSource.kind === 'document' || coverSource.kind === 'video' ? coverSource.kind : undefined}
                      pageNumber={coverPage} previewSource={renderedCoverPage} frame={coverEdit?.coverFrame} fit={coverEdit?.coverFrame ? 'cover' : 'contain'} sizes="56px" />
                  </div>
                  <div className="project-editor-cover-copy"><h4>Cover</h4><p>{coverEdit?.displayName}</p></div>
                  <Button variant="secondary" data-ui-shape="action" size="sm" disabled={isLocked} onClick={() => setRepositionId(coverSource.id)}>Edit cover</Button>
                </div> : <div className="project-media-selection">
                  <div className="flex justify-end"><Button variant="secondary" size="sm" disabled={isLocked} onClick={() => setRepositionId(coverSource.id)}>Reposition preview</Button></div>
                  <ProjectPreviewFrame aspectRatio={coverPreviewRatio}><ProjectCover source={coverSource.sourceUrl} alt="Project cover preview" kind={coverSource.kind === 'document' ? 'document' : coverSource.kind === 'video' ? 'video' : undefined} pageNumber={coverSource.metadata?.coverPageNumber} frame={coverEdit?.coverFrame} /></ProjectPreviewFrame>
                </div>)}
                {repositionSource?.sourceUrl && ['image', 'document', 'video'].includes(repositionSource.kind) && repositionEdit ? <ProjectCoverRepositionDialog key={repositionSource.id} source={repositionSource.sourceUrl} kind={repositionSource.kind === 'document' ? 'document' : repositionSource.kind === 'video' ? 'video' : 'image'} pageNumber={repositionSource.metadata?.coverPageNumber} alt={repositionEdit.displayName} aspectRatio={coverPreviewRatio} frame={repositionEdit.coverFrame} onClose={() => setRepositionId(null)} onSave={({ frame }) => {
                  editor.setCoverFrame(repositionSource.id, frame);
                  setRepositionId(null);
                }} /> : null}
                {isMobile ? section === 'files' && <>
                  {editor.attachmentEdits.some(edit => ['image', 'document', 'video'].includes(attachmentSources.get(edit.id)?.kind ?? '')) &&
                    <p className="text-[13px] text-[var(--text-secondary)]">Tap a preview to choose the cover.</p>}
                  <ol className="project-editor-file-grid" aria-label="Project files, in presentation order">
                  {editor.attachmentEdits.map((edit, index) => {
                    const source = attachmentSources.get(edit.id);
                    const kind = source?.kind;
                    const coverable = kind === 'image' || kind === 'document' || kind === 'video';
                    const photoIndex = photoIds.indexOf(edit.id);
                    return <MobileProjectFileTile key={edit.id} position={index + 1} name={edit.displayName} isCover={edit.isCover}
                      onSelectCover={coverable ? () => editor.setCover(edit.id) : undefined} locked={isLocked}
                      preview={<ProjectCover source={coverable ? source?.sourceUrl : undefined} alt="" fit="contain"
                        kind={kind === 'document' || kind === 'video' ? kind : undefined} pageNumber={source?.metadata?.coverPageNumber} />}
                      onMoveEarlier={photoIndex > 0 ? () => editor.moveAttachment(edit.id, -1, true) : undefined}
                      onMoveLater={photoIndex >= 0 && photoIndex < photoIds.length - 1 ? () => editor.moveAttachment(edit.id, 1, true) : undefined}
                      onRemove={() => editor.removeAttachment(edit.id)} />;
                  })}
                  {added.items.map((item, index) => {
                    const photoIndex = queuedPhotoIds.indexOf(item.id);
                    return <MobileProjectFileTile key={item.id} position={editor.attachmentEdits.length + index + 1}
                      name={item.displayTitle} locked={queuedFilesLocked} progress={upload.itemProgress[item.id]?.fraction}
                      preview={<ProjectCover source={item.family === 'image' ? item.previewUrl : undefined} alt="" fit="contain" />}
                      onMoveEarlier={photoIndex > 0 ? () => added.moveImage(item.id, -1) : undefined}
                      onMoveLater={photoIndex >= 0 && photoIndex < queuedPhotoIds.length - 1 ? () => added.moveImage(item.id, 1) : undefined}
                      onRemove={() => added.remove(item.id)} />;
                  })}
                  </ol>
                </> : <ul aria-label="Project files, in presentation order" className="project-media-list scrollbar-slim m-0 flex list-none flex-col gap-1.5 p-0">
                  {editor.attachmentEdits.map((edit, index) => {
                const source = attachmentSources.get(edit.id);
                return <li key={edit.id} className="project-edit-file-row relative flex items-center gap-2.5 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-inset)] p-2">
                        <div className="project-edit-file-reorder flex shrink-0 flex-col">
                          <button type="button" onClick={() => editor.moveAttachment(edit.id, -1)} disabled={index === 0 || isLocked} aria-label={`Move ${edit.displayName} earlier`} data-ui-control="icon" data-control-size="sm" data-control-variant="ghost" className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" /></button>
                          <button type="button" onClick={() => editor.moveAttachment(edit.id, 1)} disabled={index === editor.attachmentEdits.length - 1 || isLocked} aria-label={`Move ${edit.displayName} later`} data-ui-control="icon" data-control-size="sm" data-control-variant="ghost" className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </div>
                        <div className="project-edit-file-thumbnail shrink-0">{source?.kind === 'image' && source.sourceUrl ? <ResponsiveImage src={source.sourceUrl} alt={source.fileName} width={40} height={40} sizes="40px" className="h-10 w-10 shrink-0 rounded-[7px] object-cover" /> : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><InterfaceIcon icon={FileIcon} size="sm" /></span>}</div>
                        <label className="project-edit-file-title min-w-0 flex-1">
                          <span className="sr-only">{`Title for ${source?.fileName ?? edit.displayName}`}</span>
                          <input type="text" value={edit.displayName} disabled={isLocked} onChange={(event) => editor.setAttachmentTitle(edit.id, event.target.value)} className="text-control w-full min-w-0 px-1.5 py-1 text-[13px] text-[var(--text-primary)]" />
                          <span className="block px-1.5 text-[12px] text-[var(--text-secondary)]">{source?.typeLabel ?? 'File'}</span>
                        </label>
                        <button type="button" data-project-cover-choice="" onClick={() => editor.setCover(edit.id)} disabled={isLocked} aria-pressed={edit.isCover} aria-label={`Use ${edit.displayName} as the cover`} data-ui-control="button" data-control-size="sm" data-control-variant="ghost" className="project-edit-file-cover shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                          <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {edit.isCover ? 'Cover' : 'Set cover'}
                        </button>
                        <button type="button" onClick={() => editor.removeAttachment(edit.id)} disabled={isLocked} aria-label={`Remove ${edit.displayName} from this edit`} data-ui-control="icon" data-control-size="sm" data-control-variant="ghost" className="project-edit-file-remove shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} size="sm" weight="medium" /></button>
                      </li>;
              })}
                </ul>}

                {/* Nothing was deleted: the removal is only pending a save. */}
                {editor.hasRemovals && <p role="status" className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    <InfoIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      Files are only removed when you save. Nothing has been deleted yet.
                      <button type="button" onClick={editor.restoreAttachments} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Restore them</button>
                    </span>
                  </p>}

                {/* Adding files goes through the existing preparation and transport
                 path, and says plainly when that path is unavailable. */}
                <div className="project-edit-transfer">
                  <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={(event) => {
                if (!queuedFilesLocked) added.select(event.target.files);
                event.target.value = '';
              }} />
                  {!isMobile && added.items.length > 0 && <ul className="project-media-list scrollbar-slim mt-2 m-0 flex list-none flex-col gap-1 p-0">
                      {added.items.map((item) => {
                  const itemState = upload.itemProgress[item.id];
                  return <li key={item.id} className="flex items-center gap-2 rounded-[8px] bg-[var(--surface-sunken)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)]">
                            <span className="min-w-0 flex-1 truncate">{item.displayTitle}</span>
                            {/* Per-file progress ONLY where the service attributes
                         bytes to files; otherwise the overall bar speaks. */}
                            {itemState ? <span className="shrink-0 tabular-nums">{Math.round(itemState.fraction * 100)}%</span> : <span className="shrink-0">{item.typeLabel}</span>}
                            {!isLocked && <button type="button" onClick={() => added.remove(item.id)} aria-label={`Remove ${item.displayTitle}`} data-ui-control="icon" data-control-size="sm" data-control-variant="ghost" className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} size="sm" weight="medium" /></button>}
                          </li>;
                })}
                    </ul>}
                  {added.error && <p role="alert" className="mt-1.5 text-[12px] text-[var(--status-danger)]">{added.error}</p>}

                  {/* Transport lifecycle, entirely from the service. There is no
                   timer here: with no reported fraction the bar is
                   indeterminate rather than invented. */}
                  {upload.isBusy && <div className="mt-2.5">
                      <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--text-secondary)]">
                        <span>{upload.phase === 'cancelling' ? 'Cancelling…' : upload.fraction === null ? 'Uploading…' : `Uploading — ${Math.round(upload.fraction * 100)}%`}</span>
                        <button type="button" onClick={() => void upload.cancel()} disabled={upload.phase !== 'uploading'} className="font-semibold text-[var(--accent-text)] underline focus:outline-none disabled:opacity-50">Cancel upload</button>
                      </div>
                      <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.fraction === null ? undefined : Math.round(upload.fraction * 100)} aria-valuetext={upload.fraction === null ? 'Upload in progress' : `${Math.round(upload.fraction * 100)} percent uploaded`} className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                        <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-[var(--m-base)] ease-[var(--m-enter)] motion-reduce:transition-none" style={{
                    width: upload.fraction === null ? '35%' : `${Math.round(upload.fraction * 100)}%`
                  }} />
                      </div>
                    </div>}
                  {upload.phase === 'cancelled' && !upload.isBusy && <p role="status" className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                      <InfoIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">The upload was cancelled. This project has not changed. Save again to retry it.</span>
                    </p>}
                  {upload.phase === 'uploaded' && <p role="status" className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                      <InterfaceIcon icon={CheckIcon} size="sm" weight="medium" className="mt-[2px]" />
                      <span className="min-w-0">The new files are stored. Saving again will not upload them a second time.</span>
                    </p>}
                  {/* An upload failure is a DIFFERENT recovery from a save failure:
                   this one re-sends the same files. */}
                  {upload.failure && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-primary)]">
                      <AlertCircleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        {upload.failure.message} This project has not changed.
                        {/* Re-runs the save, which re-sends exactly the same
                       selected files — nothing the creator chose is reset. */}
                        <button type="button" onClick={() => void editor.save(undefined, isMobile)} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Retry upload</button>
                      </span>
                    </p>}
                  {upload.cleanupError && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-primary)]">
                      <AlertCircleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">{upload.cleanupError}</span>
                    </p>}
                  {added.items.length > 0 && !canAddFiles && added.capability && <p role="status" className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                      <InfoIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">{added.capability.reason}</span>
                    </p>}
                </div>
              </section>
              <div hidden={isMobile && section !== 'details'} className={isMobile ? 'project-form-details project-editor-main-details' : 'project-form-details'}>
                {!isMobile && <>
                  <label className="flex flex-col gap-2 text-sm" htmlFor="project-details-made-on">Made on<input id="project-details-made-on" type="date" className="text-control p-3" disabled={isLocked} value={madeOn} onChange={event => editor.setField('madeOn', event.target.value)} /></label>
                  {accessControls}
                  <p>{projectAccessNote}</p>
                </>}
                <ProfileField ref={titleRef} id="project-title" label="Title" required requiredIndicator={isMobile ? 'parenthesized' : undefined} value={editor.metadata.title} error={editor.fieldErrors.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" disabled={isLocked} onChange={(value) => editor.setField('title', value)} />
                <ProfileField id="project-summary" label="Description" formatting={isMobile} optional optionalParentheses={isMobile} multiline autoGrow={isMobile} value={editor.metadata.summary} placeholder="Describe the work" error={editor.fieldErrors.summary} disabled={isLocked} onChange={(value) => editor.setField('summary', value)} />
                {isMobile && <div className="project-editor-access-footer">
                  {accessControls}
                  <p id="project-editor-access-note">{projectAccessNote}</p>
                </div>}
              </div>
              </>}
            </>}

        {!isMobile && <footer className="project-form-actions flex flex-col gap-2">
          {saveFeedback}
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={requestClose} disabled={isLocked || upload.isCleaningUp}>{editor.isDirty ? 'Cancel' : 'Close'}</Button>
            <Button type="submit" variant="primary" size="lg" isLoading={isLocked} disabled={saveDisabled}>
              {saveLabel}
            </Button>
          </div>
        </footer>}
        </form>
    </EditorFrame>;
}

function MobileProjectFileTile({ position, name, preview, isCover, locked, progress, onSelectCover, onMoveEarlier, onMoveLater, onRemove }: {
  position: number;
  name: string;
  preview: React.ReactNode;
  isCover?: boolean;
  locked: boolean;
  progress?: number;
  onSelectCover?: () => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
  onRemove: () => void;
}) {
  return <li className="project-editor-file-card">
    {onSelectCover ? <button type="button" className="project-editor-file-preview" data-ui-shape="row" data-project-cover-choice=""
      aria-label={`Use ${name} as the cover`} aria-pressed={Boolean(isCover)} disabled={locked} onClick={onSelectCover}>
      {preview}
      {isCover && <span className="project-editor-cover-mark" aria-hidden="true"><CheckIcon size={16} /></span>}
    </button> : <div className="project-editor-file-preview" data-ui-shape="row" role="img" aria-label={name}>{preview}</div>}
    <div className="project-editor-file-caption">
      <span className="project-editor-file-position">{position}</span>
      <span className="project-editor-file-name" title={name}>{name}</span>
    </div>
    {progress !== undefined && <span className="text-center text-[12px] tabular-nums text-[var(--text-secondary)]">{Math.round(progress * 100)}%</span>}
    <div className="project-editor-file-actions">
      {(onMoveEarlier || onMoveLater) && <>
        <button type="button" aria-label={`Move ${name} earlier`} disabled={locked || !onMoveEarlier} onClick={onMoveEarlier}
          data-ui-control="icon" data-ui-shape="icon" data-control-size="sm" data-control-variant="secondary"><InterfaceIcon icon={ChevronUpIcon} size="sm" /></button>
        <button type="button" aria-label={`Move ${name} later`} disabled={locked || !onMoveLater} onClick={onMoveLater}
          data-ui-control="icon" data-ui-shape="icon" data-control-size="sm" data-control-variant="secondary"><InterfaceIcon icon={ChevronDownIcon} size="sm" /></button>
      </>}
      <button type="button" aria-label={`Remove ${name} from this edit`} disabled={locked} onClick={onRemove}
        data-ui-control="icon" data-ui-shape="icon" data-control-size="sm" data-control-variant="ghost"><InterfaceIcon icon={XIcon} size="sm" weight="medium" /></button>
    </div>
  </li>;
}

/** A mobile screen; the shared desktop editor remains a dialog. */
function MobileProjectEditorScreen({ title, titleId, onClose, closeDisabled, dialogRef, confirmation, children, saveAction, saveFeedback }: React.ComponentProps<typeof ProjectFormDialog> & {
  saveAction?: React.ReactNode;
  saveFeedback?: React.ReactNode;
}) {
  const viewport = useDialogViewport<HTMLElement>();
  useAuthoringFocus(viewport);
  const requestClose = () => { if (!closeDisabled) onClose(); };
  useImperativeHandle<HTMLElement | null, HTMLElement | null>(dialogRef, () => viewport.current, [viewport]);
  useModalFocus(true, viewport, requestClose, true);
  return <ModalPortal><div className="mobile-upload-surface-backdrop" aria-hidden="true" /><section ref={viewport} className="mobile-project-editor-screen" data-mobile-upload-surface="editor" data-material="content" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <ScreenBack visibleOnMobile action={requestClose}><header><button type="button" aria-label="Back" onClick={requestClose} disabled={closeDisabled}><ArrowLeftIcon aria-hidden="true" size={24} /></button><h1 id={titleId}>{title}</h1>{saveAction}</header></ScreenBack>
    {saveFeedback && <div className="project-editor-save-feedback">{saveFeedback}</div>}
    {children}{confirmation}
  </section></ModalPortal>;
}

/**
 * The destructive confirmation. The project stays on screen and stays published
 * until the service confirms the deletion; a failure keeps it, with the reason and
 * the same attempt available again.
 */
export function DeleteProjectDialog({
  management,
  projectTitle,
  onDeleted




}: {management: ProjectManagement;projectTitle: string;onDeleted: () => void;}) {
  const {
    deletion
  } = management;
  if (deletion.projectId === null || deletion.phase === 'idle') return null;
  return <ConfirmationDialog title="Delete this project?" description={`“${projectTitle}” and its files will be removed from your catalogue. This cannot be undone.`} confirmLabel="Delete project" variant="destructive" pending={deletion.isDeleting} pendingLabel="Deleting…" error={deletion.failure?.message} onCancel={deletion.cancel} onConfirm={async()=>{const deleted=await deletion.confirm();if(deleted)onDeleted();return deleted;}}/>;
}
