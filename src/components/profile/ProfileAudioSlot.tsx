import React, { useEffect, useState } from 'react';
import type { ProfileAudioEdit } from '../../features/profile/profileAudio';
import { clearProfileAudio } from '../../features/profile/profileAudioPlayback';
import { removeProfileAudio, saveProfileAudio, type StoredProfileAudio } from '../../services/supabase/profileAudioService';
import { ProfileAudio } from './ProfileAudio';
import { acquireProfileAudio, invalidatePreparedProfileAudio } from './usePrepareProfileAudio';

export default function ProfileAudioSlot({ profileId, accountId, profileName, profileAvatar, editable, active, sharedCatalogue }: {
  profileId: string;
  accountId: string | null;
  profileName: string;
  profileAvatar?: string;
  editable: boolean;
  active: boolean;
  sharedCatalogue: boolean;
}) {
  const [stored, setStored] = useState<StoredProfileAudio | null>(null);
  const [load, setLoad] = useState<'pending' | 'ready' | 'failed'>('pending');
  useEffect(() => {
    if (!active || load !== 'pending') return;
    let current = true;
    const request = acquireProfileAudio(profileId, accountId);
    void request.result.then(result => {
      if (current) {
        setStored(result);
        setLoad('ready');
      }
    }, () => {
      if (current) {
        setLoad('failed');
      }
    });
    return () => {
      current = false;
      request.release();
    };
  }, [active, load, profileId, accountId]);

  if (load === 'pending' || (!editable && (!stored?.track.enabled || !stored.track.audioUrl))) return null;

  async function save(input: ProfileAudioEdit) {
    if (load === 'failed') throw new Error('Profile audio could not load. Reopen your profile and try again.');
    const next = await saveProfileAudio(profileId, stored, input);
    invalidatePreparedProfileAudio(profileId, accountId);
    if (stored && (!next.track.enabled || next.row.audio_path !== stored.row.audio_path)) {
      clearProfileAudio(stored.row.audio_path);
    }
    setStored(next);
  }

  async function remove() {
    if (!stored) return;
    await removeProfileAudio(profileId, stored);
    invalidatePreparedProfileAudio(profileId, accountId);
    clearProfileAudio(stored.row.audio_path);
    setStored(null);
  }

  return <li className="list-none">
    <ProfileAudio track={stored?.track ?? null} sourceKey={stored?.row.audio_path} profileName={profileName} profileAvatar={profileAvatar} editable={editable} disabled={!active} sharedCatalogue={sharedCatalogue}
      onSave={editable ? save : undefined} onRemove={editable ? remove : undefined} />
  </li>;
}
