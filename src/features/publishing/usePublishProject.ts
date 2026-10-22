import { composeProjectDescription, EMPTY_CREATION } from './firstProject';
import { readFirstProjectDraft, saveFirstProjectDraft, clearFirstProjectDraft, clearDraftWorkspace, draftWorkspaceFingerprint, type FirstProjectDraft, type FirstProjectStage } from './firstProjectDraft';
import { readSetupDraft, clearSetupDraft } from './setupDraft';
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
import { usePresentation } from '../../presentation/usePresentation';

/**
 * The publishing feature boundary.
 *
 * UI → this hook → `ProjectService` → implementation. Ownership is checked
 * here from the authenticated identity, and re-checked by the service; hiding
 * the entry point is UX, not authorization.
 */
export type PublishStep = 'metadata' | 'preview' | 'done';
/**
 * New fields start empty unless supplied by the creator in project setup.
 * Metadata the creator did not type would be invented on
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
export function usePublishProject(profileId: Id | null, categoryId: Id | null, isOpen: boolean, categoryLabel = '', manualLocation = false, firstProject = false, presetMadeIn = '', workspace?: { initialMetadata?: Pick<DraftMetadata, 'title' | 'summary'>; persist: boolean; resume?: ProjectDraft; activation?: boolean; awaitProfile?: boolean }) {
  const {
    projects: projectService, profiles: profileService
  } = useServices();
  const {
    invalidateProfiles, cacheProfile
  } = useProfileData();
  const auth = useAuth();
  const isMobile = usePresentation() === 'mobile';
  const recoveryOpening = useRef({ accountId: auth.user?.id, profileId, categoryId, enabled: false, resumeId: undefined as string | undefined, wasOpen: false });
  if (recoveryOpening.current.accountId !== auth.user?.id || recoveryOpening.current.profileId !== profileId || recoveryOpening.current.categoryId !== categoryId) {
    recoveryOpening.current = { accountId: auth.user?.id, profileId, categoryId, enabled: false, resumeId: undefined, wasOpen: false };
  }
  const uploadRecoveryScope = recoveryOpening.current;
  // Changing presentation must not turn off durability halfway through this
  // opening. A fresh WEB opening still uses the existing ordinary transport.
  if (isOpen && !uploadRecoveryScope.wasOpen) { uploadRecoveryScope.enabled = false; uploadRecoveryScope.resumeId = undefined; }
  uploadRecoveryScope.wasOpen = isOpen;
  if (isOpen && isMobile && (firstProject || workspace?.persist)) uploadRecoveryScope.enabled = true;
  if (isOpen && isMobile && workspace?.resume?.id) uploadRecoveryScope.resumeId = workspace.resume.id;
  const resumeId = uploadRecoveryScope.enabled ? uploadRecoveryScope.resumeId : workspace?.resume?.id;
  const waitForProfile = firstProject || workspace?.awaitProfile === true;
  // A project is a collection of assets of any family, so preparation is not
  // scoped to the category's presentation format.
  const media = useMediaPreparation();
  /**
   * Media transport. It reads the capability preparation already resolved, so
   * there is one answer about whether uploading is possible, and it can never
   * enter an uploading state while that answer is "no".
   */
  const upload = useMediaUpload(media.capability, auth.user?.id ? { accountId: auth.user.id, enabled: uploadRecoveryScope.enabled } : undefined);
  const restoreMedia = media.restore, restoreUpload = upload.restore, getUploadCheckpoint = upload.getCheckpoint;
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<DraftMetadata>(EMPTY_METADATA);
  const [firstProjectStage, setFirstProjectStage] = useState<FirstProjectStage>('files');
  const [restoringDraft, setRestoringDraft] = useState(firstProject);
  const [localDraftError, setLocalDraftError] = useState<string | null>(null);
  const committedPublish = useRef<PublishResult | undefined>();
  const [hasCommittedProject, setHasCommittedProject] = useState(false);
  const [hasDiscardedDraft, setHasDiscardedDraft] = useState(false);
  const remoteDiscarded = useRef(false);
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
  const persistWorkspace = Boolean(workspace?.persist || uploadRecoveryScope.enabled);
  const activation = Boolean(workspace?.activation);
  const initialTitle = workspace?.initialMetadata?.title, initialSummary = workspace?.initialMetadata?.summary;
  const checkpointSignature = useRef<string | null>(null);
  const [checkpointStatus, setCheckpointStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [draftAttempt, setDraftAttempt] = useState(0);
  const opening = useMemo(() => ({ active: true, isOpen, accountId:auth.user?.id, profileId, categoryId, resumeId }), [isOpen, auth.user?.id, profileId, categoryId, resumeId]);
  const currentOpening = useRef(opening);
  currentOpening.current = opening;
  const initializedOpening = useRef<{opening: typeof opening; draftId: string} | null>(null);
  useEffect(() => {
    opening.active = true;
    return () => { opening.active = false; };
  }, [opening]);
  const isOwner = Boolean(profileId) && auth.viewerProfileId === profileId;
  // Exactly one draft per opening. Without this, any re-render that re-runs the
  // effect would strand the previous draft on the service.
  const draftRequestRef = useRef<{ key: string; promise: Promise<{ existing: ProjectDraft; saved: FirstProjectDraft | null }> } | null>(null);
  // Belt and braces against a double publish: a second submit while the first
  // request is still in flight is refused before it reaches the service.
  const isPublishingRef = useRef(false);

  // A draft exists before anything is published, and only for an owner.
  useEffect(() => {
    if (!isOpen || !profileId || !categoryId || !isOwner) {
      return undefined;
    }
    const requestKey = `${auth.user?.id}:${profileId}:${categoryId}:${resumeId ?? ''}:${draftAttempt}`;
    let isCurrent = true;
    initializedOpening.current = null;
    setDraftError(null);
    setRestoringDraft(true);
    // Reuse one request through effect cleanup/replay. Each subscriber still
    // checks its opening before restoring any creator's fields or files.
    if (draftRequestRef.current?.key !== requestKey) {
      draftCompleted.current = false;
      remoteDiscarded.current = false;
      setHasDiscardedDraft(false);
      draftRequestRef.current = { key: requestKey, promise: (async () => {
        let saved: FirstProjectDraft | null = null;
        if ((firstProject || resumeId) && auth.user?.id) {
          saved = await readFirstProjectDraft(auth.user.id, profileId, resumeId)
            ?? (resumeId ? await readFirstProjectDraft(auth.user.id, profileId) : null);
          if (resumeId && saved?.draft.id !== resumeId) saved = null;
        }
        if (saved) {
          const existing = saved.committed ? saved.draft : await projectService.getDraft(saved.draft.id);
          // A publish can remove its remote draft before its acknowledgement
          // reaches the phone. Never recreate it and risk duplicate publishing.
          if (!existing || existing.profileId !== profileId || existing.categoryId !== categoryId) {
            throw new Error('This draft is no longer available. Your saved work remains on this device. Check your catalogue before trying again.');
          }
          return { existing, saved };
        }
        if (resumeId) {
          const existing = await projectService.getDraft(resumeId);
          if (!existing || existing.profileId !== profileId || existing.categoryId !== categoryId) throw new Error('This draft is no longer available.');
          return { existing, saved: null };
        }
        return { existing: await projectService.createDraft(profileId, categoryId), saved: null };
      })() };
    }
    void draftRequestRef.current.promise.then(({ existing, saved }) => {
      if (!isCurrent || !opening.active || currentOpening.current !== opening) return;
      initializedOpening.current = {opening, draftId:existing.id};
      setDraft(existing);
      if (saved) {
        checkpointSignature.current = draftWorkspaceFingerprint({metadata:saved.metadata,location:saved.location,stage:saved.stage,media:saved.media,persisted:saved.persisted,attachments:saved.attachments,committed:saved.committed});
        setMetadata(saved.metadata); updateLocation(saved.location);
        setHasChosenLocation(true); restoreMedia(saved.media); restoreUpload(saved, saved.media);
        setFirstProjectStage(saved.stage); setStep(saved.stage === 'review' ? 'preview' : 'metadata');
        committedPublish.current = saved.committed;
        setHasCommittedProject(Boolean(saved.committed));
        setCheckpointStatus('saved');
      } else if (resumeId) setMetadata(existing.metadata);
      else if (initialTitle !== undefined) setMetadata({...EMPTY_METADATA,title:initialTitle,summary:initialSummary??''});
      else if (firstProject) setMetadata(activation ? { ...EMPTY_METADATA, tags: '' } : { ...EMPTY_METADATA, creationDetails: { ...structuredClone(EMPTY_CREATION), madeIn: presetMadeIn } });
      setRestoringDraft(false);
    }).catch((caught) => {
      if (isCurrent) {
        setRestoringDraft(false);
        setDraftError(caught instanceof Error ? caught.message : 'Could not start a draft.');
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, profileId, categoryId, isOwner, projectService, firstProject, presetMadeIn, auth.user?.id, restoreMedia, restoreUpload, resumeId, activation, initialTitle, initialSummary, opening, draftAttempt]);
  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      checkpointSignature.current = null;
      setCheckpointStatus('idle');
      setLocalDraftError(null);
      setDraftError(null);
      setMetadata(EMPTY_METADATA);
      if ((firstProject || persistWorkspace) && !committedPublish.current?.sessionOnly) media.clear();
      setHasCommittedProject(false);
      setHasDiscardedDraft(false);
      remoteDiscarded.current = false;
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
  const workspaceNow = {draft, metadata, location, stage:step === 'preview' ? 'review' as const : firstProjectStage, media:media.items, restoringDraft};
  const latestWorkspace = useRef(workspaceNow);
  latestWorkspace.current = workspaceNow;
  const checkpointRevision = useRef(0);
  const saveLocalDraft = useCallback(async (flushMetadata = false) => {
    const current = () => opening.active && currentOpening.current === opening && !draftCompleted.current;
    if ((!firstProject && !persistWorkspace) || !auth.user?.id || !profileId || !current()) return;
    const snapshot = latestWorkspace.current;
    if (snapshot.restoringDraft || !snapshot.draft || initializedOpening.current?.opening !== opening || initializedOpening.current.draftId !== snapshot.draft.id || snapshot.draft.profileId !== profileId || snapshot.draft.categoryId !== categoryId) {
      throw new Error('Your draft is still opening. Wait a moment before leaving.');
    }
    if (!snapshot.metadata.title.trim() && !snapshot.metadata.summary.trim() && !snapshot.location.trim() && !snapshot.media.length && !committedPublish.current && checkpointSignature.current === null) return;
    const revision = ++checkpointRevision.current;
    try {
      const confirmed = getUploadCheckpoint();
      const contents = {metadata:snapshot.metadata,location:snapshot.location,stage:snapshot.stage,media:snapshot.media,...confirmed,committed:committedPublish.current};
      const signature = draftWorkspaceFingerprint(contents);
      if (checkpointSignature.current !== signature) {
        setCheckpointStatus('saving');
        await saveFirstProjectDraft({updatedAt:new Date().toISOString(),version:1,accountId:auth.user.id,profileId,draft:snapshot.draft,...contents},firstProject && !resumeId ? undefined : snapshot.draft.id);
      }
      if (!current() || revision !== checkpointRevision.current) return;
      checkpointSignature.current = signature;
      setCheckpointStatus('saved'); setLocalDraftError(null);
      // The lightweight setup copy remains until files/details have a durable
      // workspace. Never clear an unrelated setup created in another tab.
      if (initialTitle !== undefined) {
        try {
          const setup = readSetupDraft(auth.user.id, profileId);
          if (setup?.portal === categoryId && setup.title.trim() === initialTitle.trim() && setup.summary.trim() === (initialSummary??'').trim()) clearSetupDraft(auth.user.id, profileId);
        } catch { /* Keeping an extra setup copy cannot lose this saved work. */ }
      }
      if (flushMetadata && !committedPublish.current) await projectService.updateDraft(snapshot.draft.id, snapshot.metadata);
    } catch (error) {
      if (current() && revision === checkpointRevision.current) setLocalDraftError(error instanceof Error ? error.message : 'Your draft could not be saved on this device.');
      throw error;
    }
  }, [firstProject, persistWorkspace, resumeId, auth.user?.id, profileId, categoryId, opening, getUploadCheckpoint, projectService, initialTitle, initialSummary]);
  useEffect(() => {
    if (isOpen && draft && !restoringDraft) void saveLocalDraft().catch(() => undefined);
  }, [isOpen, draft, metadata, location, step, firstProjectStage, media.items, upload.persisted, upload.attachments, hasCommittedProject, restoringDraft, saveLocalDraft]);
  useEffect(() => {
    if (!isOpen || !persistWorkspace) return;
    const flush = () => { void saveLocalDraft().catch(() => undefined); };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', flush); };
  }, [isOpen, persistWorkspace, saveLocalDraft]);
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
      summary: null
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
  const publish = useAsyncAction(async (retriedAttachments?: PersistedAttachment[]) => {
    const assertCurrentOpening = () => {
      if (!opening.active || currentOpening.current !== opening) throw new Error('This publishing session has changed. Reopen your saved project to continue.');
    };
    assertCurrentOpening();
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
      // Files/details must be checkpointed before starting a recoverable upload.
      await saveLocalDraft();
      assertCurrentOpening();
      // Publishing is one continuous action. Persist the current details here
      // instead of requiring a separate review step to save them first.
      try {
        await projectService.updateDraft(draft.id, metadata);
        assertCurrentOpening();
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
          media: media.items,
          onCheckpoint: async () => { assertCurrentOpening(); await saveLocalDraft(); assertCurrentOpening(); },
        });
        if (!uploaded) {
          // The upload state carries its own message, retry, and cancellation, so
          // this is not reported a second time as a publish failure.
          return;
        }
        attachments = uploaded;
        assertCurrentOpening();
      }
      // Read the synchronous transport checkpoint before asking the server to
      // publish; React may not have rendered the completed upload yet.
      await saveLocalDraft();
      assertCurrentOpening();
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
      assertCurrentOpening();
      committedPublish.current = published;
      setHasCommittedProject(true);
      await saveLocalDraft().catch(() => undefined);
      assertCurrentOpening();
      if (metadata.tags !== undefined) {
        const tags = [...new Set(metadata.tags.split(',').map(tag => tag.trim()).filter(Boolean))];
        try { await projectService.updateProjectTags(published.projectId, tags); }
        catch { throw new Error('Your project is published. Try again to finish saving its tags.'); }
      }
      assertCurrentOpening();
      if (published.creationDetailsPending && metadata.creationDetails) {
        try { await projectService.updateProjectCreationDetails(published.projectId, metadata.creationDetails); published.creationDetailsPending = false; }
        catch { throw new Error('Your project is published. Its date, field and answers still need saving. Retry to save only these details.'); }
      }
      assertCurrentOpening();
      if (waitForProfile) {
        // Keep the real cover in Review until the canonical profile contains the
        // committed tile. Closing first would briefly reveal the zero-work view.
        const refreshed = await profileService.getProfile(profileId);
        assertCurrentOpening();
        if (refreshed.id !== profileId || !refreshed.projects.some(project => project.id === published.projectId)) {
          throw new Error('Your project is published. Try again to open the updated catalogue.');
        }
        invalidateProfiles();
        cacheProfile(refreshed);
      }
      draftCompleted.current = true;
      if ((firstProject || persistWorkspace) && auth.user?.id && profileId) await (draft?.id ? clearDraftWorkspace(auth.user.id, profileId, draft.id) : clearFirstProjectDraft(auth.user.id, profileId)).catch(() => undefined);
      assertCurrentOpening();
      if (attachments.length === 0) {
        // Session-only publishing: the previews now belong to the published
        // record for the rest of the session, so this hook stops revoking them.
        media.releaseOwnership();
      } else {
        // The record renders from storage now, so the local previews are no
        // longer needed by anything and are released immediately.
        media.clear();
      }
      if (!waitForProfile) invalidateProfiles();
      setResult(published);
      setStep('done');
    } finally {
      // Released on failure too, so Retry works. The draft and everything typed
      // into it are untouched by a failed attempt.
      if (currentOpening.current === opening) isPublishingRef.current = false;
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
    // If remote removal succeeded but clearing this device failed, retry only
    // that final local cleanup. There is no longer a remote draft to edit.
    if (remoteDiscarded.current && draft && auth.user?.id && profileId) {
      try { await clearDraftWorkspace(auth.user.id, profileId, draft.id); media.clear(); upload.reset(); return true; }
      catch { setDiscardError('The draft was removed from your account, but its saved copy on this device could not be cleared. Try again to finish removing it.'); return false; }
      finally { setIsDiscarding(false); }
    }
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
      remoteDiscarded.current = true;
      setHasDiscardedDraft(true);
      if ((firstProject || persistWorkspace) && auth.user?.id && profileId) await (draft?.id ? clearDraftWorkspace(auth.user.id, profileId, draft.id) : clearFirstProjectDraft(auth.user.id, profileId));
      media.clear();
      upload.reset();
      return true;
    } catch (caught) {
      setDiscardError(remoteDiscarded.current ? 'The draft was removed from your account, but its saved copy on this device could not be cleared. Try again to finish removing it.' : caught instanceof Error && caught.message ? caught.message : 'This draft could not be discarded.');
      return false;
    } finally {
      setIsDiscarding(false);
    }
  }, [draft, media, projectService, upload, firstProject, persistWorkspace, auth.user?.id, profileId]);
  const removeLocalDraft = useCallback(async () => {
    const current = () => opening.active && currentOpening.current === opening;
    if (!current() || !resumeId || !auth.user?.id || !profileId || draft || !draftError) return false;
    setIsDiscarding(true); setDiscardError(null);
    try { await clearDraftWorkspace(auth.user.id, profileId, resumeId); return current(); }
    catch { if (current()) setDiscardError('The saved copy could not be removed from this device. Try again.'); return false; }
    finally { if (current()) setIsDiscarding(false); }
  }, [resumeId, auth.user?.id, profileId, draft, draftError, opening]);
  const state: DraftState = publish.isLoading || upload.isBusy ? 'publishing' : publish.status === 'error' || upload.phase === 'failed' ? 'failed' : result ? 'published' : media.isComplete && !validateTitle(metadata.title) ? 'ready' : 'editing';
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
  const isMetadataComplete = !validateTitle(metadata.title);
  // Stated plainly rather than leaving a disabled control unexplained.
  const blockingReason = !media.isComplete ? 'Add at least one file to continue.' : validateTitle(metadata.title);
  /**
   * Whether publishing will actually store the files. False while no storage
   * backend is connected, and the UI must say so rather than implying an upload.
   */
  const willPersistMedia = media.capability?.isAvailable === true;
  const localDraftStatus = !firstProject && !persistWorkspace ? 'disabled' : localDraftError ? 'error'
    : !isDirty ? 'idle' : checkpointStatus === 'saved' && checkpointSignature.current === draftWorkspaceFingerprint({metadata,location,stage:step === 'preview' ? 'review' : firstProjectStage,media:media.items,persisted:upload.persisted,attachments:upload.attachments,committed:committedPublish.current}) ? 'saved' : 'saving';
  return {
    isOwner,
    isOpeningCurrent: () => opening.active && currentOpening.current === opening,
    presetMadeIn, hasCommittedProject, hasDiscardedDraft, firstProject, firstProjectStage, setFirstProjectStage, restoringDraft, localDraftError, localDraftStatus, saveLocalDraft, setCreationDetails,
    retryStartDraft: () => setDraftAttempt(value=>value+1),
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
    removeLocalDraft,
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
