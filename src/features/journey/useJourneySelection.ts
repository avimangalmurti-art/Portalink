import { useEffect, useState } from 'react';
import { journeyPreferenceKey, readJourneyPreference, rememberJourneyPreference } from './journey';
export function useJourneySelection(profileId: string, viewerId: string | null | undefined) {
  const key = journeyPreferenceKey(viewerId, profileId);
  const [selection, setSelection] = useState(() => ({ key, view: readJourneyPreference(key) }));
  useEffect(() => { setSelection({ key, view: readJourneyPreference(key) }); }, [key]);
  return { view: selection.key === key ? selection.view : readJourneyPreference(key), select(view: 'portfolio' | 'journey') {
    setSelection({ key, view }); rememberJourneyPreference(key, view);
  } };
}
