import portaliteNowPlaying from './portalite-now-playing.png';

const PORTALITE_PROFILE_ID = '49e4e861-795a-47f2-b4a6-b071351c4d4b';

const AUDIO_FORMATS = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  weba: 'audio/webm',
  flac: 'audio/flac',
};

const COVER_FORMATS = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const PROFILE_AUDIO_ACCEPT = Object.keys(AUDIO_FORMATS).map(extension => `.${extension}`).join(',');
export const PROFILE_AUDIO_COVER_ACCEPT = Object.keys(COVER_FORMATS).map(extension => `.${extension}`).join(',');
export const PROFILE_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const PROFILE_AUDIO_COVER_MAX_BYTES = 5 * 1024 * 1024;

type ProfileAudioDetails = {
  title: string;
  artist: string;
  description: string;
  enabled: boolean;
};

export type ProfileAudioTrack = ProfileAudioDetails & {
  audioUrl: string;
  coverUrl: string | null;
};

export type ProfileAudioEdit = ProfileAudioDetails & {
  audioFile?: File;
  coverFile?: File | null;
};

export function profileAudioArtwork(profileId: string, profileAvatar?: string) {
  return profileId === PORTALITE_PROFILE_ID ? portaliteNowPlaying : profileAvatar;
}

export function profileAudioFileFormat(file: File, kind: 'audio' | 'cover') {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const formats: Record<string, string> = kind === 'audio' ? AUDIO_FORMATS : COVER_FORMATS;
  if (!Object.keys(formats).includes(extension) || !file.size) {
    throw new Error(kind === 'audio' ? 'Choose a supported audio file, such as MP3, M4A or WAV.' : 'Choose a JPEG, PNG or WebP image.');
  }
  if (file.size > (kind === 'audio' ? PROFILE_AUDIO_MAX_BYTES : PROFILE_AUDIO_COVER_MAX_BYTES)) {
    throw new Error(kind === 'audio' ? 'Choose an audio file under 50 MB. For a large WAV, export an MP3 or M4A first.' : 'Choose cover art under 5 MB.');
  }
  return { extension, contentType: formats[extension] };
}
