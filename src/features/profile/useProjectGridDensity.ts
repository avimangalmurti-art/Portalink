import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import type { ProfileService } from '../../services/interfaces';
import type { Profile } from '../../types/domain';
import { normalizeProjectGridColumns } from '../../utils/projectGridDensity';

type DensityState = {
  columns: number;
  saving: boolean;
  saveError: string | null;
  pending: number | null;
  localChoice: boolean;
  previewing: boolean;
  listeners: Set<() => void>;
};

function createState(columns: unknown): DensityState {
  return { columns: normalizeProjectGridColumns(columns), saving: false, saveError: null,
    pending: null, localChoice: false, previewing: false, listeners: new Set() };
}

// Preserve outstanding profile writes and separate Home choices across route
// unmounts without racing saves or resetting a device preference.
const ownerStates = new WeakMap<ProfileService, Map<string, DensityState>>();

function ownerState(service: ProfileService, id: string, columns: unknown): DensityState {
  let states = ownerStates.get(service);
  if (!states) { states = new Map(); ownerStates.set(service, states); }
  let state = states.get(id);
  if (!state) { state = createState(columns); states.set(id, state); }
  return state;
}

function notify(state: DensityState) {
  state.listeners.forEach(listener => listener());
}

async function savePending(state: DensityState, service: ProfileService, id: string, invalidateProfiles: () => void) {
  if (state.saving) return;
  state.saving = true;
  notify(state);
  try {
    while (state.pending !== null) {
      const columns = state.pending;
      state.pending = null;
      try {
        // Density is an independent profile field; never resend profile data
        // or project ordering from a possibly stale render.
        if (service.updateProjectGridLayout) await service.updateProjectGridLayout(id, columns);
        else await service.updateProfile(id, { projectGridColumns: columns });
        invalidateProfiles();
        if (state.pending === columns) state.pending = null;
      } catch (error) {
        // A newer committed pinch supersedes a failed earlier write. Otherwise
        // retain the requested layout and expose an explicit retry.
        if (state.pending === null) {
          state.saveError = error instanceof Error && error.message
            ? error.message : 'Your project layout could not be saved. Please try again.';
          break;
        }
      }
    }
  } finally {
    state.saving = false;
    notify(state);
  }
}

/** Profile layout is shared with visitors; Home keeps a separate device preference. */
export function useProjectGridDensity(
  profile: Pick<Profile, 'id' | 'projectGridColumns'> | null,
  canSave: boolean,
  scope: 'profile' | 'home' = 'profile',
) {
  const { profiles } = useServices();
  const { invalidateProfiles } = useProfileData();
  const profileId = profile?.id ?? null;
  const homeKey = `portalink.home-grid-columns:${profileId ?? 'guest'}`;
  const saveProfile = canSave && scope === 'profile';
  const canonicalColumns = normalizeProjectGridColumns(profile?.projectGridColumns);
  const [, render] = useState(0);
  const state = useMemo(() => {
    if (scope === 'home') {
      let value: number | undefined;
      try { const stored = localStorage.getItem(homeKey); if (stored !== null) value = Number(stored); } catch { /* Device preference is optional. */ }
      return ownerState(profiles, `home:${profileId ?? 'guest'}`, value);
    }
    return canSave && profileId
    ? ownerState(profiles, profileId, canonicalColumns)
    : createState(canonicalColumns);
  },
  // Canonical refreshes hydrate below; they must not recreate a visitor pinch
  // or discard an owner write when the profile cache is invalidated.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [profiles, profileId, canSave, scope]);

  useEffect(() => {
    const listener = () => render(revision => revision + 1);
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  }, [state]);

  const { columns, saving, saveError } = state;
  useEffect(() => {
    if (scope === 'home' || state.previewing) return;
    if (state.localChoice) {
      // Ignore old refetches until the service has echoed the latest confirmed
      // owner choice. Visitors' local zoom is never written to the profile.
      if (canSave && !saving && !saveError && canonicalColumns === columns) state.localChoice = false;
      return;
    }
    if (state.columns !== canonicalColumns) {
      state.columns = canonicalColumns;
      notify(state);
    }
  }, [state, canonicalColumns, canSave, columns, saving, saveError, scope]);

  const setColumns = useCallback((value: number) => {
    const next = normalizeProjectGridColumns(value);
    if (state.columns === next && !state.saveError && !state.previewing) return;
    state.previewing = false;
    state.columns = next;
    state.localChoice = true;
    state.saveError = null;
    if (scope === 'home') {
      try { localStorage.setItem(homeKey, String(next)); } catch { /* Keep the in-memory choice. */ }
    }
    if (saveProfile && profileId) state.pending = next;
    notify(state);
    if (saveProfile && profileId) void savePending(state, profiles, profileId, invalidateProfiles);
  }, [state, saveProfile, profileId, profiles, invalidateProfiles, scope, homeKey]);

  const retry = useCallback(() => {
    if (!saveProfile || !profileId || !state.saveError) return;
    state.saveError = null;
    state.pending = state.columns;
    void savePending(state, profiles, profileId, invalidateProfiles);
  }, [state, saveProfile, profileId, profiles, invalidateProfiles]);

  const previewColumns = useCallback((value: number) => {
    const next = normalizeProjectGridColumns(value);
    state.previewing = true;
    state.localChoice = true;
    if (state.columns === next) return;
    state.columns = next;
    notify(state);
  }, [state]);
  return { columns, setColumns, previewColumns, saving, saveError, retry };
}
