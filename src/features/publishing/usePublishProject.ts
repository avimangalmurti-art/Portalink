import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useMediaPreparation } from './useMediaPreparation';
import { useMediaUpload } from './useMediaUpload';
import { validateSummary, validateTitle } from './validation';
import type { Id } from '../../types/domain';
import type { DraftMetadata, DraftState, ProjectDraft, PublishResult } from '../../types/publishing';
import { deriveProjectRelevance } from '../../domain/discovery/ranking';

/**
 * The publishing feature boundary.
 *
 * UI → this hook → `ProjectService` → implementation. Ownership is checked
 * here from the authenticated identity, and re-checked by the service; hiding
 * the entry point is UX, not authorization.
 */
export type PublishStep = 'metadata' | 'preview' | 'done';
/**
 * Nothing is pre-filled: metadata the creator did not type would be invented on
 * their behalf, so every field starts empty. A title is the only required
 * public detail; a creator can add context when it genuinely helps the work.
 */
const EMPTY_METADATA: DraftMetadata = {
  title: '',
  summary: ''
};
/** The order fields are validated and focused in — the order they are read. */
const FIELD_ORDER: (keyof DraftMetadata)[] = ['title', 'summary'];
export function usePublishProject(profileId: Id | null, categoryId: Id | null, isOpen: boolean, categoryLabel = '') {
  const {
    projects: projectService
  } = useServices();
  const {
    invalidateProfiles
  } = useProfileData();
  const auth = useAuth();
  // A project is a collection of assets of any family, so preparation is not
  // scoped to the category's presentation format.
  const media = useMediaPreparation();
  /**
   * Media transport. It reads the capability preparation already resolved, so
   * there is one answer about whether uploading is possible, and it can never
   * enter an uploading state while that answer is "no".
   */
  const upload = useMediaUpload(media.capability);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<DraftMetadata>(EMPTY_METADATA);
  const [ignoreInferredLocation, setIgnoreInferredLocation] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof DraftMetadata, string | null>>>({});
  const [step, setStep] = useState<PublishStep>('metadata');
  const [result, setResult] = useState<PublishResult | null>(null);
  // Which field the UI should move focus to after a failed validation pass.
  const [invalidField, setInvalidField] = useState<keyof DraftMetadata | null>(null);
  // Set when review was attempted with no files chosen.
  const [isMediaMissing, setIsMediaMissing] = useState(false);
  /**
   * Saving the draft on the way to review, and discarding it, are real requests
   * that can fail. Both used to end in `.catch(() => undefined)`: the flow
   * advanced to review even though the service never accepted the metadata, and a
   * refused discard was reported as a successful one. Their outcomes are now
   * held here so the UI can tell the truth about each.
   */
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [saveDraftError, setSaveDraftError] = useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const isOwner = Boolean(profileId) && auth.viewerProfileId === profileId;
  // Exactly one draft per opening. Without this, any re-render that re-runs the
  // effect would strand the previous draft on the service.
  const draftRequestRef = useRef<string | null>(null);
  // Belt and braces against a double publish: a second submit while the first
  // request is still in flight is refused before it reaches the service.
  const isPublishingRef = useRef(false);

  // A draft exists before anything is published, and only for an owner.
  useEffect(() => {
    if (!isOpen || !profileId || !categoryId || !isOwner) {
      return undefined;
    }
    const requestKey = `${profileId}:${categoryId}`;
    if (draftRequestRef.current === requestKey) {
      return undefined;
    }
    draftRequestRef.current = requestKey;
    let isCurrent = true;
    setDraftError(null);
    projectService.createDraft(profileId, categoryId).then((created) => {
      if (isCurrent) {
        setDraft(created);
      }
    }).catch((caught) => {
      if (isCurrent) {
        // The attempt failed, so allow another one rather than locking the flow.
        draftRequestRef.current = null;
        setDraftError(caught instanceof Error ? caught.message : 'Could not start a draft.');
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, profileId, categoryId, isOwner, projectService]);
  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      setDraftError(null);
      setMetadata(EMPTY_METADATA);
      setIgnoreInferredLocation(false);
      setFieldErrors({});
      setStep('metadata');
      setResult(null);
      setInvalidField(null);
      setIsMediaMissing(false);
      setIsSavingDraft(false);
      setSaveDraftError(null);
      setIsDiscarding(false);
      setDiscardError(null);
      upload.reset();
      draftRequestRef.current = null;
      isPublishingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on close.
  }, [isOpen]);
  const setField = useCallback((key: keyof DraftMetadata, value: string) => {
    setMetadata((current) => ({
      ...current,
      [key]: value
    }));
    setFieldErrors((current) => ({
      ...current,
      [key]: null
    }));
    setInvalidField(null);
  }, []);
  const isDirty = useMemo(() => FIELD_ORDER.some((key) => metadata[key].trim() !== '') || media.items.length > 0, [metadata, media.items.length]);
  const inferredRelevance = useMemo(() => deriveProjectRelevance({
    title: metadata.title,
    summary: metadata.summary,
    categoryLabel,
  }), [categoryLabel, metadata.summary, metadata.title]);
  const validate = useCallback(() => {
    const nextErrors = {
      title: validateTitle(metadata.title),
      summary: validateSummary(metadata.summary)
    };
    setFieldErrors(nextErrors);
    const firstInvalid = FIELD_ORDER.find((key) => nextErrors[key]) ?? null;
    setInvalidField(firstInvalid);
    return firstInvalid === null;
  }, [metadata]);
  /**
   * The production-ready publish sequence:
   *
   *   validate metadata → validate files → save draft → upload media →
   *   real progress → persisted attachments → publish → invalidate → open
   *
   * The project is not created until media persistence has succeeded, so a record
   * can never reference files that are not in storage. When the transport reports
   * itself unavailable the flow falls back to the explicitly prototype-only path,
   * publishing from locally prepared files and reporting a session-only result.
   *
   * Upload failure and publish failure are deliberately different states: one is
   * retried by re-sending bytes, the other by re-requesting publication only.
   */
  const publish = useAsyncAction(async () => {
    if (!draft || !profileId || !categoryId) {
      throw new Error('No draft to publish.');
    }
    if (isPublishingRef.current) {
      // Already in flight: refuse rather than create a second project.
      return;
    }
    // Metadata is re-validated at the moment of publishing, so nothing can be
    // published that the review step would have rejected.
    if (!validate()) {
      setStep('metadata');
      throw new Error('Some details still need attention.');
    }
    if (media.items.length === 0) {
      throw new Error('Add at least one file before publishing.');
    }
    isPublishingRef.current = true;
    try {
      // Publishing is one continuous action. Persist the current details here
      // instead of requiring a separate review step to save them first.
      try {
        await projectService.updateDraft(draft.id, metadata);
      } catch (caught) {
        throw new Error(caught instanceof Error && caught.message ? caught.message : 'These details could not be saved to your draft.');
      }
      const canPersist = media.capability?.isAvailable === true;
      let attachments = upload.attachments;
      if (canPersist && attachments.length === 0) {
        // Bytes first. A failure or a cancellation stops the sequence here, with
        // metadata, files, order, and cover all untouched.
        const uploaded = await upload.upload({
          profileId,
          draftId: draft.id,
          media: media.items
        });
        if (!uploaded) {
          // The upload state carries its own message, retry, and cancellation, so
          // this is not reported a second time as a publish failure.
          return;
        }
        attachments = uploaded;
      }
      const published = await projectService.publishProject({
        draftId: draft.id,
        profileId,
        categoryId,
        metadata,
        relevance: ignoreInferredLocation ? {
          ...inferredRelevance,
          contentGeography: null,
          geographicScope: 'location_independent',
          geographyConfidence: 0,
        } : inferredRelevance,
        // Exactly one source. Persisted attachments carry real storage keys; the
        // prepared-files path is prototype-only and yields a session-only result.
        ...(attachments.length > 0 ? {
          attachments
        } : {
          media: media.items
        })
      });
      if (attachments.length === 0) {
        // Session-only publishing: the previews now belong to the published
        // record for the rest of the session, so this hook stops revoking them.
        media.releaseOwnership();
      } else {
        // The record renders from storage now, so the local previews are no
        // longer needed by anything and are released immediately.
        media.clear();
      }
      invalidateProfiles();
      setResult(published);
      setStep('done');
    } finally {
      // Released on failure too, so Retry works. The draft and everything typed
      // into it are untouched by a failed attempt.
      isPublishingRef.current = false;
    }
  });
  const goToPreview = useCallback(async () => {
    const isMetadataValid = validate();
    if (!media.isComplete) {
      // A project is its files; there is nothing to review without them. Flagged
      // rather than silently ignored, so the reason is announced and focused.
      setIsMediaMissing(true);
      return;
    }
    setIsMediaMissing(false);
    if (!isMetadataValid) {
      return;
    }
    if (!draft) {
      return;
    }
    // Metadata is saved to the draft BEFORE review, so the service holds the same
    // values the preview shows. If that save is refused the preview would be
    // showing something the store never accepted, so the flow stays on the
    // editing step with everything typed and every chosen file intact.
    setIsSavingDraft(true);
    setSaveDraftError(null);
    try {
      await projectService.updateDraft(draft.id, metadata);
      setStep('preview');
    } catch (caught) {
      setSaveDraftError(caught instanceof Error && caught.message ? caught.message : 'These details could not be saved to your draft.');
    } finally {
      setIsSavingDraft(false);
    }
  }, [validate, media.isComplete, draft, projectService, metadata]);
  // Choosing a file answers the objection, so the notice clears itself.
  useEffect(() => {
    if (media.isComplete) {
      setIsMediaMissing(false);
    }
  }, [media.isComplete]);
  /**
   * Discards the draft, and reports whether it actually happened. The caller must
   * not close the flow on `false`: a refused discard means the draft still exists,
   * and claiming otherwise would tell the creator their work was thrown away when
   * it was not — or worse, leave it stranded on the service with no way back to
   * it. Local previews are only released once the service has agreed.
   */
  const discard = useCallback(async (): Promise<boolean> => {
    setIsDiscarding(true);
    setDiscardError(null);
    /**
     * Files that reached storage but whose project was never published are
     * orphans, so they are deleted BEFORE the draft is treated as discarded. This
     * covers the case where publishing failed after a successful upload and the
     * creator chose Discard rather than Retry. If the remote cleanup fails, the
     * discard does not complete: reporting "discarded" while objects remain in
     * storage is exactly how orphans become invisible.
     */
    if (upload.persisted.length > 0) {
      const cleaned = await upload.cleanupPersisted();
      if (!cleaned) {
        setDiscardError('Your uploaded files could not be removed from storage, so this draft has not been discarded. Nothing has been lost — try again.');
        setIsDiscarding(false);
        return false;
      }
    }
    if (!draft) {
      media.clear();
      upload.reset();
      setIsDiscarding(false);
      return true;
    }
    try {
      await projectService.discardDraft(draft.id);
      media.clear();
      upload.reset();
      return true;
    } catch (caught) {
      setDiscardError(caught instanceof Error && caught.message ? caught.message : 'This draft could not be discarded.');
      return false;
    } finally {
      setIsDiscarding(false);
    }
  }, [draft, media, projectService, upload]);
  const state: DraftState = publish.isLoading || upload.isBusy ? 'publishing' : publish.status === 'error' || upload.phase === 'failed' ? 'failed' : result ? 'published' : media.isComplete && metadata.title.trim() ? 'ready' : 'editing';
  /**
   * Retrying after a PUBLISH failure must not re-upload. The persisted
   * attachments are still held by the transport hook, so this repeats only the
   * publication request.
   */
  const retryPublish = useCallback(() => {
    void publish.run();
  }, [publish]);
  /** Retrying after an UPLOAD failure re-sends the same files, and nothing else. */
  const retryUpload = useCallback(async () => {
    if (!draft || !profileId) {
      return;
    }
    const uploaded = await upload.retry({
      profileId,
      draftId: draft.id
    });
    if (uploaded) {
      // The bytes are in; carry straight on to publication.
      void publish.run();
    }
  }, [draft, profileId, upload, publish]);
  const isMetadataComplete = metadata.title.trim() !== '';
  // Stated plainly rather than leaving a disabled control unexplained.
  const blockingReason = !media.isComplete ? 'Add at least one file to continue.' : !isMetadataComplete ? 'Give this project a title before continuing.' : null;
  /**
   * Whether publishing will actually store the files. False while no storage
   * backend is connected, and the UI must say so rather than implying an upload.
   */
  const willPersistMedia = media.capability?.isAvailable === true;
  return {
    isOwner,
    draft,
    draftError,
    metadata,
    inferredRelevance,
    ignoreInferredLocation,
    setIgnoreInferredLocation,
    fieldErrors,
    /** Which field to move focus to after a failed validation pass. */
    invalidField,
    isMediaMissing,
    setField,
    media,
    /** The transport: phase, progress, per-file states, failure, retry, cancel. */
    upload,
    retryUpload,
    retryPublish,
    /**
     * True when the bytes are already in storage. A publish failure at this point
     * is recovered by retrying publication only — never by uploading again.
     */
    canRetryPublishOnly: upload.hasPersistedMedia,
    step,
    setStep,
    state,
    isDirty,
    result,
    publish,
    goToPreview,
    isSavingDraft,
    saveDraftError,
    dismissSaveDraftError: () => setSaveDraftError(null),
    discard,
    isDiscarding,
    discardError,
    dismissDiscardError: () => setDiscardError(null),
    blockingReason,
    willPersistMedia,
    // Review is always reachable: submitting runs validation and reports what is
    // missing on the fields themselves, rather than disabling the only way
    // forward and leaving the person to guess.
    canPreview: !publish.isLoading && !isSavingDraft && !upload.isBusy,
    canPublish: Boolean(draft) && isMetadataComplete && media.isComplete && !publish.isLoading && !upload.isBusy,
    /**
     * An upload in flight must not be abandoned silently by Escape or a backdrop
     * click: the dialog asks for confirmation, or requires cancellation first.
     */
    hasUploadInFlight: upload.phase === 'uploading' || upload.phase === 'cancelling'
  };
}
