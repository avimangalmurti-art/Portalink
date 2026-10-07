import { useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import type { SheetTextEditor } from '../../components/media/MobileProjectDescriptionSheet';

/** Bio owns only headline; other profile edits must never be overwritten here. */
export function useProfileBioEditor(profileId: string, canEdit: boolean): SheetTextEditor {
  const { profiles } = useServices();
  const { invalidateProfiles } = useProfileData();
  const [phase, setPhase] = useState('idle');
  const [value, setValue] = useState('');
  const [original, setOriginal] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    generation.current++;
    saving.current = false;
    setPhase('idle');
    setOriginal(undefined);
    setValue('');
    setError(null);
    // Invalidate the latest async request, rather than a captured DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; };
  }, [profileId, canEdit]);

  const open = async () => {
    if (!canEdit || saving.current) return;
    const request = ++generation.current;
    setPhase('loading');
    setError(null);
    try {
      const profile = await profiles.getProfile(profileId);
      if (generation.current !== request) return;
      setOriginal(profile.headline ?? '');
      setValue(profile.headline ?? '');
      setPhase('editing');
    } catch (caught) {
      if (generation.current !== request) return;
      setError(caught instanceof Error ? caught.message : 'Could not load your bio.');
      setPhase('load-failed');
    }
  };
  const isDirty = phase === 'editing' && value.trim() !== (original ?? '').trim();
  return {
    isEditing: phase !== 'idle', phase, value, error, isDirty,
    isSaving: phase === 'saving',
    savedValue: original,
    open: () => { void open(); },
    retryLoad: () => { void open(); },
    onChange(next) {
      if (!canEdit || saving.current || phase !== 'editing') return;
      setValue(next);
      setError(null);
    },
    async close() {
      if (saving.current) return false;
      generation.current++;
      setValue(original ?? '');
      setError(null);
      setPhase('idle');
      return true;
    },
    async save() {
      if (!canEdit || saving.current || !isDirty) return;
      const headline = value.trim();
      saving.current = true;
      const request = ++generation.current;
      setPhase('saving');
      setError(null);
      try {
        const profile = await profiles.updateProfile(profileId, { headline });
        // Refresh other surfaces even if navigation unmounted this editor.
        invalidateProfiles();
        if (generation.current !== request) return;
        setOriginal(profile.headline ?? '');
        setValue(profile.headline ?? '');
        setPhase('saved');
      } catch (caught) {
        // The write may have succeeded before its confirmation read failed.
        invalidateProfiles();
        if (generation.current !== request) return;
        setError(caught instanceof Error ? caught.message : 'Could not save your bio. Please try again.');
        setPhase('editing');
      } finally {
        if (generation.current === request) saving.current = false;
      }
    },
  };
}
