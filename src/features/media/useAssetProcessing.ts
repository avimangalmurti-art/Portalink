import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import type { Id, ProjectAttachment } from '../../types/domain';
import type { AssetProcessingStatus, ProcessingCapability } from '../../types/publishing';

/**
 * Server-side processing for a project's PERSISTED assets.
 *
 * `UI → this hook → MediaService → implementation`. Transport is finished by the
 * time this runs: the bytes are in storage and the project exists. What is still
 * outstanding is the derived work — a poster frame, a page raster, a transcode,
 * a tessellated model — and until the service says that finished, the viewer says
 * so rather than showing an empty frame that implies a preview exists.
 *
 * Three rules:
 *
 * 1. **A state only ever changes because the service said so.** There is no timer
 *    that advances `processing` to `ready`, and no elapsed-time heuristic. The
 *    only transition is a re-query, and its cadence is the implementation's own
 *    (`refreshIntervalSeconds`) — absent means once, plus on demand.
 * 2. **Processing failure is not upload failure.** The bytes landed; the job did
 *    not. The repair is re-running that job against the stable object id, which
 *    is `retry` here — nothing is uploaded again.
 * 3. **Finishing refreshes the canonical record.** When an asset becomes ready,
 *    the profile data boundary is invalidated so the finished preview arrives
 *    through the same read every surface already uses. No screen is rebuilt and no
 *    component learns about storage.
 */
export type AssetProcessingPhase = 'idle' | 'unavailable' | 'checking' | 'watching' | 'error';
export type AssetProcessingState = {
  capability: ProcessingCapability | null;
  phase: AssetProcessingPhase;
  /** The service's latest word per object id. Absent means it said nothing. */
  statuses: Record<Id, AssetProcessingStatus>;
  /** The query itself failed. Distinct from a job failing. */
  error: string | null;
  /** Object ids whose retry request is in flight. */
  retrying: Id[];
  /** Re-queries every watched asset now. */
  refresh: () => void;
  /** Re-runs ONE failed job by its stable object id. Never re-uploads. */
  retry: (objectId: Id) => Promise<void>;
  /** The state to present for an attachment: the service's word, or the record's. */
  resolveState: (attachment: ProjectAttachment) => ProjectAttachment['status'];
  /** The service's message for an attachment, when it gave one. */
  resolveMessage: (attachment: ProjectAttachment) => string | null;
  canRetry: (attachment: ProjectAttachment) => boolean;
};

/** Only a stored object can be processed, and only these states are outstanding. */
function isWatchable(attachment: ProjectAttachment): boolean {
  return attachment.storagePath !== null && (attachment.status === 'processing' || attachment.status === 'processing-failed');
}
/** Completed document jobs are queried once as well, because their fixed page
 * total remains useful presentation metadata even after processing has ended. */
