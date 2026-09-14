import { useCallback, useEffect, useState } from 'react';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useServices } from '../../contexts/ServicesContext';
import type { DiscoverSections, ExplorationMode } from '../../types/discovery';

export function useDiscover(mode: ExplorationMode) {
  const { discovery } = useServices();
  const { revision } = useProfileData();
  const [sections, setSections] = useState<DiscoverSections | null>(null);
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setPhase('loading');
    setError(null);
    discovery.getDiscoverSections(mode).then((next) => {
      if (!current) return;
      setSections(next);
      setPhase('success');
    }).catch((caught) => {
      if (!current) return;
      setError(caught instanceof Error ? caught.message : 'Discover could not be loaded.');
      setPhase('error');
    });
    return () => { current = false; };
  }, [attempt, discovery, mode, revision]);

  return {
    phase,
    sections,
    error,
    retry: useCallback(() => setAttempt((value) => value + 1), []),
    recordCuriosity: useCallback(async (projectId: string) => {
      await discovery.recordProjectSignal(projectId, 'curiosity');
      setAttempt((value) => value + 1);
    }, [discovery]),
  };
}
