import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, InfoIcon, Loader2Icon, StarIcon, XIcon } from 'lucide-react';
import { ImageRepositionDialog } from '../../components/media/ImageRepositionDialog';
import { ProjectCover } from '../../components/media/ProjectCover';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useModalFocus } from '../../hooks/useModalFocus';
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
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
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
  useModalFocus(isOpen, dialogRef, requestClose);
  useEffect(() => {
    if (editor.phase === 'editing') {
      const frame = requestAnimationFrame(() => {
        if (editor.mode === 'files') {
          document.getElementById('project-replacement-files')?.focus();
          return;
        }
        if (editor.mode === 'description') {
          summaryRef.current?.focus();
          return;
        }
        if (editor.mode === 'cover') {
          dialogRef.current?.querySelector<HTMLButtonElement>('[data-project-cover-choice]')?.focus();
          return;
        }
        titleRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [editor.mode, editor.phase]);
  if (!isOpen) {
    return null;
  }
  const canAddFiles = added.capability?.isAvailable === true;
  const focusField = (key: 'title' | 'summary') => {
    const target = key === 'title' ? titleRef : summaryRef;
    requestAnimationFrame(() => target.current?.focus());
  };
  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    // One call: the boundary uploads any new files, waits for real persisted
    // references, and only then updates the published project.
    const outcome = await editor.save();
    if (outcome && outcome !== 'failed') {
      focusField(outcome);
    }
  }
  const editorHeading = editor.mode === 'files' ? 'Replace project files' : editor.mode === 'description' ? 'Edit description' : editor.mode === 'cover' ? 'Edit cover' : 'Edit project';
  const editorDescription = editor.mode === 'files' ? 'Choose the corrected files, remove the versions they replace, then save.' : editor.mode === 'description' ? 'Update the description shown with this project.' : editor.mode === 'cover' ? 'Choose which published file represents this project.' : 'Everything here is part of the published record.';
  return <ModalPortal><div role="presentation" className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={(event) => {
    // A transfer in progress is never silently abandoned by a stray click.
    if (event.target === event.currentTarget && !isLocked) {
      requestClose();
    }
  }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="project-editor-title" className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--hairline)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="project-editor-title" className="text-[17px] font-semibold text-[var(--text-primary)]">{editorHeading}</h2>
            <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{editorDescription}</p>
          </div>
          <button type="button" onClick={requestClose} disabled={isLocked || upload.isCleaningUp} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
            <InterfaceIcon icon={XIcon} weight="medium" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {editor.phase === 'loading' ? <LoadingState label="Loading this project…" /> : editor.phase === 'load-failed' ? <ErrorState title="This project could not be opened" description={editor.loadError ?? undefined} onRetry={editor.retryLoad} /> : <form id="project-editor-form" noValidate onSubmit={handleSave} className="flex flex-col gap-4">
              <EditorField id="project-title" label="Title" value={editor.metadata.title} error={editor.fieldErrors.title} maxLength={TITLE_MAX_LENGTH} disabled={editor.isSaving} inputRef={titleRef} onChange={(value) => editor.setField('title', value)} />
              <EditorField id="project-summary" label="Description" value={editor.metadata.summary} error={editor.fieldErrors.summary} multiline disabled={editor.isSaving} textareaRef={summaryRef} onChange={(value) => editor.setField('summary', value)} />

              <section aria-labelledby="project-files-title" className="mt-1">
                <h3 id="project-files-title" className="text-[13px] font-semibold text-[var(--text-primary)]">Files</h3>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{editor.mode === 'files' ? 'Select one or more corrected files below, remove the old versions from this list, and keep the exact order and cover you want.' : 'Their titles, their order, and which one is the cover. Removing a file here only takes it out of this edit — the published project keeps it until you save.'}</p>
                {coverSource?.kind === 'image' && coverSource.sourceUrl ? <div className="mx-auto my-3 w-full max-w-[400px] space-y-2">
                  <div className="overflow-hidden rounded-[10px] bg-[var(--surface-sunken)]" style={{ aspectRatio: coverPreviewRatio }}><ProjectCover source={coverSource.sourceUrl} alt="Project cover preview" frame={coverEdit?.coverFrame} /></div>
                  <div className="flex justify-end"><Button variant="secondary" size="sm" disabled={isLocked} onClick={() => setRepositionId(coverSource.id)}>Reposition cover</Button></div>
                </div> : null}
                {repositionSource?.kind === 'image' && repositionSource.sourceUrl && repositionEdit ? <ImageRepositionDialog key={repositionSource.id} title="Reposition project cover" source={repositionSource.sourceUrl} alt={repositionEdit.displayName} aspectRatio={16 / 9} initialPosition={normalizeProjectCoverFrame(repositionEdit.coverFrame)} outputWidth={1920} onClose={() => setRepositionId(null)} onSave={({ position, crop }) => {
                  editor.setCoverFrame(repositionSource.id, { ...position, crop, aspectRatio: 16 / 9 });
                  setRepositionId(null);
                }} /> : null}
                <ul className="mt-2.5 m-0 flex list-none flex-col gap-1.5 p-0">
                  {editor.attachmentEdits.map((edit, index) => {
                const source = editor.originalAttachments.find((attachment) => attachment.id === edit.id);
                return <li key={edit.id} className="flex items-center gap-2 rounded-[10px] border border-[var(--hairline)] px-2.5 py-2">
                        <div className="flex shrink-0 flex-col">
                          <button type="button" onClick={() => editor.moveAttachment(edit.id, -1)} disabled={index === 0 || editor.isSaving} aria-label={`Move ${edit.displayName} earlier`} className="flex h-4 w-5 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"><ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" /></button>
                          <button type="button" onClick={() => editor.moveAttachment(edit.id, 1)} disabled={index === editor.attachmentEdits.length - 1 || editor.isSaving} aria-label={`Move ${edit.displayName} later`} className="flex h-4 w-5 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"><ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </div>
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">{`Title for ${source?.fileName ?? edit.displayName}`}</span>
                          <input type="text" value={edit.displayName} disabled={editor.isSaving} onChange={(event) => editor.setAttachmentTitle(edit.id, event.target.value)} className="text-control w-full min-w-0 px-1.5 py-1 text-[13px] text-[var(--text-primary)]" />
                          <span className="block px-1.5 text-[11px] text-[var(--text-tertiary)]">{source?.typeLabel ?? 'File'}</span>
                        </label>
                        <button type="button" data-project-cover-choice="" onClick={() => editor.setCover(edit.id)} disabled={editor.isSaving} aria-pressed={edit.isCover} aria-label={`Use ${edit.displayName} as the cover`} className={`flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${edit.isCover ? 'text-[var(--accent-text)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
                          <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {edit.isCover ? 'Cover' : 'Set cover'}
                        </button>
                        <button type="button" onClick={() => editor.removeAttachment(edit.id)} disabled={editor.isSaving} aria-label={`Remove ${edit.displayName} from this edit`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} size="sm" weight="medium" /></button>
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
                <div className="mt-3">
                  <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={(event) => {
                added.select(event.target.files);
                event.target.value = '';
              }} />
                  <Button id="project-replacement-files" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isLocked || added.isFull}>{editor.mode === 'files' ? 'Choose replacement files' : 'Add files'}</Button>
                  {added.items.length > 0 && <ul className="mt-2 m-0 flex list-none flex-col gap-1 p-0">
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
            </form>}
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-[var(--hairline)] px-5 py-3.5">
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
          {isConfirmingDiscard && <div role="alertdialog" aria-modal="true" aria-label="Discard project changes" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
              <span>You have unsaved changes.</span>
              <span className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsConfirmingDiscard(false)}>Keep editing</Button>
                <Button variant="ghost" size="sm" onClick={() => void editor.close()}>Discard changes</Button>
              </span>
            </div>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={requestClose} disabled={isLocked || upload.isCleaningUp}>{editor.isDirty ? 'Cancel' : 'Close'}</Button>
            <button type="submit" form="project-editor-form" disabled={!editor.isDirty || isLocked || editor.phase === 'loading' || editor.phase === 'load-failed'} aria-busy={isLocked || undefined} className="shape-compact inline-flex h-9 items-center gap-2 bg-[var(--accent-primary)] px-3.5 text-[13px] font-semibold text-[var(--accent-foreground)] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
              {isLocked && <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {editor.isTransferring ? 'Uploading…' : editor.isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </footer>
      </div>
    </div></ModalPortal>;
}
function EditorField({
  id,
  label,
  value,
  error,
  maxLength,
  multiline = false,
  disabled = false,
  inputRef,
  textareaRef,
  onChange











}: {id: string;label: string;value: string;error?: string;maxLength?: number;multiline?: boolean;disabled?: boolean;inputRef?: React.RefObject<HTMLInputElement>;textareaRef?: React.RefObject<HTMLTextAreaElement>;onChange: (value: string) => void;}) {
  const errorId = `${id}-error`;
  const shared = 'text-control w-full px-2.5 py-2 text-[14px] text-[var(--text-primary)]';
  return <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
        {label}
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Required</span>
      </label>
      {multiline ? <textarea ref={textareaRef} id={id} rows={3} value={value} maxLength={maxLength} disabled={disabled} aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} className={shared} /> : <input ref={inputRef} id={id} type="text" value={value} maxLength={maxLength} disabled={disabled} aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} className={shared} />}
      {error && <p id={errorId} role="alert" className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--status-danger)]">
          <AlertCircleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{error}</span>
        </p>}
    </div>;
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