function hasDocumentStatus(attachment: ProjectAttachment): boolean {
  return attachment.storagePath !== null && attachment.kind === 'document';
}
function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
export function useAssetProcessing(attachments: ProjectAttachment[]): AssetProcessingState {
  const {
    media: mediaService
  } = useServices();
  const {
    invalidateProfiles
  } = useProfileData();
  const [capability, setCapability] = useState<ProcessingCapability | null>(null);
  const [statuses, setStatuses] = useState<Record<Id, AssetProcessingStatus>>({});
  const [phase, setPhase] = useState<AssetProcessingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Id[]>([]);
  const [attempt, setAttempt] = useState(0);

  // The ids under observation, as a stable key so the effect does not re-run on
  // every render of a new array with the same contents.
  const statusIds = useMemo(() => attachments.filter(hasDocumentStatus).map((attachment) => attachment.id).sort(), [attachments]);
  const watchedIds = useMemo(() => attachments.filter(isWatchable).map((attachment) => attachment.id).sort(), [attachments]);
  const statusKey = statusIds.join('|');
  const watchedKey = watchedIds.join('|');
  // Only the newest query may settle: navigating between projects while a query
  // is outstanding must not write one project's statuses into another's.
  const latestRequestRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);
  useEffect(() => {
    if (statusIds.length === 0) {
      return;
    }
    let cancelled = false;
    mediaService.getProcessingCapability().then((next) => {
      if (!cancelled && isMountedRef.current) {
        setCapability(next);
      }
    }).catch(() => {
      // A capability that cannot be read promises nothing: no processing UI is
      // offered on an assumption.
      if (!cancelled && isMountedRef.current) {
        setCapability(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mediaService, statusKey, statusIds.length]);
  const query = useCallback(async (ids: Id[]) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setPhase('checking');
    setError(null);
    try {
      const results = await mediaService.getProcessingStatus(ids);
      if (latestRequestRef.current !== requestId || !isMountedRef.current) {
        return;
      }
      // An id the service did not mention keeps whatever it had. Silence is not
      // permission to call something ready.
      const becameReady = results.some((result) => result.state === 'ready');
      setStatuses((current) => {
        const next = {
          ...current
        };
        results.forEach((result) => {
          next[result.objectId] = result;
        });
        return next;
      });
      setPhase('watching');
      if (becameReady) {
        // The finished preview arrives through the canonical read, so every
        // surface showing this work updates at once.
        invalidateProfiles();
      }
    } catch (caught) {
      if (latestRequestRef.current !== requestId || !isMountedRef.current) {
        return;
      }
      setError(messageFor(caught, 'The processing state could not be read.'));
      setPhase('error');
    }
  }, [invalidateProfiles, mediaService]);

  // One query per change to the watched set, plus one per explicit refresh.
  useEffect(() => {
    if (statusIds.length === 0) {
      setPhase(capability && !capability.isAvailable ? 'unavailable' : 'idle');
      return;
    }
    if (capability && !capability.isAvailable) {
      // No pipeline: nothing to poll and nothing to wait for. The record's own
      // state is presented as-is.
      setPhase('unavailable');
      return;
    }
    void query(statusIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statusKey is the identity of statusIds.
  }, [statusKey, capability, query, attempt]);

  /**
   * Re-querying on the implementation's own interval. This polls a real endpoint;
   * it never advances a state locally, and it stops as soon as nothing is
   * outstanding.
   */
  useEffect(() => {
    const seconds = capability?.refreshIntervalSeconds;
    if (!seconds || !capability?.isAvailable || watchedIds.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void query(statusIds);
    }, Math.max(1, seconds) * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- watchedKey is the identity of watchedIds.
  }, [capability, statusKey, watchedKey, query]);
  const refresh = useCallback(() => setAttempt((current) => current + 1), []);
  const retry = useCallback(async (objectId: Id) => {
    if (retrying.includes(objectId)) {
      return;
    }
    setRetrying((current) => [...current, objectId]);
    setError(null);
    try {
      const result = await mediaService.retryProcessing(objectId);
      if (!isMountedRef.current) {
        return;
      }
      // Whatever the service reports the job is NOW in — queued, running, or
      // genuinely finished. Nothing here assumes it succeeded.
      setStatuses((current) => ({
        ...current,
        [objectId]: result
      }));
      if (result.state === 'ready') {
        invalidateProfiles();
      }
    } catch (caught) {
      if (!isMountedRef.current) {
        return;
      }
      // The retry request failed, which is not the same as the job failing again:
      // the asset keeps its last known state and the reason is reported.
      setError(messageFor(caught, 'That job could not be run again. Nothing was changed.'));
    } finally {
      if (isMountedRef.current) {
        setRetrying((current) => current.filter((id) => id !== objectId));
      }
    }
  }, [invalidateProfiles, mediaService, retrying]);
  const resolveState = useCallback((attachment: ProjectAttachment) => statuses[attachment.id]?.state ?? attachment.status, [statuses]);
  const resolveMessage = useCallback((attachment: ProjectAttachment) => statuses[attachment.id]?.message ?? null, [statuses]);
  const canRetry = useCallback((attachment: ProjectAttachment) => {
    if (!capability?.isAvailable || capability.canRetry !== true) {
      return false;
    }
    const status = statuses[attachment.id];
    if (resolveState(attachment) !== 'processing-failed') {
      return false;
    }
    // Retry is offered only when the service says this job is worth re-running.
    return status?.isRetryable !== false;
  }, [capability, resolveState, statuses]);
  return {
    capability,
    phase,
    statuses,
    error,
    retrying,
    refresh,
    retry,
    resolveState,
    resolveMessage,
    canRetry
  };
}
