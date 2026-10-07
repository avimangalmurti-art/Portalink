import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData, useProfileQuery } from '../../contexts/ProfileDataContext';
import type { PublicAppearance } from '../../types/domain';
import { readAccentColor, readAppearanceMode, readNavSystemGray } from '../../utils/appearancePreferences';
import { createAppearanceWriter, DEFAULT_PUBLIC_APPEARANCE, normalizePublicAppearance } from '../../utils/publicAppearance';

/** Restore account branding first; only legacy, unsaved profiles adopt local settings. */
export function useCreatorAppearance(profileId: string | null, enabled: boolean, initialPalette?: Pick<PublicAppearance, 'accentColor' | 'systemGray'>) {
  const { profiles } = useServices();
  const { invalidateProfiles } = useProfileData();
  const query = useProfileQuery(enabled ? profileId : null);
  const [appearance, setAppearance] = useState<PublicAppearance>(() => normalizePublicAppearance({
    accentColor: readAccentColor('#0A84FF'), systemGray: readNavSystemGray('gray6'), mode: readAppearanceMode('auto'), ...initialPalette,
  }) ?? DEFAULT_PUBLIC_APPEARANCE);
  const [readyProfileId, setReadyProfileId] = useState<string | null>(null);
  const savedKey = useRef('');
  const pendingWrites = useRef(new Map<string, number>());
  const earlyChoices = useRef(new Map<string, Partial<PublicAppearance>>());
  const guestChoice = useRef<Partial<PublicAppearance> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const current = useRef({ profileId, enabled, appearance, readyProfileId });
  current.current = { profileId, enabled, appearance, readyProfileId };
  const write = useMemo(() => createAppearanceWriter(async (id, value) => {
    await profiles.updateProfile(id, { publicAppearance: value });
    // A full response can predate a simultaneous name, privacy or order save.
    // Refetch current data rather than replacing it with that older snapshot.
    invalidateProfiles();
  }), [profiles, invalidateProfiles]);

  useEffect(() => {
    if (!profileId) { setReadyProfileId(null); savedKey.current = ''; setSaving(false); setSaveError(null); return; }
    if (!enabled || readyProfileId === profileId || query.status !== 'ready' || !query.profile) return;
    const saved = normalizePublicAppearance(query.profile.publicAppearance);
    const early = { ...guestChoice.current, ...earlyChoices.current.get(profileId) };
    setAppearance(value => ({ ...(saved ?? value), ...early }));
    guestChoice.current = null;
    earlyChoices.current.delete(profileId);
    savedKey.current = saved ? JSON.stringify([profileId, saved]) : '';
    setSaveError(null);
    setSaving((pendingWrites.current.get(profileId) ?? 0) > 0);
    setReadyProfileId(profileId);
  }, [profileId, enabled, readyProfileId, query.status, query.profile]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const state = current.current;
    if (!state.enabled || !state.profileId) return;
    if (state.readyProfileId !== state.profileId) throw new Error('Your website appearance is still loading. Please try again.');
    const key = JSON.stringify([state.profileId, state.appearance]);
    if (savedKey.current === key && !pendingWrites.current.get(state.profileId)) return;
    pendingWrites.current.set(state.profileId, (pendingWrites.current.get(state.profileId) ?? 0) + 1);
    setSaving(true);
    setSaveError(null);
    try {
      await write(state.profileId, state.appearance);
      if (current.current.profileId === state.profileId) savedKey.current = key;
      if (JSON.stringify([current.current.profileId, current.current.appearance]) === key) setSaveError(null);
    } catch (error) {
      if (JSON.stringify([current.current.profileId, current.current.appearance]) === key) setSaveError('Website colors couldn’t be saved. Try again.');
      throw error;
    } finally {
      const remaining = (pendingWrites.current.get(state.profileId) ?? 1) - 1;
      pendingWrites.current.set(state.profileId, remaining);
      if (current.current.profileId === state.profileId) setSaving(remaining > 0);
    }
  }, [write]);

  useEffect(() => {
    if (enabled && profileId && readyProfileId === profileId) {
      timer.current = setTimeout(() => { void flush().catch(() => undefined); }, 350);
    }
    return () => clearTimeout(timer.current);
  }, [enabled, profileId, readyProfileId, appearance, flush]);

  const choose = useCallback((patch: Partial<PublicAppearance>) => {
    const state = current.current;
    if (!normalizePublicAppearance({ ...state.appearance, ...patch })) return;
    if (!state.profileId) guestChoice.current = { ...guestChoice.current, ...patch };
    if (state.profileId && (!state.enabled || state.readyProfileId !== state.profileId)) {
      earlyChoices.current.set(state.profileId, { ...earlyChoices.current.get(state.profileId), ...patch });
    }
    setAppearance(value => normalizePublicAppearance({ ...value, ...patch }) ?? value);
  }, []);
  return { appearance, choose, flush, saving, saveError, loadError: enabled && profileId ? query.error : null, retryLoad: query.retry };
}
