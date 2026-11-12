import React, { useEffect, useState } from 'react';
import type { ProfileAudioEdit } from '../../features/profile/profileAudio';
import { clearProfileAudio } from '../../features/profile/profileAudioPlayback';
import { readProfileAudio, removeProfileAudio, saveProfileAudio, type StoredProfileAudio } from '../../services/supabase/profileAudioService';
import { ProfileAudio } from './ProfileAudio';

export default function ProfileAudioSlot({ profileId, profileName, editable, active }: {
  profileId: string;
  profileName: string;
  editable: boolean;
  active: boolean;
}) {
  const [stored, setStored] = useState<StoredProfileAudio | null>(null);
  const [load, setLoad] = useState<'pending' | 'ready' | 'failed'>('pending');
  useEffect(() => {
    if (!active || load !== 'pending') return;
    const controller = new AbortController();
    readProfileAudio(profileId, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setStored(result);
        setLoad('ready');
      }
    }, () => {
      if (!controller.signal.aborted) {
        setLoad('failed');
      }
    });
    return () => controller.abort();
  }, [active, load, profileId]);

  if (load === 'pending' || (!editable && (!stored?.track.enabled || !stored.track.audioUrl))) return null;

  async function save(input: ProfileAudioEdit) {
    if (load === 'failed') throw new Error('Profile audio could not load. Reopen your profile and try again.');
    const next = await saveProfileAudio(profileId, stored, input);
    if (stored && (!next.track.enabled || next.row.audio_path !== stored.row.audio_path)) {
      clearProfileAudio(stored.row.audio_path);
    }
    setStored(next);
  }

  async function remove() {
    if (!stored) return;
    await removeProfileAudio(profileId, stored);
    clearProfileAudio(stored.row.audio_path);
    setStored(null);
  }

  return <li className="list-none">
    <ProfileAudio track={stored?.track ?? null} sourceKey={stored?.row.audio_path} profileName={profileName} editable={editable} disabled={!active}
      onSave={editable ? save : undefined} onRemove={editable ? remove : undefined} />
  </li>;
}
