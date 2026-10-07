import { composeProjectDescription, EMPTY_CREATION } from './firstProject';
import { readFirstProjectDraft, saveFirstProjectDraft, clearFirstProjectDraft, clearDraftWorkspace, draftWorkspaceFingerprint, type FirstProjectStage } from './firstProjectDraft';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useMediaPreparation } from './useMediaPreparation';
import { useMediaUpload } from './useMediaUpload';
import { validateTitle } from './validation';
import type { Id } from '../../types/domain';
import type { DraftMetadata, DraftState, PersistedAttachment, ProjectDraft, PublishResult } from '../../types/publishing';
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
  accessLevel: 'public',
  title: '',
  summary: ''
};
/** The order fields are validated and focused in — the order they are read. */
const FIELD_ORDER: Array<'title' | 'summary'> = ['title', 'summary'];
export function usePublishProject(profileId: Id | null, categoryId: Id | null, isOpen: boolean, categoryLabel = '', manualLocation = false, firstProject = false, presetMadeIn = '', workspace?: { persist: boolean; resume?: ProjectDraft; activation?: boolean }) {
  const {
    projects: projectService, profiles: profileService
  } = useServices();
  const {
    invalidateProfiles, cacheProfile
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
  const restoreMedia = media.restore, restoreUpload = upload.restore;
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<DraftMetadata>(EMPTY_METADATA);
  const [firstProjectStage, setFirstProjectStage] = useState<FirstProjectStage>('files');
  const [restoringDraft, setRestoringDraft] = useState(firstProject);
  const [localDraftError, setLocalDraftError] = useState<string | null>(null);
  const committedPublish = useRef<PublishResult | undefined>();
  const [hasCommittedProject, setHasCommittedProject] = useState(false);
  const draftCompleted = useRef(false);
  const [location, updateLocation] = useState('');
  const [hasChosenLocation, setHasChosenLocation] = useState(false);
  const setLocation = useCallback((value: string) => {
    updateLocation(value);
    setHasChosenLocation(true);
  }, []);
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
  const persistWorkspace = Boolean(workspace?.persist);
  const activation = Boolean(workspace?.activation);
  const resumeId = workspace?.resume?.id;
  const checkpointSignature = useRef<string | null>(null);
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
    draftCompleted.current = false;
    setRestoringDraft(firstProject);
    void (async () => {
      let saved = null;
      if ((firstProject || resumeId) && auth.user?.id) {
        try { saved = await readFirstProjectDraft(auth.user.id, profileId, resumeId) ?? (resumeId ? await readFirstProjectDraft(auth.user.id, profileId) : null);
          if (resumeId && saved?.draft.id !== resumeId) saved = null; }
        catch (error) { if (isCurrent) setLocalDraftError(error instanceof Error ? error.message : 'Local draft storage is unavailable.'); }
      }
      if (!isCurrent) return;
      if (saved) {
        const existing = saved.committed ? saved.draft : await projectService.getDraft(saved.draft.id);
        if (existing && existing.profileId === profileId && (saved.committed || existing.categoryId === categoryId)) {
          if (!isCurrent) return;
          checkpointSignature.current = draftWorkspaceFingerprint({metadata:saved.metadata,location:saved.location,stage:saved.stage,media:saved.media,persisted:saved.persisted,attachments:saved.attachments,committed:saved.committed});
          setDraft(existing); setMetadata(saved.metadata); updateLocation(saved.location);
          setHasChosenLocation(true); restoreMedia(saved.media); restoreUpload(saved, saved.media);
          setFirstProjectStage(saved.stage); setStep(saved.stage === 'review' ? 'preview' : 'metadata');
          committedPublish.current = saved.committed;
          setHasCommittedProject(Boolean(saved.committed));
          setRestoringDraft(false);
          return;
        }
        // The server draft was removed; retain the selected files and authored details.
        setMetadata(saved.metadata); restoreMedia(saved.media); updateLocation(saved.location);
        setFirstProjectStage(saved.stage); setStep(saved.stage === 'review' ? 'preview' : 'metadata');
      } else if (firstProject) setMetadata(activation ? { ...EMPTY_METADATA, tags: '' } : { ...EMPTY_METADATA, creationDetails: { ...structuredClone(EMPTY_CREATION), madeIn: presetMadeIn } });
      setRestoringDraft(false);
      if (resumeId) {
        const existing = await projectService.getDraft(resumeId);
        if (!existing || existing.profileId !== profileId || existing.categoryId !== categoryId) throw new Error('This draft is no longer available.');
        if (isCurrent) { setDraft(existing); setMetadata(existing.metadata); }
        return;
      }
      const created = await projectService.createDraft(profileId, categoryId);
      if (isCurrent) setDraft(created);
    })().catch((caught) => {
      if (isCurrent) {
        draftRequestRef.current = null;
        setRestoringDraft(false);
        setDraftError(caught instanceof Error ? caught.message : 'Could not start a draft.');
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, profileId, categoryId, isOwner, projectService, firstProject, presetMadeIn, auth.user?.id, restoreMedia, restoreUpload, resumeId, activation]);
  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      checkpointSignature.current = null;
      setDraftError(null);
      setMetadata(EMPTY_METADATA);
      if ((firstProject || persistWorkspace) && !committedPublish.current?.sessionOnly) media.clear();
      setHasCommittedProject(false);
      setFirstProjectStage('files');
      setRestoringDraft(firstProject);
      committedPublish.current = undefined;
      updateLocation('');
      setHasChosenLocation(false);
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
  const setField = useCallback((key: 'title' | 'summary' | 'tags', value: string) => {
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
  const setCreationDetails = useCallback((details: NonNullable<DraftMetadata['creationDetails']>) => {
    setMetadata(current => ({ ...current, creationDetails: details, summary: JSON.stringify(current.creationDetails?.answers) === JSON.stringify(details.answers) ? current.summary : composeProjectDescription(details.answers) }));
  }, []);
  const saveLocalDraft = useCallback(async (flushMetadata = false) => {
    if ((!firstProject && !persistWorkspace) || !auth.user?.id || !profileId || restoringDraft || draftCompleted.current) return;
    if (!draft) {
      if (media.items.length) { setLocalDraftError('Your draft is still starting. Wait a moment before leaving.'); throw new Error('Draft is still starting.'); }
      return;
    }
    try {
      const contents = {metadata,location,stage:step === 'preview' ? 'review' as const : firstProjectStage,media:media.items,persisted:upload.persisted,attachments:upload.attachments,committed:committedPublish.current};
      const signature = draftWorkspaceFingerprint(contents);
      if (flushMetadata && !committedPublish.current && (draft.metadata.title !== metadata.title || draft.metadata.summary !== metadata.summary)) await projectService.updateDraft(draft.id, metadata);
      if (checkpointSignature.current === signature) { setLocalDraftError(null); return; }
      await saveFirstProjectDraft({updatedAt:new Date().toISOString(),version:1,accountId:auth.user.id,profileId,draft,...contents},firstProject && !resumeId ? undefined : draft.id);
      checkpointSignature.current = signature;
      setLocalDraftError(null);
    } catch (error) {
      setLocalDraftError(error instanceof Error ? error.message : 'Your draft could not be saved on this device.');
      throw error;
    }
  }, [firstProject, persistWorkspace, resumeId, auth.user?.id, profileId, draft, metadata, location, step, firstProjectStage, media.items, upload.persisted, upload.attachments, restoringDraft, projectService]);
  useEffect(() => {
    if (isOpen) void saveLocalDraft().catch(() => undefined);
  }, [isOpen, saveLocalDraft]);
  const isDirty = useMemo(() => FIELD_ORDER.some((key) => metadata[key].trim() !== '') || location.trim() !== '' || media.items.length > 0, [metadata, location, media.items.length]);
  const inferredRelevance = useMemo(() => deriveProjectRelevance({
    title: metadata.title,
    summary: metadata.summary,
    categoryLabel,
  }), [categoryLabel, metadata.summary, metadata.title]);
  const validate = useCallback(() => {
    const nextErrors = {
      title: validateTitle(metadata.title),
      // Descriptions are prose, not captions: do not impose a character cap.
      summary: metadata.summary.trim() ? null : 'Add a description before publishing.'
    };
    setFieldErrors(nextErrors);
    const firstInvalid = FIELD_ORDER.find((key) => nextErrors[key]) ?? null;
    setInvalidField(firstInvalid);
    return firstInvalid === null;
  }, [metadata, firstProject]);
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
  const publish = useAsyncAction(async (retriedAttachments?: PersistedAttachment[]) => {
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
      if (!committedPublish.current) {
      // Publishing is one continuous action. Persist the current details here
      // instead of requiring a separate review step to save them first.
      try {
        await projectService.updateDraft(draft.id, metadata);
      } catch (caught) {
        throw new Error(caught instanceof Error && caught.message ? caught.message : 'These details could not be saved to your draft.');
      }
      }
      const canPersist = media.capability?.isAvailable === true;
      let attachments = retriedAttachments ?? upload.attachments;
      if (!committedPublish.current && canPersist && attachments.length === 0) {
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
      const published = committedPublish.current ?? await projectService.publishProject({
        draftId: draft.id,
        profileId,
        onCommitted: async confirmed => { committedPublish.current = confirmed; setHasCommittedProject(true); await saveLocalDraft(); },
        categoryId: draft.categoryId,
        metadata,
        ...(manualLocation || hasChosenLocation ? { location: location.trim() } : {}),
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
      committedPublish.current = published;
      setHasCommittedProject(true);
      await saveLocalDraft().catch(() => undefined);
      if (metadata.tags !== undefined) {
        const tags = [...new Set(metadata.tags.split(',').map(tag => tag.trim()).filter(Boolean))];
        try { await projectService.updateProjectTags(published.projectId, tags); }
        catch { throw new Error('Your project is published. Try again to finish saving its tags.'); }
      }
      if (published.creationDetailsPending && metadata.creationDetails) {
        try { await projectService.updateProjectCreationDetails(published.projectId, metadata.creationDetails); published.creationDetailsPending = false; }
        catch { throw new Error('Your project is published. Its date, field and answers still need saving. Retry to save only these details.'); }
      }
      if (firstProject) {
        // Keep the real cover in Review until the canonical profile contains the
        // committed tile. Closing first would briefly reveal the zero-work view.
        const refreshed = await profileService.getProfile(profileId);
        if (!refreshed.projects.some(project => project.id === published.projectId)) {
          throw new Error('Your project is published. Try again to open the updated portfolio.');
        }
        invalidateProfiles();
        cacheProfile(refreshed);
      }
      draftCompleted.current = true;
      if ((firstProject || persistWorkspace) && auth.user?.id && profileId) await (draft?.id ? clearDraftWorkspace(auth.user.id, profileId, draft.id) : clearFirstProjectDraft(auth.user.id, profileId)).catch(() => undefined);
      if (attachments.length === 0) {
        // Session-only publishing: the previews now belong to the published
        // record for the rest of the session, so this hook stops revoking them.
        media.releaseOwnership();
      } else {
        // The record renders from storage now, so the local previews are no
        // longer needed by anything and are released immediately.
        media.clear();
      }
      if (!firstProject) invalidateProfiles();
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
      if (!committedPublish.current) setDraft(await projectService.updateDraft(draft.id, metadata));
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
    if (committedPublish.current) { setDiscardError('This project has already been published. Its files cannot be discarded as a draft.'); return false; }
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
      draftCompleted.current = true;
      if ((firstProject || persistWorkspace) && auth.user?.id && profileId) await (draft?.id ? clearDraftWorkspace(auth.user.id, profileId, draft.id) : clearFirstProjectDraft(auth.user.id, profileId));
      media.clear();
      upload.reset();
      return true;
    } catch (caught) {
      setDiscardError(caught instanceof Error && caught.message ? caught.message : 'This draft could not be discarded.');
      return false;
    } finally {
      setIsDiscarding(false);
    }
  }, [draft, media, projectService, upload, firstProject, persistWorkspace, resumeId, auth.user?.id, profileId]);
  const state: DraftState = publish.isLoading || upload.isBusy ? 'publishing' : publish.status === 'error' || upload.phase === 'failed' ? 'failed' : result ? 'published' : media.isComplete && !validateTitle(metadata.title) && metadata.summary.trim() ? 'ready' : 'editing';
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
      // Carry the confirmed result across the async boundary. This callback's
      // captured upload state may still be empty until React renders again.
      await publish.run(uploaded);
    }
  }, [draft, profileId, upload, publish]);
  const isMetadataComplete = !validateTitle(metadata.title) && (metadata.summary.trim() !== '');
  // Stated plainly rather than leaving a disabled control unexplained.
  const blockingReason = !media.isComplete ? 'Add at least one file to continue.' : validateTitle(metadata.title) ?? (!firstProject && !metadata.summary.trim() ? 'Add a description before continuing.' : null);
  /**
   * Whether publishing will actually store the files. False while no storage
   * backend is connected, and the UI must say so rather than implying an upload.
   */
  const willPersistMedia = media.capability?.isAvailable === true;
  return {
    isOwner,
    presetMadeIn, hasCommittedProject, firstProject, firstProjectStage, setFirstProjectStage, restoringDraft, localDraftError, saveLocalDraft, setCreationDetails,
    draft,
    draftError,
    metadata,
    location,
    setLocation,
    inferredRelevance,
    ignoreInferredLocation,
    setIgnoreInferredLocation,
    fieldErrors,
    /** Which field to move focus to after a failed validation pass. */
    invalidField,
    isMediaMissing,
    setField, setCitationFields: (fields: Pick<DraftMetadata, 'accessLevel' | 'madeOn'>) => setMetadata(current => ({ ...current, ...fields })),
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
