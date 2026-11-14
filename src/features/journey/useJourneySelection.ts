import { useEffect, useState } from 'react';
import { journeyPreferenceKey, readJourneyPreference, rememberJourneyPreference } from './journey';

export function useJourneySelection(profileId: string, viewerId: string | null | undefined, remember = true, startInTimeline = false) {
  const key = journeyPreferenceKey(viewerId, profileId);
  const initial = () => ({
    key,
    view: startInTimeline ? 'journey' as const : remember ? readJourneyPreference(key) : 'portfolio' as const,
    restoring: startInTimeline,
  });
  const [selection, setSelection] = useState(initial);
  useEffect(() => {
    const view = startInTimeline ? 'journey' : remember ? readJourneyPreference(key) : 'portfolio';
    setSelection({ key, view, restoring: startInTimeline });
  }, [key, remember, startInTimeline]);
  const current = selection.key === key ? selection : initial();
  return { view: current.view, restoring: current.restoring, select(view: 'portfolio' | 'journey') {
    setSelection({ key, view, restoring: false });
    if (remember) rememberJourneyPreference(key, view);
  } };
}
