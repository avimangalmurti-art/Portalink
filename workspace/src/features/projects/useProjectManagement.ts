import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';
import { getProjectAspectRatio } from '../../utils/projectPresentation';
import { validateTitle } from '../publishing/validation';
import { useMediaPreparation } from '../publishing/useMediaPreparation';
import { useMediaUpload } from '../publishing/useMediaUpload';
import { ProjectMutationError } from '../../types/publishing';
import type { Id, Project, ProjectAttachment, ProjectCoverFrame } from '../../types/domain';
import type { DeleteProjectResult, DraftMetadata, PersistedAttachment, ProjectAttachmentEdit, ProjectMutationErrorCode, UpdateProjectResult } from '../../types/publishing';

/**
 * The owner lifecycle of an ALREADY-PUBLISHED project: edit and delete.
 *
 * `UI → this hook → ProjectService → implementation`. Presentation calls no
 * service, and there is no second project model: the editor loads the canonical
 * record and writes the same public fields back.
 *
 * The rules that are easy to get wrong, enforced here:
 *
 * - **A failed save destroys nothing.** Everything the creator entered survives,
 *   the retry repeats exactly the attempt that failed, and removing a file from
 *   the form does not delete it — the record is updated first, and cleaning up the
 *   stored objects behind `removedAttachmentIds` is the service's business.
 * - **Nothing disappears before the service says so.** Deletion is confirmed,
 *   then pending, then successful; the project stays on screen until the request
 *   resolves, and a failure leaves it published.
 * - **After either succeeds, the canonical reads are invalidated**, so the
 *   category index, the viewer, the feed, and search all update from one place.
 */
export type EditorPhase = 'idle' | 'loading' | 'editing' | 'saving' | 'saved' | 'load-failed';
export type DeletePhase = 'idle' | 'confirming' | 'deleting' | 'deleted' | 'failed';
export type MetadataFieldKey = keyof DraftMetadata;
export type ProjectEditorMode = 'details' | 'description' | 'cover' | 'files';
export type ProjectMutationFailure = {
  code: ProjectMutationErrorCode;
  message: string;
  /** Re-runs exactly the attempt that failed. Absent when retrying cannot help. */
  retry: (() => void) | null;
};
const EMPTY_METADATA: DraftMetadata = {
  title: '',
  summary: ''
};
function failureFrom(error: unknown, fallback: string): {
  code: ProjectMutationErrorCode;
  message: string;
} {
  if (error instanceof ProjectMutationError) {
    return {
      code: error.code,
      message: error.message
    };
  }
  return {
    code: 'unknown',
    message: error instanceof Error && error.message ? error.message : fallback
  };
}

