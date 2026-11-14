import React, { useEffect, useMemo, useState } from 'react';
import type { ProfileAudioEdit } from '../../features/profile/profileAudio';
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
  const [stored, setStored] = useState<StoredProfileAudio[]>([]);
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

  const tracks = useMemo(() => stored.filter(({ track }) => editable || (track.enabled && track.audioUrl))
    .map(({ row, track }) => ({ track, sourceKey: row.audio_path })), [editable, stored]);
  if (load === 'pending' || (!editable && !tracks.length)) return null;

  async function save(trackId: string | null, input: ProfileAudioEdit) {
    if (load === 'failed') throw new Error('Profile audio could not load. Reopen your profile and try again.');
    const current = stored.find(({ track }) => track.id === trackId);
    if (trackId && !current) throw new Error('This track is no longer in the soundtrack.');
    const next = await saveProfileAudio(profileId, current ?? null, input);
    invalidatePreparedProfileAudio(profileId, accountId);
    setStored(items => current ? items.map(item => item.track.id === trackId ? next : item) : [...items, next]);
  }

  async function remove(trackId: string) {
    const current = stored.find(({ track }) => track.id === trackId);
    if (!current) return;
    await removeProfileAudio(profileId, current);
    invalidatePreparedProfileAudio(profileId, accountId);
    setStored(items => items.filter(({ track }) => track.id !== trackId));
  }

  return <li className="list-none">
    <ProfileAudio tracks={tracks} profileId={profileId} profileName={profileName} profileAvatar={profileAvatar} editable={editable} disabled={!active} sharedCatalogue={sharedCatalogue}
      onSave={editable ? save : undefined} onRemove={editable ? remove : undefined} />
  </li>;
}
