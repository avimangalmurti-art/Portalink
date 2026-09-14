import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { GenerationOutcome, GenerativeCapability, Id } from '../../types/domain';
import type { StudioActionKey } from '../../utils/studioQuery';

/**
 * Studio's generative actions boundary.
 *
 * The buttons used to run a local 1200ms timer and then declare "Layout revision
 * drafted" — a success state for work that was never requested, let alone
 * produced. Every action now goes through `AnalyticsService` and reports what the
 * service says actually happened, which in this prototype is explicitly nothing.
 */
export type GenerationPhase = 'idle' | 'running' | 'reported' | 'error';
export type GenerationState = {
  /** Whether generation can run at all, per the service. Null while unknown. */
  capability: GenerativeCapability | null;
  isCapabilityResolving: boolean;
  /** True when the capability itself could not be read — no promise is implied. */
  capabilityError: string | null;
  phase: GenerationPhase;
  /** Which action the current phase belongs to. */
  activeAction: StudioActionKey;
  /** The service's own account of what happened. */
  outcome: GenerationOutcome | null;
  error: string | null;
  /** Re-runs exactly the request that failed. */
  retry: (() => void) | null;
  requestLayoutRevision: (projectId: Id) => void;
  simulateDraft: (files: File[]) => void;
  synthesizeCrossMedia: (projectIds: Id[]) => void;
  /** Clears a reported outcome so the action can be offered again. */
  dismiss: () => void;
};
export function useStudioGeneration(): GenerationState {
  const { analytics } = useServices();
  const [capability, setCapability] = useState<GenerativeCapability | null>(null);
  const [isCapabilityResolving, setIsCapabilityResolving] = useState(true);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [phase, setPhase] = useState<GenerationPhase>('idle');
  const [activeAction, setActiveAction] = useState<StudioActionKey>(null);
  const [outcome, setOutcome] = useState<GenerationOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const isRunningRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setIsCapabilityResolving(true);
    analytics.getGenerativeCapability().then((next) => {
      if (!isCurrent) {
        return;
      }
      setCapability(next);
      setIsCapabilityResolving(false);
    }).catch((caught) => {
      if (!isCurrent) {
        return;
      }
      // A capability that cannot be read is not a working one: nothing claims the
      // action will produce output.
      setCapability(null);
      setCapabilityError(caught instanceof Error && caught.message ? caught.message : 'Whether generation is available could not be checked.');
      setIsCapabilityResolving(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [analytics]);

  const run = useCallback((action: StudioActionKey, request: () => Promise<GenerationOutcome>) => {
    if (isRunningRef.current) {
      return;
    }
    isRunningRef.current = true;
    setActiveAction(action);
    setPhase('running');
    setOutcome(null);
    setError(null);
    setRetry(null);
    request().then((next) => {
      if (!isMountedRef.current) {
        return;
      }
      // Reported, not "done": the outcome states whether anything was generated.
      setOutcome(next);
      setPhase('reported');
    }).catch((caught) => {
      if (!isMountedRef.current) {
        return;
      }
      setError(caught instanceof Error && caught.message ? caught.message : 'That request could not be completed.');
      setPhase('error');
      setRetry(() => () => run(action, request));
    }).finally(() => {
      isRunningRef.current = false;
    });
  }, []);

  const requestLayoutRevision = useCallback((projectId: Id) => {
    run('layout-revision', () => analytics.requestLayoutRevision(projectId));
  }, [run, analytics]);
  const simulateDraft = useCallback((files: File[]) => {
    run('simulate-draft', () => analytics.simulateDraft(files));
  }, [run, analytics]);
  const synthesizeCrossMedia = useCallback((projectIds: Id[]) => {
    run('synthesize', () => analytics.synthesizeCrossMedia(projectIds));
  }, [run, analytics]);
  const dismiss = useCallback(() => {
    setPhase('idle');
    setActiveAction(null);
    setOutcome(null);
    setError(null);
    setRetry(null);
  }, []);

  return useMemo(() => ({
    capability,
    isCapabilityResolving,
    capabilityError,
    phase,
    activeAction,
    outcome,
    error,
    retry,
    requestLayoutRevision,
    simulateDraft,
    synthesizeCrossMedia,
    dismiss
  }), [capability, isCapabilityResolving, capabilityError, phase, activeAction, outcome, error, retry, requestLayoutRevision, simulateDraft, synthesizeCrossMedia, dismiss]);
}