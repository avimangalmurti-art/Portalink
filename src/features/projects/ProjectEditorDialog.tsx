import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, FileIcon, InfoIcon, Loader2Icon, PlusIcon, StarIcon, XIcon } from 'lucide-react';
import { ProjectCoverRepositionDialog } from '../../components/media/ProjectCoverRepositionDialog';
import { ProjectCover } from '../../components/media/ProjectCover';
import { ProjectFormDialog, ProjectDiscardConfirmation } from '../../components/publishing/ProjectFormDialog';
import { ProjectPreviewFrame } from '../../components/publishing/ProjectPreviewFrame';
import { ProfileField } from '../../components/profile/ProfileField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ResponsiveImage } from '../../components/ui/ResponsiveImage';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { TITLE_MAX_LENGTH } from '../publishing/validation';
import type { ProjectManagement } from './useProjectManagement';

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
  const isOpen = editor.projectId !== null;
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
        if (editor.mode === 'files') {
          document.getElementById('project-replacement-files')?.focus();
          return;
        }
        if (editor.mode === 'description') {
          document.getElementById('project-summary')?.focus();
          return;
        }
        if (editor.mode === 'cover') {
          dialogRef.current?.querySelector<HTMLButtonElement>('[data-project-cover-choice]')?.focus();
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
    return <ProjectFormDialog title="Reposition project preview" titleId="project-preview-editor-title" onClose={() => { void editor.close(); }}>
      <div className="project-form-content scrollbar-slim">{editor.phase === 'loading' ? <LoadingState label="Loading project preview…" /> : editor.phase === 'load-failed' ? <ErrorState title="The preview could not be opened" description={editor.loadError ?? undefined} onRetry={editor.retryLoad} /> : <ErrorState title="No cover preview is available" description="Choose a cover file in Edit project first." />}</div>
    </ProjectFormDialog>;
  }
  const canAddFiles = added.capability?.isAvailable === true;
  const focusField = (key: 'title' | 'summary') => {
    requestAnimationFrame(() => document.getElementById(`project-${key}`)?.focus());
  };
  async function saveChanges() {
    // One call: the boundary uploads any new files, waits for real persisted
    // references, and only then updates the published project.
    const outcome = await editor.save();
    if (outcome && outcome !== 'failed') {
      focusField(outcome);
    }
  }
  return <ProjectFormDialog title="Edit project" titleId="project-editor-title" description="Update your project’s files and details." dialogRef={dialogRef} onClose={requestClose} closeDisabled={isLocked || upload.isCleaningUp} confirmation={isConfirmingDiscard ? <ProjectDiscardConfirmation title="Discard these changes?" description="Your project will stay as it was before this edit." error={upload.cleanupError} busy={upload.isCleaningUp} onKeep={() => setIsConfirmingDiscard(false)} onDiscard={async () => {
    if (await editor.close()) setIsConfirmingDiscard(false);
  }} /> : null}>
        <form id="project-editor-form" noValidate onSubmit={(event) => { event.preventDefault(); void saveChanges(); }} className="project-form-content scrollbar-slim">
          {editor.phase === 'loading' ? <LoadingState label="Loading this project…" /> : editor.phase === 'load-failed' ? <ErrorState title="This project could not be opened" description={editor.loadError ?? undefined} onRetry={editor.retryLoad} /> : <>
              <section aria-labelledby="project-files-title" className="project-form-media project-form-media--edit">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="project-files-title" className="text-[13px] font-semibold text-[var(--text-primary)]">Project files</h3>
                  <Button id="project-replacement-files" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLocked || added.isFull}><InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />Add</Button>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">To replace a file, add the new version and remove the old one.</p>
                {coverSource?.sourceUrl && ['image', 'video', 'document'].includes(coverSource.kind) ? <div className="project-media-selection">
                  <div className="flex justify-end"><Button variant="secondary" size="sm" disabled={isLocked} onClick={() => setRepositionId(coverSource.id)}>Reposition preview</Button></div>
                  <ProjectPreviewFrame aspectRatio={coverPreviewRatio}><ProjectCover source={coverSource.sourceUrl} alt="Project cover preview" kind={coverSource.kind === 'document' ? 'document' : coverSource.kind === 'video' ? 'video' : undefined} pageNumber={coverSource.metadata?.coverPageNumber} frame={coverEdit?.coverFrame} /></ProjectPreviewFrame>
                </div> : null}
                {repositionSource?.sourceUrl && ['image', 'document', 'video'].includes(repositionSource.kind) && repositionEdit ? <ProjectCoverRepositionDialog key={repositionSource.id} source={repositionSource.sourceUrl} kind={repositionSource.kind === 'document' ? 'document' : repositionSource.kind === 'video' ? 'video' : 'image'} pageNumber={repositionSource.metadata?.coverPageNumber} alt={repositionEdit.displayName} aspectRatio={coverPreviewRatio} frame={repositionEdit.coverFrame} onClose={() => setRepositionId(null)} onSave={({ frame }) => {
                  editor.setCoverFrame(repositionSource.id, frame);
                  setRepositionId(null);
                }} /> : null}
                <ul aria-label="Project files, in presentation order" className="project-media-list scrollbar-slim m-0 flex list-none flex-col gap-1.5 p-0">
                  {editor.attachmentEdits.map((edit, index) => {
                const source = editor.originalAttachments.find((attachment) => attachment.id === edit.id);
                return <li key={edit.id} className="relative flex items-center gap-2.5 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-inset)] p-2">
                        <div className="flex shrink-0 flex-col">
                          <button type="button" onClick={() => editor.moveAttachment(edit.id, -1)} disabled={index === 0 || isLocked} aria-label={`Move ${edit.displayName} earlier`} className="flex h-4 w-5 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"><ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" /></button>
                          <button type="button" onClick={() => editor.moveAttachment(edit.id, 1)} disabled={index === editor.attachmentEdits.length - 1 || isLocked} aria-label={`Move ${edit.displayName} later`} className="flex h-4 w-5 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"><ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </div>
                        {source?.kind === 'image' && source.sourceUrl ? <ResponsiveImage src={source.sourceUrl} alt={source.fileName} width={40} height={40} sizes="40px" className="h-10 w-10 shrink-0 rounded-[7px] object-cover" /> : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><InterfaceIcon icon={FileIcon} size="sm" /></span>}
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">{`Title for ${source?.fileName ?? edit.displayName}`}</span>
                          <input type="text" value={edit.displayName} disabled={isLocked} onChange={(event) => editor.setAttachmentTitle(edit.id, event.target.value)} className="text-control w-full min-w-0 px-1.5 py-1 text-[13px] text-[var(--text-primary)]" />
                          <span className="block px-1.5 text-[12px] text-[var(--text-secondary)]">{source?.typeLabel ?? 'File'}</span>
                        </label>
                        <button type="button" data-project-cover-choice="" onClick={() => editor.setCover(edit.id)} disabled={isLocked} aria-pressed={edit.isCover} aria-label={`Use ${edit.displayName} as the cover`} className={`flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${edit.isCover ? 'text-[var(--accent-text)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
                          <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {edit.isCover ? 'Cover' : 'Set cover'}
                        </button>
                        <button type="button" onClick={() => editor.removeAttachment(edit.id)} disabled={isLocked} aria-label={`Remove ${edit.displayName} from this edit`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} size="sm" weight="medium" /></button>
                      </li>;
              })}
                </ul>

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
                added.select(event.target.files);
                event.target.value = '';
              }} />
                  {added.items.length > 0 && <ul className="project-media-list scrollbar-slim mt-2 m-0 flex list-none flex-col gap-1 p-0">
                      {added.items.map((item) => {
                  const itemState = upload.itemProgress[item.id];
                  return <li key={item.id} className="flex items-center gap-2 rounded-[8px] bg-[var(--surface-sunken)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)]">
                            <span className="min-w-0 flex-1 truncate">{item.displayTitle}</span>
                            {/* Per-file progress ONLY where the service attributes
                         bytes to files; otherwise the overall bar speaks. */}
                            {itemState ? <span className="shrink-0 tabular-nums">{Math.round(itemState.fraction * 100)}%</span> : <span className="shrink-0">{item.typeLabel}</span>}
                            {!isLocked && <button type="button" onClick={() => added.remove(item.id)} aria-label={`Remove ${item.displayTitle}`} className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus:outline-none"><InterfaceIcon icon={XIcon} size="sm" weight="medium" /></button>}
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
                        <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{
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
                        <button type="button" onClick={() => void editor.save()} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Retry upload</button>
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
              <div className="project-form-details">
              <ProfileField ref={titleRef} id="project-title" label="Title" required value={editor.metadata.title} error={editor.fieldErrors.title} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" disabled={isLocked} onChange={(value) => editor.setField('title', value)} />
              <ProfileField id="project-summary" label="Description" required multiline value={editor.metadata.summary} placeholder="Describe the work" error={editor.fieldErrors.summary} disabled={isLocked} onChange={(value) => editor.setField('summary', value)} />
              </div>
            </>}

        <footer className="project-form-actions flex flex-col gap-2">
          {/* A failed save keeps everything entered, and offers the same attempt. */}
          {editor.failure && <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
              <AlertCircleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                {editor.failure.message}
                {editor.failure.code === 'conflict' && ' Reopen this project to see the current version before saving again.'}
                {editor.failure.retry && <button type="button" onClick={editor.failure.retry} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Try again</button>}
              </span>
            </p>}
          {editor.phase === 'saved' && editor.result && <p role="status" className="flex items-start gap-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              <InterfaceIcon icon={CheckIcon} size="sm" weight="medium" className="mt-[2px]" />
              <span className="min-w-0">{editor.result.message ?? 'Your changes are saved.'}</span>
            </p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={requestClose} disabled={isLocked || upload.isCleaningUp}>{editor.isDirty ? 'Cancel' : 'Close'}</Button>
            <Button type="submit" variant="primary" size="lg" isLoading={isLocked} disabled={!editor.isDirty || isLocked || editor.phase === 'loading' || editor.phase === 'load-failed'}>
              {editor.isTransferring ? 'Uploading…' : editor.isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </footer>
        </form>
    </ProjectFormDialog>;
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
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (deletion.phase === 'confirming') {
      requestAnimationFrame(() => confirmRef.current?.focus());
    }
  }, [deletion.phase]);
  if (deletion.projectId === null || deletion.phase === 'idle') {
    return null;
  }
  return <ModalPortal><div role="presentation" className="modal-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title" aria-describedby="delete-project-body" className="w-full max-w-[440px] rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <h2 id="delete-project-title" className="text-[17px] font-semibold text-[var(--text-primary)]">Delete this project?</h2>
        <p id="delete-project-body" className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {`“${projectTitle}” and its files will be removed from your portfolio. This cannot be undone.`}
        </p>

        {deletion.phase === 'deleted' && deletion.result ? <>
            <p role="status" className="mt-3 flex items-start gap-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              <InterfaceIcon icon={CheckIcon} size="sm" weight="medium" className="mt-[2px]" />
              <span className="min-w-0">{deletion.result.message}</span>
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={onDeleted}>Done</Button>
            </div>
          </> : <>
            {deletion.failure && <p role="alert" className="mt-3 flex items-start gap-1.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
                <AlertCircleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  {deletion.failure.message}
                  {deletion.failure.retry && <button type="button" onClick={deletion.failure.retry} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Try again</button>}
                </span>
              </p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={deletion.cancel} disabled={deletion.isDeleting}>Cancel</Button>
              <button ref={confirmRef} type="button" onClick={async () => {
            const deleted = await deletion.confirm();
            if (deleted) {
              // Only now: the record is genuinely gone, so the deleted
              // project's URL is left behind rather than showing stale work.
              onDeleted();
            }
          }} disabled={deletion.isDeleting} aria-busy={deletion.isDeleting || undefined} className="shape-compact inline-flex h-9 items-center gap-2 border border-[var(--status-danger)] px-3.5 text-[13px] font-semibold text-[var(--status-danger)] transition-colors duration-150 hover:bg-[var(--status-danger)] hover:text-[var(--status-danger-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
                {deletion.isDeleting && <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {deletion.isDeleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </>}
      </div>
    </div></ModalPortal>;
}
