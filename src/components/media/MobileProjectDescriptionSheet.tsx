import './mobile-project-popup.css';
import { TextFormattingToolbar } from '../text/TextFormattingToolbar';
import { FormattedText } from '../text/FormattedText';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontalIcon, XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useDescriptionSheetScrollBoundary } from '../../hooks/useDescriptionSheetScrollBoundary';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import type { ProjectManagement } from '../../features/projects/useProjectManagement';

/** The sheet handles reading and dismissal; the feature owns persistence. */
export type SheetTextEditor = {
  isEditing: boolean; phase: string; value: string; savedValue?: string;
  isDirty: boolean; isSaving: boolean; error?: string | null; maxLength?: number;
  open: () => void; onChange: (value: string) => void;
  close: () => Promise<boolean>; save: () => Promise<unknown> | void; retryLoad: () => void;
};

type Props = {
  projectId: string;
  projectTitle?: string;
  description?: string;
  typeface?: string;
  details?: React.ReactNode;
  editor?: ProjectManagement['editor'];
  textEditor?: SheetTextEditor;
  contentLabel?: string;
  emptyMessage?: string;
  fullScreenEditor?: boolean;
  directEditAction?: boolean;
  onClose: () => void;
};

/** A mobile reading sheet. Authoring still belongs to the existing project boundary. */
export function MobileProjectDescriptionSheet({ projectId, projectTitle, description, typeface, details, editor, textEditor, contentLabel = 'Description', emptyMessage = 'This project has no description.', fullScreenEditor = false, directEditAction = false, onClose }: Props) {
  const viewportRef = useDialogViewport();
  useDescriptionSheetScrollBoundary(viewportRef);
  const panelRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [discard, setDiscard] = useState<'close' | 'edit' | null>(null);
  const drag = useRef<{ id: number; y: number; height: number; max: number; next: number } | null>(null);
  const moved = useRef(false);
  const activeEditor: SheetTextEditor | undefined = textEditor ?? (editor ? {
    isEditing: editor.projectId === projectId && editor.mode === 'description',
    phase: editor.phase, value: editor.metadata.summary, savedValue: editor.result?.project.summary,
    isDirty: editor.isDirty, isSaving: editor.isSaving,
    error: editor.loadError || editor.fieldErrors.summary || editor.failure?.message,
    open: () => editor.open(projectId, 'description'), onChange: value => editor.setField('summary', value),
    close: editor.close, save: editor.save, retryLoad: editor.retryLoad,
  } : undefined);
  const editing = activeEditor?.isEditing;
  const phase = activeEditor?.phase;
  const canEdit = Boolean(activeEditor);
  const label = contentLabel.toLowerCase();
  const busy = editing && activeEditor.isSaving;
  const dismiss = (target: 'close' | 'edit' = 'close') => {
    if (busy) return;
    if (editing && activeEditor.isDirty) { setDiscard(target); return; }
    if (editing) void activeEditor.close();
    if (target === 'close') onClose();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  // Focusing a translated entrance frame must not scroll its clipped overlay.
  useModalFocus(true, panelRef, () => {
    if (discard) setDiscard(null);
    else if (menuOpen) setMenuOpen(false);
    else dismiss();
  }, true);
  useEffect(() => {
    if(discard)return;
    const target = menuOpen ? editRef : editing ? phase === 'editing' ? textareaRef : phase === 'saved' ? doneRef : panelRef : canEdit ? optionsRef : panelRef;
    const frame = requestAnimationFrame(() => target.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [editing, phase, discard, menuOpen, canEdit]);
  useEffect(() => {
    const close = () => dismissRef.current();
    document.addEventListener('fullscreenchange', close);
    return () => document.removeEventListener('fullscreenchange', close);
  }, []);
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const resetDrag = () => {
    drag.current = null;
    panelRef.current?.style.removeProperty('height');
    panelRef.current?.removeAttribute('data-dragging');
  };
  const error = editing ? activeEditor.error : null;
  const saved = editing && phase === 'saved';
  const writingScreen = fullScreenEditor && editing && !saved;
  const topEditorActions = writingScreen && directEditAction;
  const host = document.fullscreenElement ?? document.querySelector('.app-shell') ?? document.body;
  return createPortal(<div data-presentation="mobile"><div ref={viewportRef} data-project-description-overlay="" data-centered-project={contentLabel === 'Description' || undefined}
    style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }}
    onPointerDown={event => { stop(event); if (event.target === event.currentTarget) dismiss(); }}
    onPointerUp={stop} onClick={event => { stop(event); if (menuOpen) setMenuOpen(false); }}
    onDoubleClick={stop} onTouchMove={stop} onWheel={stop} onKeyDown={stop}>
    <section ref={panelRef} id="mobile-project-popup" role="dialog" aria-modal="true" aria-labelledby={contentLabel !== 'Description' || projectTitle ? 'project-description-title' : undefined} aria-label={contentLabel === 'Description' && !projectTitle ? 'Project information' : undefined}
      tabIndex={-1} data-media-interaction="" data-writing-screen={writingScreen || undefined} data-top-editor-actions={topEditorActions || undefined} data-expanded={expanded || undefined} className="mobile-project-description-sheet">
      {contentLabel !== 'Description' && !writingScreen && <button type="button" className="project-description-grabber" aria-label={expanded ? `Reduce ${label} sheet` : `Expand ${label} sheet`} aria-expanded={expanded}
        onClick={() => { if (!moved.current) setExpanded(value => !value); moved.current = false; }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0 || busy) return;
          const panel = panelRef.current, viewport = viewportRef.current;
          if (!panel || !viewport) return;
          const height = panel.getBoundingClientRect().height;
          drag.current = { id: event.pointerId, y: event.clientY, height, next: height, max: viewport.getBoundingClientRect().height };
          moved.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const gesture = drag.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          const delta = gesture.y - event.clientY;
          if (Math.abs(delta) < 3 && !moved.current) return;
          moved.current = true;
          gesture.next = Math.max(gesture.max * 0.3, Math.min(gesture.max * 0.92, gesture.height + delta));
          const panel = panelRef.current;
          if (panel) { panel.setAttribute('data-dragging', ''); panel.style.height = `${gesture.next}px`; }
        }}
        onPointerUp={event => {
          const gesture = drag.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          if (moved.current) {
            const delta = gesture.next - gesture.height;
            if (gesture.next < gesture.max * 0.38) dismiss();
            else setExpanded(Math.abs(delta) > 35 ? delta > 0 : gesture.next > gesture.max * 0.71);
          }
          resetDrag();
        }} onPointerCancel={() => { moved.current = false; resetDrag(); }} onLostPointerCapture={() => { if (drag.current) { moved.current = false; resetDrag(); } }}><span /></button>}
      <header className="project-description-heading">
        {(contentLabel !== 'Description' || projectTitle) && <h2 id="project-description-title" style={{ fontFamily: typeface }}>{contentLabel === 'Description' ? projectTitle : contentLabel}</h2>}
        {writingScreen && phase !== 'load-failed' && <TextFormattingToolbar variant="dropdown" inputRef={textareaRef} value={activeEditor.value} onChange={activeEditor.onChange} disabled={busy || phase === 'loading'} maxLength={activeEditor.maxLength} />}
        {topEditorActions && (phase === 'load-failed'
          ? <button type="button" onClick={activeEditor.retryLoad}>Try again</button>
          : <button type="button" className="project-description-top-save" disabled={busy || !activeEditor.isDirty || phase === 'loading'} aria-busy={busy} onClick={() => { void activeEditor.save(); }}>{busy ? 'Saving…' : 'Save'}</button>)}
        {canEdit && !editing && <div className="project-description-menu">
          <button ref={optionsRef} type="button" aria-label={directEditAction ? `Edit ${label}` : `${contentLabel} options`} aria-expanded={directEditAction ? undefined : menuOpen} aria-controls={directEditAction ? undefined : "project-description-actions"}
            onClick={event => { stop(event); if (directEditAction) { setExpanded(true); activeEditor?.open(); } else setMenuOpen(value => !value); }}><MoreHorizontalIcon aria-hidden="true" /></button>
          {menuOpen && <div id="project-description-actions">
            <button ref={editRef} type="button" onClick={() => { setMenuOpen(false); setExpanded(true); activeEditor?.open(); }}>{`Edit ${label}`}</button>
          </div>}
        </div>}
        <button type="button" aria-label={`Close ${label}`} disabled={busy} onClick={() => dismiss()}><XIcon aria-hidden="true" /></button>
      </header>
      {discard ? null : editing && !saved ? <form className="project-description-editor" onSubmit={event => { event.preventDefault(); if (!busy) void activeEditor.save(); }}>
        {phase === 'loading' ? <p role="status">Loading {label}…</p> : phase !== 'load-failed' && <><textarea ref={textareaRef}
          aria-label={contentLabel === 'Description' ? 'Project description' : contentLabel} aria-invalid={Boolean(error)} aria-describedby={error ? 'project-description-error' : undefined}
          maxLength={activeEditor.maxLength} value={activeEditor.value} disabled={busy} onChange={event => activeEditor.onChange(event.target.value)} />{!writingScreen && <TextFormattingToolbar inputRef={textareaRef} value={activeEditor.value} onChange={activeEditor.onChange} disabled={busy} maxLength={activeEditor.maxLength} />}</>}
        {error && <p role="alert" id="project-description-error">{error}</p>}
        {!topEditorActions && <footer>
          <button type="button" disabled={busy} onClick={() => dismiss('edit')}>Cancel</button>
          {phase === 'load-failed' ? <button type="button" onClick={activeEditor.retryLoad}>Try again</button> : <button type="submit"
            disabled={busy || !activeEditor.isDirty || phase === 'loading'} aria-busy={busy}>{busy ? 'Saving…' : 'Save'}</button>}
        </footer>}
      </form> : <>
        <div className="project-description-body scrollbar-overlay" tabIndex={0} aria-label={contentLabel === 'Description' ? 'Project description text' : `${contentLabel} text`}>
          <FormattedText style={{ fontFamily: typeface }} text={(saved ? activeEditor.savedValue : description) || emptyMessage} />
          {details && <div className="project-description-details">{details}</div>}
        </div>
        {saved && <footer className="project-description-saved"><span role="status">{contentLabel} saved</span><button ref={doneRef} type="button" onClick={() => { void activeEditor.close(); }}>Done</button></footer>}
      </>}
    </section>
    {discard && <ConfirmationDialog host={host} title={`Discard your ${label} changes?`} description="Your unsaved changes will be lost." confirmLabel="Discard changes" cancelLabel="Keep editing" variant="destructive" onCancel={()=>setDiscard(null)} onConfirm={async()=>{const removed=await activeEditor?.close();if(removed){const close=discard==='close';setDiscard(null);if(close)onClose();}return removed ?? false;}}/>}
  </div></div>, host);
}
