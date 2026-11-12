import { useEffect } from 'react';
import { readProfileAudio, type StoredProfileAudio } from '../../services/supabase/profileAudioService';

type ProfileAudioRequest = {
  result: Promise<StoredProfileAudio | null>;
  controller: AbortController;
  consumers: number;
  settledAt: number | null;
};

// Keep the request only while the preparing route or its audio control is mounted.
// Each viewer uses their own RLS-backed lookup and signed URL.
const requests = new Map<string, ProfileAudioRequest>();
const PREPARED_RESULT_MS = 30_000;

function requestKey(profileId: string, accountId: string | null) {
  return JSON.stringify([accountId, profileId]);
}

export function invalidatePreparedProfileAudio(profileId: string, accountId: string | null) {
  requests.delete(requestKey(profileId, accountId));
}

export function acquireProfileAudio(profileId: string, accountId: string | null) {
  const key = requestKey(profileId, accountId);
  let request = requests.get(key);
  if (!request || (request.settledAt !== null && Date.now() - request.settledAt >= PREPARED_RESULT_MS)) {
    const controller = new AbortController();
    const pending: ProfileAudioRequest = { result: readProfileAudio(profileId, controller.signal), controller, consumers: 0, settledAt: null };
    requests.set(key, pending);
    const evict = () => {
      if (requests.get(key) === pending) requests.delete(key);
    };
    void pending.result.then(result => {
      pending.settledAt = Date.now();
      if (result?.track.enabled && !result.track.audioUrl) evict();
    }, evict);
    request = pending;
  }
  request.consumers++;
  const held = request;
  return {
    result: held.result,
    release() {
      if (--held.consumers !== 0) return;
      if (requests.get(key) === held) requests.delete(key);
      held.controller.abort();
    },
  };
}

export const loadProfileAudioSlot = () => import('./ProfileAudioSlot');

export function usePrepareProfileAudio(profileId: string | null, accountId: string | null) {
  useEffect(() => {
    if (!profileId) return;
    const request = acquireProfileAudio(profileId, accountId);
    void loadProfileAudioSlot().catch(() => undefined);
    return request.release;
  }, [profileId, accountId]);
}
