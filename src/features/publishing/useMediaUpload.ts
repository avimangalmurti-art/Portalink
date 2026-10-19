import { useCallback, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { attachmentsFromPersistedMedia } from '../media/persistedMediaAttachments';
import { UploadServiceError } from '../../types/publishing';
import type { Id } from '../../types/domain';
import type { PersistedAttachment, PersistedMedia, PreparedMedia, UploadCapability, UploadFailure, UploadId, UploadItemState, UploadProgress } from '../../types/publishing';

/**
 * The media transport state machine.
 *
 * UI → this hook → `MediaService` → implementation. Presentation never learns
 * about storage: it receives a phase, a fraction, per-file states, and callbacks.
 *
 * Rules this hook enforces, because they are the ones that are easy to break:
 *
 * - It NEVER enters `uploading`, `uploaded`, or any progress state when the
 *   capability reports unavailable. There is no timer anywhere in this file:
 *   every fraction comes from a service event.
 * - The selected `PreparedMedia` is kept verbatim across a failure, so Retry
 *   retries the same intended upload rather than resetting the creator's work.
 * - A successful upload followed by a failed publish must NOT re-upload. The
 *   persisted results live here and survive publish failures.
 * - Anything that reached storage is tracked so it can be deleted rather than
 *   silently orphaned — including partial results from a failure or cancellation.
 */
export type UploadPhase = 'idle' | 'uploading' | 'cancelling' | 'cancelled' | 'uploaded' | 'failed';
export type MediaUploadState = {
  phase: UploadPhase;
  /** Live operation id, available while the upload runs. */
  uploadId: UploadId | null;
  /** 0–1 overall, straight from the service. Null until it reports something. */
  fraction: number | null;
  bytesSent: number | null;
  bytesTotal: number | null;
  /** Per-file, only when the transport attributes bytes to files. */
  itemProgress: Record<string, {
    fraction: number;
    state: UploadItemState;
  }>;
  /** Persisted results of the last successful upload. */
  persisted: PersistedMedia[];
  attachments: PersistedAttachment[];
  failure: UploadFailure | null;
  /** True while orphan cleanup is running. */
  isCleaningUp: boolean;
  /** Cleanup that could not complete, stated rather than swallowed. */
  cleanupError: string | null;
  /** True when an upload is running or being cancelled. */
  isBusy: boolean;
  /** True when files are stored and a publish can proceed without re-uploading. */
  hasPersistedMedia: boolean;
};
export function useMediaUpload(capability: UploadCapability | null) {
  const {
    media: mediaService
  } = useServices();
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [uploadId, setUploadId] = useState<UploadId | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [persisted, setPersistedState] = useState<PersistedMedia[]>([]);
  const [attachments, setAttachmentsState] = useState<PersistedAttachment[]>([]);
  const checkpoint = useRef<{persisted: PersistedMedia[]; attachments: PersistedAttachment[]}>({persisted: [], attachments: []});
  const setPersisted = useCallback((value: PersistedMedia[]) => {
    checkpoint.current = {...checkpoint.current, persisted: value};
    setPersistedState(value);
  }, []);
  const setAttachments = useCallback((value: PersistedAttachment[]) => {
    checkpoint.current = {...checkpoint.current, attachments: value};
    setAttachmentsState(value);
  }, []);
  // Upload completion can precede React's next render. Publication checkpoints
  // must use the confirmed result, rather than the previous render's arrays.
  const getCheckpoint = useCallback(() => checkpoint.current, []);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  /** The exact media the last attempt was made with, so Retry repeats it. */
  const attemptedMediaRef = useRef<PreparedMedia[]>([]);
  /** One operation at a time, independently of any disabled control. */
  const isRunningRef = useRef(false);
  const isAvailable = capability?.isAvailable === true;
  const reportsPerFile = capability?.reportsPerFileProgress === true;
  const reset = useCallback(() => {
    setPhase('idle');
    setUploadId(null);
    setProgress(null);
    setPersisted([]);
    setAttachments([]);
    setFailure(null);
    setCleanupError(null);
    attemptedMediaRef.current = [];
    isRunningRef.current = false;
  }, [setAttachments, setPersisted]);

  /**
   * Deletes stored objects through the service. Used for orphan cleanup: files
   * that reached storage but whose project was never published.
   *
   * Only objects the service itself reported are passed, and only ones carrying a
   * real storage path — a local object URL is not storage and never reaches
   * `deleteMedia`. A failure is returned rather than swallowed, because claiming
   * everything was discarded while objects remain in a bucket is exactly how
   * silent orphans happen.
   */
  const cleanupPersisted = useCallback(async (objects: PersistedMedia[] = persisted): Promise<boolean> => {
    const removable = objects.filter((item) => Boolean(item.storagePath) && Boolean(item.objectId));
    if (removable.length === 0) {
      return true;
    }
    setIsCleaningUp(true);
    setCleanupError(null);
    const results = await Promise.allSettled(removable.map((item) => mediaService.deleteMedia(item.objectId)));
    const failed = removable.filter((_, index) => results[index].status === 'rejected');
    setIsCleaningUp(false);
    if (failed.length > 0) {
      const first = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
      const reason = first?.reason instanceof Error && first.reason.message ? first.reason.message : 'The stored files could not be removed.';
      setCleanupError(`${failed.length === removable.length ? 'None' : `${failed.length} of ${removable.length}`} of the uploaded files could be removed. ${reason}`);
      // The ones that are genuinely gone are dropped; the rest stay tracked so a
      // retry knows exactly what is still out there.
      setPersisted(failed);
      return false;
    }
    setPersisted([]);
    setAttachments([]);
    return true;
  }, [mediaService, persisted, setAttachments, setPersisted]);

  /**
   * Starts — or retries — the upload of the given prepared media.
   *
   * Returns the persisted attachments on success and null on any other outcome,
   * so the publishing orchestration can simply stop rather than inspect phases.
   */
  const upload = useCallback(async (input: {
    profileId: Id;
    draftId: Id;
    media: PreparedMedia[];
  }): Promise<PersistedAttachment[] | null> => {
    // The one hard gate: an unavailable transport can never produce an uploading
    // state, a progress figure, or a persisted result.
    if (!isAvailable) {
      return null;
    }
    if (isRunningRef.current) {
      return null;
    }
    // Already stored from an earlier attempt: publishing may have failed after a
    // successful upload, and re-sending the same bytes would be wrong.
    if (attachments.length > 0 && phase === 'uploaded') {
      return attachments;
    }
    isRunningRef.current = true;
    attemptedMediaRef.current = input.media;
    setPhase('uploading');
    setFailure(null);
    setCleanupError(null);
    setProgress(null);
    try {
      const operation = await mediaService.startUpload({
        profileId: input.profileId,
        draftId: input.draftId,
        media: input.media,
        // The ONLY source of progress in the product.
        onProgress: (next) => setProgress(next)
      });
      // Available while the transfer runs, which is what makes Cancel real.
      setUploadId(operation.uploadId);
      const outcome = await operation.completion;
      if (outcome.status === 'cancelled') {
        setPhase('cancelled');
        setUploadId(null);
        setProgress(null);
        // Bytes that landed before the cancellation took effect are the caller's
        // to remove when the service says so.
        if (outcome.cleanupRequired && outcome.persisted.length > 0) {
          setPersisted(outcome.persisted);
          await cleanupPersisted(outcome.persisted);
        }
        return null;
      }
      const persistedAttachments = attachmentsFromPersistedMedia(input.media, outcome.media);
      // A result that produced no storage-backed attachment did not persist.
      if (persistedAttachments.length !== input.media.length) {
        setPersisted(outcome.media);
        setFailure({
          code: 'rejected',
          message: 'Some files did not come back with a storage reference, so the upload is incomplete.',
          persisted: outcome.media,
          cleanupRequired: true
        });
        setPhase('failed');
        setUploadId(null);
        return null;
      }
      setPersisted(outcome.media);
      setAttachments(persistedAttachments);
      setPhase('uploaded');
      setUploadId(null);
      return persistedAttachments;
    } catch (caught) {
      const asUploadError = caught instanceof UploadServiceError;
      const next: UploadFailure = {
        code: asUploadError ? caught.code : 'unknown',
        message: caught instanceof Error && caught.message ? caught.message : 'The upload could not be completed.',
        persisted: asUploadError ? caught.persisted : [],
        cleanupRequired: asUploadError ? caught.cleanupRequired : false
      };
      setFailure(next);
      setPhase('failed');
      setUploadId(null);
      setProgress(null);
      // A partial success is tracked so it can be removed, never left behind.
      if (next.persisted.length > 0) {
        setPersisted(next.persisted);
        if (next.cleanupRequired) {
          await cleanupPersisted(next.persisted);
        }
      }
      return null;
    } finally {
      isRunningRef.current = false;
    }
  }, [isAvailable, mediaService, attachments, phase, cleanupPersisted, setAttachments, setPersisted]);

  /** Retries the SAME intended upload. Nothing the creator chose is reset. */
  const retry = useCallback(async (input: {
    profileId: Id;
    draftId: Id;
  }) => {
    const intended = attemptedMediaRef.current;
    if (intended.length === 0) {
      return null;
    }
    setPhase('idle');
    return upload({
      ...input,
      media: intended
    });
  }, [upload]);

  /**
   * Cancels a running upload. Cancellation is only reported once the service
   * confirms it — the operation's own completion also settles as cancelled, and
   * whichever path resolves first leaves the state consistent.
   */
  const cancel = useCallback(async () => {
    if (!uploadId || phase !== 'uploading') {
      return;
    }
    setPhase('cancelling');
    try {
      const outcome = await mediaService.cancelUpload(uploadId);
      setPhase('cancelled');
      setUploadId(null);
      setProgress(null);
      if (outcome.status === 'cancelled' && outcome.cleanupRequired && outcome.persisted.length > 0) {
        setPersisted(outcome.persisted);
        await cleanupPersisted(outcome.persisted);
      }
    } catch (caught) {
      // The cancellation itself failed, so the upload may well still be running.
      // Saying "cancelled" here would be a lie about what is happening.
      setPhase('uploading');
      setFailure({
        code: caught instanceof UploadServiceError ? caught.code : 'unknown',
        message: caught instanceof Error && caught.message ? caught.message : 'The upload could not be cancelled.',
        persisted: [],
        cleanupRequired: false
      });
    }
  }, [uploadId, phase, mediaService, cleanupPersisted, setPersisted]);
  const dismissFailure = useCallback(() => setFailure(null), []);
  const dismissCleanupError = useCallback(() => setCleanupError(null), []);
  const state = useMemo<MediaUploadState>(() => ({
    phase,
    uploadId,
    fraction: progress?.fraction ?? null,
    bytesSent: progress?.bytesSent ?? null,
    bytesTotal: progress?.bytesTotal ?? null,
    itemProgress: reportsPerFile ? progress?.items ?? {} : {},
    persisted,
    attachments,
    failure,
    isCleaningUp,
    cleanupError,
    isBusy: phase === 'uploading' || phase === 'cancelling',
    hasPersistedMedia: attachments.length > 0
  }), [phase, uploadId, progress, reportsPerFile, persisted, attachments, failure, isCleaningUp, cleanupError]);
  const restore = useCallback((saved: { persisted: PersistedMedia[]; attachments: PersistedAttachment[] }, media: PreparedMedia[]) => {
    setPersisted(saved.persisted); setAttachments(saved.attachments);
    setPhase(saved.attachments.length ? 'uploaded' : 'idle');
    attemptedMediaRef.current = media;
  }, [setAttachments, setPersisted]);
  return {
    ...state,
    getCheckpoint,
    restore,
    upload,
    retry,
    cancel,
    cleanupPersisted,
    dismissFailure,
    dismissCleanupError,
    reset
  };
}
export type MediaUpload = ReturnType<typeof useMediaUpload>;
