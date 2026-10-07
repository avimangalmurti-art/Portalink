import { useEffect, useState } from 'react';
import { journeyPreferenceKey, readJourneyPreference, rememberJourneyPreference } from './journey';
export function useJourneySelection(profileId: string, viewerId: string | null | undefined, remember = true) {
  const key = journeyPreferenceKey(viewerId, profileId);
  const initialView = () => remember ? readJourneyPreference(key) : 'portfolio' as const;
  const [selection, setSelection] = useState(() => ({ key, view: initialView() }));
  useEffect(() => { setSelection({ key, view: remember ? readJourneyPreference(key) : 'portfolio' }); }, [key, remember]);
  return { view: selection.key === key ? selection.view : initialView(), select(view: 'portfolio' | 'journey') {
    setSelection({ key, view }); if (remember) rememberJourneyPreference(key, view);
  } };
}