/** Only these codes describe a condition a second identical request could clear. */
function isRetryable(code: ProjectMutationErrorCode): boolean {
  return code === 'network' || code === 'unknown';
}
export function useProjectManagement(profileId: Id | null) {
  const {
    projects: projectService
  } = useServices();
  const {
    invalidateProfiles
  } = useProfileData();

  /**
   * Files added during an edit reuse the SAME preparation and transport machinery
   * publishing uses, orchestrated here rather than in the dialog: presentation
   * never touches `MediaService`. Preparation owns local previews and reports the
   * real capability; the upload hook owns the transport state machine, and it is
   * the only source of progress.
   */
  const addedMedia = useMediaPreparation();
  const upload = useMediaUpload(addedMedia.capability);
  const isTransportAvailable = addedMedia.capability?.isAvailable === true;

  /* ── Editing ───────────────────────────────────────────────────────────── */
  const [editingProjectId, setEditingProjectId] = useState<Id | null>(null);
  const [editorMode, setEditorMode] = useState<ProjectEditorMode>('details');
  const [editorPhase, setEditorPhase] = useState<EditorPhase>('idle');
  const [metadata, setMetadata] = useState<DraftMetadata>(EMPTY_METADATA);
  const [originalMetadata, setOriginalMetadata] = useState<DraftMetadata>(EMPTY_METADATA);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<MetadataFieldKey, string>>>({});
  const [attachmentEdits, setAttachmentEdits] = useState<ProjectAttachmentEdit[]>([]);
  const [originalAttachments, setOriginalAttachments] = useState<ProjectAttachment[]>([]);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(16 / 9);
  const [saveFailure, setSaveFailure] = useState<ProjectMutationFailure | null>(null);
  const [saveResult, setSaveResult] = useState<UpdateProjectResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);
  // Only the newest load may settle, so opening one project while another is
  // still loading cannot fill the form with the wrong record.
  const latestLoadRef = useRef(0);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);
  const hydrate = useCallback((project: Project) => {
    setPreviewAspectRatio(getProjectAspectRatio(project));
    const nextMetadata = {
      title: project.title,
      summary: project.summary
    };
    setMetadata(nextMetadata);
    setOriginalMetadata(nextMetadata);
    const attachments = project.attachments ?? [];
    setOriginalAttachments(attachments);
    setAttachmentEdits(attachments.slice().sort((a, b) => a.order - b.order).map((attachment, index) => ({
      id: attachment.id,
      displayName: attachment.displayName,
      order: index,
      isCover: attachment.isCover,
      coverFrame: attachment.metadata?.coverFrame
    })));
  }, []);
  const load = useCallback((projectId: Id) => {
    const requestId = latestLoadRef.current + 1;
    latestLoadRef.current = requestId;
    setEditorPhase('loading');
    setLoadError(null);
    setSaveFailure(null);
    setSaveResult(null);
    setFieldErrors({});
    projectService.getProject(projectId).then((project) => {
      if (latestLoadRef.current !== requestId || !isMountedRef.current) {
        return;
      }
      // The editor always starts from the CURRENT record rather than from
      // whatever a list row happened to be carrying.
      hydrate(project);
      setEditorPhase('editing');
    }).catch((error) => {
      if (latestLoadRef.current !== requestId || !isMountedRef.current) {
        return;
      }
      setLoadError(failureFrom(error, 'That project could not be opened for editing.').message);
      setEditorPhase('load-failed');
    });
  }, [hydrate, projectService]);
  const openEditor = useCallback((projectId: Id, mode: ProjectEditorMode = 'details') => {
    setEditorMode(mode);
    setEditingProjectId(projectId);
    load(projectId);
  }, [load]);
  const openFiles = useCallback((projectId: Id) => {
    openEditor(projectId, 'files');
  }, [openEditor]);
  /**
   * Closes the editor.
   *
   * If new files reached storage but the project update never committed, those
   * objects are orphans: nothing references them, so they are removed through the
   * existing cleanup path FIRST. A cleanup that cannot complete keeps the editor
   * open with its reason, because closing here would leave objects in a bucket
   * that nothing will ever point at again.
   */
  const closeEditor = useCallback(async (): Promise<boolean> => {
    if (upload.isBusy) {
      return false;
    }
    if (upload.hasPersistedMedia) {
      const cleaned = await upload.cleanupPersisted();
      if (!cleaned) {
        return false;
      }
    }
    upload.reset();
    addedMedia.clear();
    setEditingProjectId(null);
    setEditorMode('details');
    setEditorPhase('idle');
    setMetadata(EMPTY_METADATA);
    setOriginalMetadata(EMPTY_METADATA);
    setAttachmentEdits([]);
    setOriginalAttachments([]);
    setFieldErrors({});
    setSaveFailure(null);
    setSaveResult(null);
    setLoadError(null);
    return true;
  }, [addedMedia, upload]);
  const retryLoad = useCallback(() => {
    if (editingProjectId) {
      load(editingProjectId);
    }
  }, [editingProjectId, load]);
  const setMetadataField = useCallback((key: MetadataFieldKey, value: string) => {
    setMetadata((current) => ({
      ...current,
      [key]: value
    }));
    setFieldErrors((current) => ({
      ...current,
      [key]: undefined
    }));
    setSaveResult(null);
  }, []);
  const setAttachmentTitle = useCallback((attachmentId: Id, displayName: string) => {
    setAttachmentEdits((current) => current.map((edit) => edit.id === attachmentId ? {
      ...edit,
      displayName
    } : edit));
  }, []);
  const setCover = useCallback((attachmentId: Id) => {
    setAttachmentEdits((current) => current.map((edit) => ({
      ...edit,
      isCover: edit.id === attachmentId
    })));
  }, []);
  const setCoverFrame = useCallback((attachmentId: Id, frame: ProjectCoverFrame) => {
    setAttachmentEdits((current) => current.map((edit) => edit.id === attachmentId ? { ...edit, coverFrame: normalizeProjectCoverFrame(frame) } : edit));
    setSaveResult(null);
    setSaveFailure(null);
    setEditorPhase('editing');
  }, []);
  const moveAttachment = useCallback((attachmentId: Id, direction: -1 | 1) => {
    setAttachmentEdits((current) => {
      const index = current.findIndex((edit) => edit.id === attachmentId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((edit, order) => ({
        ...edit,
        order
      }));
    });
  }, []);
  /**
   * Drops a file from the EDIT, not from storage. The published project keeps it
   * until the save commits, which is what makes an abandoned or failed edit
   * harmless.
   */
  const removeAttachment = useCallback((attachmentId: Id) => {
    setAttachmentEdits((current) => current.filter((edit) => edit.id !== attachmentId).map((edit, order) => ({
      ...edit,
      order
    })));
  }, []);
  const restoreAttachments = useCallback(() => {
    setAttachmentEdits(originalAttachments.slice().sort((a, b) => a.order - b.order).map((attachment, index) => ({
      id: attachment.id,
      displayName: attachment.displayName,
      order: index,
      isCover: attachment.isCover,
      coverFrame: attachment.metadata?.coverFrame
    })));
  }, [originalAttachments]);
  const isDirty = useMemo(() => {
    const originalEdits = originalAttachments.slice().sort((a, b) => a.order - b.order).map((attachment, index) => ({
      id: attachment.id,
      displayName: attachment.displayName,
      order: index,
      isCover: attachment.isCover,
      coverFrame: attachment.metadata?.coverFrame
    }));
    const attachmentsChanged = originalEdits.length !== attachmentEdits.length || originalEdits.some((original, index) => {
      const current = attachmentEdits[index];
      return !current || current.id !== original.id || current.displayName !== original.displayName || current.order !== original.order || current.isCover !== original.isCover || JSON.stringify(normalizeProjectCoverFrame(current.coverFrame)) !== JSON.stringify(normalizeProjectCoverFrame(original.coverFrame));
    });
    return metadata.title.trim() !== originalMetadata.title.trim() || metadata.summary.trim() !== originalMetadata.summary.trim() || attachmentsChanged || addedMedia.items.length > 0;
  }, [addedMedia.items.length, attachmentEdits, metadata, originalAttachments, originalMetadata]);
  const validate = useCallback((): MetadataFieldKey | null => {
    const next: Partial<Record<MetadataFieldKey, string>> = {
      title: validateTitle(metadata.title) ?? undefined
    };
    setFieldErrors(next);
    const order: MetadataFieldKey[] = ['title'];
    return order.find((key) => next[key]) ?? null;
  }, [metadata]);

  /**
   * Saves the edit, running the whole production sequence:
   *
   * `validate → upload the new files → persisted attachments → updateProject`
   *
   * Two separations matter here, and they are the reason this lives in the hook
   * rather than in the dialog:
   *
   * - A failed or cancelled upload NEVER reaches `updateProject`, so the published
   *   project is left exactly as it was, and the upload hook keeps the same
   *   intended files so its own retry re-sends them.
   * - A successful upload followed by a FAILED update does not re-upload. The
   *   persisted attachments live in the upload hook, so pressing Retry re-runs
   *   only `updateProject` with the references that already exist.
   *
   * Browser `File`s, blob URLs, and `PreparedMedia` are never handed to a
   * persisted project: the production path passes `addedAttachments`, which carry
   * real storage references. `addedMedia` is used ONLY on the explicit session-only
   * path, when the transport reports itself unavailable.
   *
   * Existing attachments are referenced by id and never re-sent, so they stay
   * valid throughout — and untouched until this update commits.
   */
  const save = useCallback(async (coverUpdate?: { attachmentId: Id; frame: ProjectCoverFrame }): Promise<MetadataFieldKey | 'failed' | null> => {
    if (!editingProjectId || !profileId || isSavingRef.current || upload.isBusy) {
      if (coverUpdate) throw new Error('The project is not ready to save this preview. Try again shortly.');
      return null;
    }
    const invalid = validate();
    if (invalid) {
      return invalid;
    }
    if (coverUpdate && !attachmentEdits.some((attachment) => attachment.id === coverUpdate.attachmentId && attachment.isCover)) {
      throw new Error('The project preview has changed. Close this editor and try again.');
    }
    // Direct Save must include the new crop in this request, without waiting
    // for a state update and accidentally persisting the previous frame.
    const editsForSave = coverUpdate ? attachmentEdits.map((attachment) => attachment.id === coverUpdate.attachmentId
      ? { ...attachment, coverFrame: normalizeProjectCoverFrame(coverUpdate.frame) } : attachment) : attachmentEdits;
    const hasAdded = addedMedia.items.length > 0;
    if (attachmentEdits.length === 0 && !hasAdded) {
      setSaveFailure({
        code: 'invalid_media',
        message: 'A project has to keep at least one file. Restore one, or add a new file, before saving.',
        retry: null
      });
      return 'failed';
    }
    let addedAttachments: PersistedAttachment[] | undefined;
    if (hasAdded && isTransportAvailable) {
      // Already stored from an earlier attempt whose update failed: reuse the
      // references rather than sending the bytes a second time.
      const persisted = upload.hasPersistedMedia ? upload.attachments : await upload.upload({
        profileId,
        draftId: editingProjectId,
        media: addedMedia.items
      });
      if (!persisted || persisted.length === 0) {
        // The upload hook owns this outcome — its failure, progress, and retry are
        // rendered from its own state. Nothing about the published project moved.
        return 'failed';
      }
      addedAttachments = persisted;
    }
    // The session-only fallback, kept explicit: locally prepared files, and no
    // claim that anything was stored.
    const sessionMedia = hasAdded && !isTransportAvailable ? addedMedia.items : undefined;
    const attempt = async (): Promise<boolean> => {
      isSavingRef.current = true;
      setEditorPhase('saving');
      setSaveFailure(null);
      setSaveResult(null);
      try {
        const result = await projectService.updateProject({
          projectId: editingProjectId,
          profileId,
          metadata: {
            title: metadata.title.trim(),
            summary: metadata.summary.trim()
          },
          attachments: editsForSave,
          addedAttachments,
          addedMedia: sessionMedia
        });
        if (!isMountedRef.current) {
          return true;
        }
        setSaveResult(result);
        // The record moved, so every surface reading it re-reads.
        invalidateProfiles();
        // Re-seed from what the service actually stored, so the form can never
        // disagree with the published record.
        hydrate(result.project);
        setEditorPhase('saved');
        // The stored objects now belong to the project, so they must NOT be
        // treated as orphans when the editor closes.
        upload.reset();
        if (sessionMedia) {
          // Session-only: the project renders from these previews, so preparation
          // stops revoking them.
          addedMedia.releaseOwnership();
        }
        addedMedia.clear();
        return true;
      } catch (error) {
        if (!isMountedRef.current) {
          return false;
        }
        const {
          code,
          message
        } = failureFrom(error, 'Those changes could not be saved.');
        // Everything entered is still here: the phase returns to editing rather
        // than discarding the form.
        setEditorPhase('editing');
        setSaveFailure({
          code,
          message,
          // Retries ONLY the project update: `addedAttachments` is captured, so
          // the bytes that already reached storage are never sent again.
          retry: isRetryable(code) ? () => void attempt() : null
        });
        return false;
      } finally {
        isSavingRef.current = false;
      }
    };
    return (await attempt()) ? null : 'failed';
  }, [addedMedia, attachmentEdits, editingProjectId, hydrate, invalidateProfiles, isTransportAvailable, metadata, profileId, projectService, upload, validate]);

  /* ── Deleting ──────────────────────────────────────────────────────────── */
  const [deletingProjectId, setDeletingProjectId] = useState<Id | null>(null);
  const [deletePhase, setDeletePhase] = useState<DeletePhase>('idle');
  const [deleteFailure, setDeleteFailure] = useState<ProjectMutationFailure | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteProjectResult | null>(null);
  const isDeletingRef = useRef(false);
  const requestDelete = useCallback((projectId: Id) => {
    setDeletingProjectId(projectId);
    setDeletePhase('confirming');
    setDeleteFailure(null);
    setDeleteResult(null);
  }, []);
  const cancelDelete = useCallback(() => {
    if (isDeletingRef.current) {
      return;
    }
    setDeletingProjectId(null);
    setDeletePhase('idle');
    setDeleteFailure(null);
    setDeleteResult(null);
  }, []);

  /**
   * Resolves true only once the service has CONFIRMED the deletion, so the caller
   * leaves the deleted project's URL at that point and not before.
   */
  const confirmDelete = useCallback(async (): Promise<boolean> => {
    if (!deletingProjectId || isDeletingRef.current) {
      return false;
    }
    const projectId = deletingProjectId;
    const attempt = async (): Promise<boolean> => {
      isDeletingRef.current = true;
      setDeletePhase('deleting');
      setDeleteFailure(null);
      try {
        const result = await projectService.deleteProject(projectId, {
          profileId: profileId ?? undefined
        });
        if (!isMountedRef.current) {
          return true;
        }
        setDeleteResult(result);
        setDeletePhase('deleted');
        invalidateProfiles();
        return true;
      } catch (error) {
        if (!isMountedRef.current) {
          return false;
        }
        const {
          code,
          message
        } = failureFrom(error, 'That project could not be deleted.');
        // Still published: the confirmation stays open with the reason on it.
        setDeletePhase('failed');
        setDeleteFailure({
          code,
          message,
          retry: isRetryable(code) ? () => void attempt() : null
        });
        return false;
      } finally {
        isDeletingRef.current = false;
      }
    };
    return attempt();
  }, [deletingProjectId, invalidateProfiles, profileId, projectService]);
  return useMemo(() => ({
    editor: {
      projectId: editingProjectId,
      mode: editorMode,
      phase: editorPhase,
      metadata,
      fieldErrors,
      attachmentEdits,
      originalAttachments,
      previewAspectRatio,
      loadError,
      failure: saveFailure,
      result: saveResult,
      isSaving: editorPhase === 'saving',
      /** True only when saving would materially change the published record. */
      isDirty,
      /** True when the creator dropped files the published record still holds. */
      hasRemovals: originalAttachments.length !== attachmentEdits.length,
      open: openEditor,
      openFiles,
      close: closeEditor,
      retryLoad,
      setField: setMetadataField,
      setAttachmentTitle,
      setCover,
      setCoverFrame,
      moveAttachment,
      removeAttachment,
      restoreAttachments,
      save,
      /** Preparation for files added during this edit: selection and previews. */
      addedMedia,
      /**
       * The transport state machine for those files. The editor renders progress,
       * Cancel, the failure reason, Retry, and any cleanup failure straight from
       * here — every figure comes from the service.
       */
      upload,
      /** True while bytes are moving, so editing and saving are held. */
      isTransferring: upload.isBusy
    },
    deletion: {
      projectId: deletingProjectId,
      phase: deletePhase,
      failure: deleteFailure,
      result: deleteResult,
      isDeleting: deletePhase === 'deleting',
      request: requestDelete,
      cancel: cancelDelete,
      confirm: confirmDelete
    }
  }), [addedMedia, attachmentEdits, cancelDelete, closeEditor, confirmDelete, deleteFailure, deletePhase, deleteResult, deletingProjectId, editingProjectId, editorMode, editorPhase, fieldErrors, isDirty, loadError, metadata, moveAttachment, openEditor, openFiles, originalAttachments, previewAspectRatio, removeAttachment, requestDelete, restoreAttachments, retryLoad, save, saveFailure, saveResult, setAttachmentTitle, setCover, setCoverFrame, setMetadataField, upload]);
}
export type ProjectManagement = ReturnType<typeof useProjectManagement>;
