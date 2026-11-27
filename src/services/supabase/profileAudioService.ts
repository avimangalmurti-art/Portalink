import { profileAudioFileFormat, type ProfileAudioEdit, type ProfileAudioTrack } from '../../features/profile/profileAudio';
import { requireSupabase, requireSupabaseProjectUrl } from './client';

const TABLE = 'profile_audio_tracks';
const BUCKET = 'profile-audio';
const LEGACY_COLUMNS = 'title,artist,description,enabled,audio_path,cover_path,revision';
const COLUMNS = `id,${LEGACY_COLUMNS}`;
const CHUNK_BYTES = 6 * 1024 * 1024;
const SIGNED_SECONDS = 3 * 60 * 60;
const TRACK_PAGE_SIZE = 100;
const SIGNED_PATH_BATCH_SIZE = 100;

type TrackRow = Pick<ProfileAudioTrack, 'title' | 'artist' | 'description' | 'enabled'> & {
  id?: string;
  audio_path: string;
  cover_path: string | null;
  revision: string;
};

export type StoredProfileAudio = { row: TrackRow; track: ProfileAudioTrack };

function missingTrackColumns(error: { code: string; message: string } | null) {
  return error && ['42703', 'PGRST204'].includes(error.code) && /\b(id|created_at)\b/.test(error.message);
}

async function playableTracks(profileId: string, rows: TrackRow[], signal?: AbortSignal): Promise<StoredProfileAudio[]> {
  const paths = [...new Set(rows.flatMap(row => row.cover_path ? [row.audio_path, row.cover_path] : [row.audio_path]))];
  const urls = new Map<string, string>();
  for (let offset = 0; offset < paths.length; offset += SIGNED_PATH_BATCH_SIZE) {
    signal?.throwIfAborted();
    const { data, error } = await requireSupabase().storage.from(BUCKET)
      .createSignedUrls(paths.slice(offset, offset + SIGNED_PATH_BATCH_SIZE), SIGNED_SECONDS);
    if (error) continue;
    for (const file of data ?? []) {
      if (file.path && file.signedUrl) urls.set(file.path, file.signedUrl);
    }
  }
  signal?.throwIfAborted();
  return rows.map(row => ({
    row,
    track: {
      id: row.id ?? profileId, title: row.title, artist: row.artist, description: row.description, enabled: row.enabled,
      audioUrl: urls.get(row.audio_path) ?? '', coverUrl: row.cover_path ? urls.get(row.cover_path) ?? null : null,
    },
  }));
}

export async function readProfileAudioTracks(profileId: string, signal: AbortSignal): Promise<StoredProfileAudio[]> {
  const client = requireSupabase();
  const rows: TrackRow[] = [];
  for (let offset = 0; ; offset += TRACK_PAGE_SIZE) {
    const page = await client.from(TABLE).select(COLUMNS).eq('profile_id', profileId)
      .order('created_at').order('id').range(offset, offset + TRACK_PAGE_SIZE - 1).abortSignal(signal);
    signal.throwIfAborted();
    // The earlier schema already carried one soundtrack. Keep playback and
    // editing available while source and the additive migration roll out.
    if (offset === 0 && missingTrackColumns(page.error)) {
      const legacy = await client.from(TABLE).select(LEGACY_COLUMNS).eq('profile_id', profileId).abortSignal(signal).maybeSingle();
      signal.throwIfAborted();
      if (legacy.error) throw legacy.error;
      return playableTracks(profileId, legacy.data ? [legacy.data] : [], signal);
    }
    if (page.error) throw page.error;
    rows.push(...page.data);
    if (page.data.length < TRACK_PAGE_SIZE) break;
  }
  return playableTracks(profileId, rows, signal);
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
  const write = (columns: typeof COLUMNS | typeof LEGACY_COLUMNS) => {
    if (!current) return client.from(TABLE).insert({ ...row, profile_id: profileId }).select(columns).single().overrideTypes<TrackRow, { merge: false }>();
    const query = client.from(TABLE).update(row).eq('profile_id', profileId).eq('revision', current.row.revision);
    return (current.row.id ? query.eq('id', current.row.id) : query).select(columns).maybeSingle().overrideTypes<TrackRow | null, { merge: false }>();
  };
  let storedRow: TrackRow;
  try {
    if (audio && audioFormat && newAudio) await uploadTrack(newAudio, audio, audioFormat.contentType);
    if (cover && coverFormat && newCover) {
      const { error } = await client.storage.from(BUCKET).upload(newCover, cover, { contentType: coverFormat.contentType, upsert: false });
      if (error) throw new Error('The cover image could not be uploaded. Try saving again.');
    }
    let result = await write(COLUMNS);
    if (!current?.row.id && missingTrackColumns(result.error)) {
      result = await write(LEGACY_COLUMNS);
      if (!current && result.error?.code === '23505') {
        throw new Error('Adding another track is not available yet. Your current soundtrack is still saved.');
      }
    }
    if (result.error?.code === '23505') {
      throw new Error('This track changed elsewhere. Reopen your profile before saving again.');
    }
    if (result.error) throw new Error('Profile audio could not be saved. Try again.');
    if (!result.data) throw new Error('This track changed elsewhere. Reopen your profile before saving again.');
    storedRow = result.data;
  } catch (error) {
    await removeFiles([newAudio, newCover]);
    throw error;
  }
  await removeFiles([
    current?.row.audio_path !== audioPath ? current?.row.audio_path : null,
    current?.row.cover_path !== coverPath ? current?.row.cover_path : null,
  ]);
  return (await playableTracks(profileId, [storedRow]))[0];
}

export async function removeProfileAudio(profileId: string, current: StoredProfileAudio): Promise<void> {
  const query = requireSupabase().from(TABLE).delete().eq('profile_id', profileId).eq('revision', current.row.revision);
  const { data, error } = await (current.row.id ? query.eq('id', current.row.id) : query).select('revision').maybeSingle();
  if (error || !data) throw new Error('This track could not be removed. Reopen your profile and try again.');
  await removeFiles([current.row.audio_path, current.row.cover_path]);
}
