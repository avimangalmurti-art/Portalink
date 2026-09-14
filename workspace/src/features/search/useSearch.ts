import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id, SearchResult } from '../../types/domain';

/**
 * The search boundary. Presentation passes a query in and receives a lifecycle
 * out; it never touches `SearchService`.
 *
 * Two things searching gets wrong by default, both handled here:
 *
 * - Every keystroke firing a request. Typing is debounced, so a request is made
 *   once the viewer pauses rather than once per character.
 * - Out-of-order responses. Requests are tagged with the query that asked for
 *   them, and an answer that arrives after the query has moved on is discarded.
 *   Without that, a slow response for "lo" can land after a fast one for
 *   "london" and leave the older query's results on screen.
 *
 * A failure keeps the query exactly as typed, so retrying costs nothing.
 */
export type SearchPhase = 'idle' | 'loading' | 'results' | 'empty' | 'error';
export type SearchState = {
  phase: SearchPhase;
  /** Results for the query currently on screen, never for an older one. */
  results: SearchResult[];
  /** The query these results answer. */
  resolvedQuery: string;
  error: string | null;
  retry: () => void;
};
const DEBOUNCE_MS = 250;
export function useSearch(query: string): SearchState {
  const { search } = useServices();
  const trimmed = query.trim();
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resolvedQuery, setResolvedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /**
   * The query the newest request belongs to. A response is only accepted while
   * this still names the query that asked for it.
   */
  const inFlightQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!trimmed) {
      // An empty field is idle, not an empty result set: nothing was asked.
      inFlightQueryRef.current = null;
      setPhase('idle');
      setResults([]);
      setResolvedQuery('');
      setError(null);
      return undefined;
    }
    setPhase('loading');
    setError(null);
    // A retry runs immediately; typing waits for the viewer to pause.
    const delay = attempt > 0 ? 0 : DEBOUNCE_MS;
    const timer = window.setTimeout(() => {
      inFlightQueryRef.current = trimmed;
      search.search(trimmed).then((nextResults) => {
        if (inFlightQueryRef.current !== trimmed) {
          return;
        }
        setResults(nextResults);
        setResolvedQuery(trimmed);
        setPhase(nextResults.length === 0 ? 'empty' : 'results');
      }).catch((caught) => {
        if (inFlightQueryRef.current !== trimmed) {
          return;
        }
        // The query itself is untouched, so a retry needs no retyping.
        setError(caught instanceof Error && caught.message ? caught.message : 'Search could not be completed.');
        setPhase('error');
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [search, trimmed, attempt]);
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);
  return useMemo(() => ({
    phase,
    // Results are withheld unless they answer the query on screen, so an older
    // query's results can never be rendered against a newer one.
    results: resolvedQuery === trimmed ? results : [],
    resolvedQuery,
    error,
    retry
  }), [phase, results, resolvedQuery, trimmed, error, retry]);
}

/** Splits a result set into the kinds each surface renders differently. */
export function groupResults(results: SearchResult[]): {
  locations: SearchResult[];
  profiles: SearchResult[];
  projects: SearchResult[];
} {
  return {
    locations: results.filter((result) => result.kind === 'location'),
    profiles: results.filter((result) => result.kind === 'profile'),
    projects: results.filter((result) => result.kind === 'project')
  };
}

/** Convenience for surfaces that navigate by id. */
export type SearchNavigation = {
  onOpenProject: (projectId: Id) => void;
  onOpenCreator: (creatorId: Id) => void;
};