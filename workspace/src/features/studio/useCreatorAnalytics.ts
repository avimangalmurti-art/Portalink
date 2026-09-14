import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { CreatorAnalytics, Id } from '../../types/domain';
import type { ReportingPeriodId } from '../../data/studioAnalytics';

/**
 * Studio's analytics boundary. The workspace previously read its figures straight
 * out of the data module, so `AnalyticsService` had no caller: the reporting
 * period was a client-side filter over content this component happened to hold,
 * and there was no request to be slow, to fail, or to report that a window holds
 * too little data to say anything.
 *
 * The period is a query parameter here. Every response is tagged with the period
 * that asked for it, so an answer for last week cannot land after the viewer has
 * switched to last quarter and be presented as that quarter's figures.
 */
export type AnalyticsPhase = 'loading' | 'data' | 'not-enough-data' | 'error';
export type CreatorAnalyticsState = {
  phase: AnalyticsPhase;
  /** Only ever the analytics for the period currently selected. */
  analytics: CreatorAnalytics | null;
  error: string | null;
  retry: () => void;
};
export function useCreatorAnalytics(profileId: Id | null, periodId: ReportingPeriodId): CreatorAnalyticsState {
  const { analytics: analyticsService } = useServices();
  const [phase, setPhase] = useState<AnalyticsPhase>('loading');
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** The period the newest request belongs to. */
  const requestedPeriodRef = useRef<ReportingPeriodId | null>(null);

  useEffect(() => {
    if (!profileId) {
      requestedPeriodRef.current = null;
      setPhase('not-enough-data');
      setAnalytics(null);
      return;
    }
    requestedPeriodRef.current = periodId;
    setPhase('loading');
    setError(null);
    analyticsService.getCreatorAnalytics(profileId, periodId).then((next) => {
      if (requestedPeriodRef.current !== periodId) {
        return;
      }
      setAnalytics(next);
      // A window with no measured gaze and no metrics is genuinely too thin to
      // report on — distinct from a failure, and never filled with a placeholder.
      setPhase(next.kpiIds.length === 0 && next.headlineGazeHours === 0 ? 'not-enough-data' : 'data');
    }).catch((caught) => {
      if (requestedPeriodRef.current !== periodId) {
        return;
      }
      // Nothing is substituted: the workspace says it could not load rather than
      // showing figures nobody measured.
      setAnalytics(null);
      setError(caught instanceof Error && caught.message ? caught.message : 'Analytics could not be loaded.');
      setPhase('error');
    });
  }, [analyticsService, profileId, periodId, attempt]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  return useMemo(() => ({
    phase,
    analytics,
    error,
    retry
  }), [phase, analytics, error, retry]);
}