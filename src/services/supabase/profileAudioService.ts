import { profileAudioFileFormat, type ProfileAudioEdit, type ProfileAudioTrack } from '../../features/profile/profileAudio';
import { requireSupabase, requireSupabaseProjectUrl } from './client';

const TABLE = 'profile_audio_tracks';
const BUCKET = 'profile-audio';
const COLUMNS = 'title,artist,description,enabled,audio_path,cover_path,revision';
const CHUNK_BYTES = 6 * 1024 * 1024;
const SIGNED_SECONDS = 3 * 60 * 60;

type TrackRow = Pick<ProfileAudioTrack, 'title' | 'artist' | 'description' | 'enabled'> & {
  audio_path: string;
  cover_path: string | null;
  revision: string;
};

export type StoredProfileAudio = { row: TrackRow; track: ProfileAudioTrack };

async function playableTrack(row: TrackRow): Promise<StoredProfileAudio> {
  const paths = row.cover_path ? [row.audio_path, row.cover_path] : [row.audio_path];
  const { data, error } = await requireSupabase().storage.from(BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
  const urls = new Map(error ? [] : data?.map(item => [item.path, item.signedUrl]));
  const { title, artist, description, enabled } = row;
  return { row, track: { title, artist, description, enabled, audioUrl: urls.get(row.audio_path) ?? '', coverUrl: urls.get(row.cover_path ?? '') ?? null } };
}

export async function readProfileAudio(profileId: string, signal: AbortSignal): Promise<StoredProfileAudio | null> {
  const { data, error } = await requireSupabase().from(TABLE).select(COLUMNS).eq('profile_id', profileId).abortSignal(signal).maybeSingle();
  if (error) throw error;
  return data ? playableTrack(data) : null;
}

async function uploadTrack(path: string, file: File, contentType: string) {
  const client = requireSupabase();
  const { Upload } = await import('tus-js-client');
  const projectHost = new URL(requireSupabaseProjectUrl()).hostname;
  const projectRef = projectHost.split('.')[0];
  const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      chunkSize: CHUNK_BYTES,
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      retryDelays: [0, 1_000, 3_000, 5_000],
      metadata: { bucketName: BUCKET, objectName: path, contentType, cacheControl: '3600' },
      async onBeforeRequest(request) {
        const { data, error } = await client.auth.getSession();
        if (error || !data.session) throw new Error('Sign in again to upload profile audio.');
        request.setHeader('authorization', `Bearer ${data.session.access_token}`);
      },
      onSuccess: () => resolve(),
      onError: () => reject(new Error('The audio upload could not finish. Try saving again.')),
    });
    upload.start();
  });
}

async function removeFiles(paths: (string | null | undefined)[]) {
  const objects = paths.filter((path): path is string => Boolean(path));
  if (objects.length) {
    // The storage policy protects paths still referenced by a track, including
    // when a save committed but its response was lost.
    await requireSupabase().storage.from(BUCKET).remove(objects).catch(() => undefined);
  }
}

export async function saveProfileAudio(profileId: string, current: StoredProfileAudio | null, input: ProfileAudioEdit): Promise<StoredProfileAudio> {
  const title = input.title.trim();
  const artist = input.artist.trim();
  const description = input.description.trim();
  if (!title || title.length > 120 || artist.length > 120 || description.length > 600) {
    throw new Error('Enter a title and keep the details within the character limits.');
  }
  const audio = input.audioFile;
  const cover = input.coverFile;
  const audioFormat = audio ? profileAudioFileFormat(audio, 'audio') : null;
  const coverFormat = cover ? profileAudioFileFormat(cover, 'cover') : null;
  const revision = crypto.randomUUID();
  const path = `${profileId}/${revision}`;
  const newAudio = audioFormat ? `${path}/audio.${audioFormat.extension}` : null;
  const newCover = coverFormat ? `${path}/cover.${coverFormat.extension}` : null;
  const audioPath = newAudio ?? current?.row.audio_path;
  const coverPath = cover === null ? null : newCover ?? current?.row.cover_path ?? null;
  if (!audioPath) throw new Error('Choose an audio file first.');
  const client = requireSupabase();
  const row: TrackRow = { title, artist, description, enabled: input.enabled, audio_path: audioPath, cover_path: coverPath, revision };
  try {
    if (audio && audioFormat && newAudio) await uploadTrack(newAudio, audio, audioFormat.contentType);
    if (cover && coverFormat && newCover) {
      const { error } = await client.storage.from(BUCKET).upload(newCover, cover, { contentType: coverFormat.contentType, upsert: false });
      if (error) throw new Error('The cover image could not be uploaded. Try saving again.');
    }
    const result = current
      ? await client.from(TABLE).update(row).eq('profile_id', profileId).eq('revision', current.row.revision).select(COLUMNS).maybeSingle()
      : await client.from(TABLE).insert({ ...row, profile_id: profileId }).select(COLUMNS).single();
    if (result.error?.code === '23505' || (!result.error && !result.data)) {
      throw new Error('This track changed elsewhere. Reopen your profile before saving again.');
    }
    if (result.error) throw new Error('Profile audio could not be saved. Try again.');
  } catch (error) {
    await removeFiles([newAudio, newCover]);
    throw error;
  }
  await removeFiles([
    current?.row.audio_path !== audioPath ? current?.row.audio_path : null,
    current?.row.cover_path !== coverPath ? current?.row.cover_path : null,
  ]);
  return playableTrack(row);
}

export async function removeProfileAudio(profileId: string, current: StoredProfileAudio): Promise<void> {
  const { data, error } = await requireSupabase().from(TABLE).delete().eq('profile_id', profileId)
    .eq('revision', current.row.revision).select('profile_id').maybeSingle();
  if (error || !data) throw new Error('This track could not be removed. Reopen your profile and try again.');
  await removeFiles([current.row.audio_path, current.row.cover_path]);
}
