type NowPlayingMetadata = { avatar?: string; title: string; artist: string };
export type ProfileAudioSource = { key: string; url: string; artwork?: NowPlayingMetadata };
type AudioOutputDevices = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };
type AppleAudioElement = HTMLAudioElement & { webkitShowPlaybackTargetPicker?: () => void };

type ProfileAudioSnapshot = {
  key: string | null;
  playing: boolean;
  wantsPlayback: boolean;
  needsGesture: boolean;
  videoOpen: boolean;
  position: number;
  duration: number;
  volume: number;
  error: string | null;
};

const empty: ProfileAudioSnapshot = {
  key: null, playing: false, wantsPlayback: false, needsGesture: false, videoOpen: false, position: 0, duration: 0, volume: 1, error: null,
};
let snapshot = empty;
let audio: HTMLAudioElement | null = null;
let volumeSupported: boolean | undefined;
let request = 0;
let starting = false;
let openVideos = 0;
let playbackAccount: string | null | undefined;
let artwork: NowPlayingMetadata | undefined;
let publishedMetadata: MediaMetadata | null = null;
let queue: { profileId: string; sources: readonly ProfileAudioSource[] } | null = null;
const listeners = new Set<() => void>();

export function subscribeProfileAudio(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getProfileAudioSnapshot() {
  return snapshot;
}

export function supportsProfileAudioVolume() {
  if (volumeSupported !== undefined) return volumeSupported;
  if (typeof Audio === 'undefined') return false;
  try {
    // Some browsers keep volume at 1 even when the property is writable.
    // Probe a separate, source-free element so playback volume never changes.
    const probe = new Audio();
    probe.volume = 0.5;
    volumeSupported = probe.volume === 0.5;
  } catch {
    volumeSupported = false;
  }
  return volumeSupported;
}

export function supportsProfileAudioOutput() {
  if (typeof Audio === 'undefined' || typeof navigator === 'undefined') return false;
  const player = Audio.prototype as AppleAudioElement;
  const devices = navigator.mediaDevices as AudioOutputDevices | undefined;
  return typeof player.webkitShowPlaybackTargetPicker === 'function'
    || (typeof devices?.selectAudioOutput === 'function' && typeof player.setSinkId === 'function');
}

export async function chooseProfileAudioOutput() {
  if (!supportsProfileAudioOutput()) return;
  const player = getAudio() as AppleAudioElement;
  const devices = navigator.mediaDevices as AudioOutputDevices | undefined;
  if (!devices?.selectAudioOutput || !player.setSinkId) {
    player.webkitShowPlaybackTargetPicker?.();
    return;
  }
  const profileId = queue?.profileId;
  const accountId = playbackAccount;
  try {
    const { deviceId } = await devices.selectAudioOutput();
    if (profileId === queue?.profileId && accountId === playbackAccount) await player.setSinkId(deviceId);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') throw error;
  }
}

function update(changes: Partial<ProfileAudioSnapshot>) {
  if (Object.keys(changes).every(key => {
    const field = key as keyof ProfileAudioSnapshot;
    return changes[field] === snapshot[field];
  })) return;
  snapshot = { ...snapshot, ...changes };
  listeners.forEach(listener => listener());
}

function playError(message: string, needsGesture = false) {
  starting = false;
  clearNowPlayingArtwork();
  update({ playing: false, wantsPlayback: false, needsGesture, error: message });
}

function clearNowPlayingArtwork() {
  if (!publishedMetadata) return;
  const session = navigator.mediaSession;
  if (session?.metadata === publishedMetadata) session.metadata = null;
  publishedMetadata = null;
}

function publishNowPlayingArtwork() {
  if (typeof navigator === 'undefined' || typeof MediaMetadata === 'undefined') return;
  const session = navigator.mediaSession;
  if (!session) return;
  if (!artwork) {
    clearNowPlayingArtwork();
    return;
  }
  try {
    const { title, artist, avatar } = artwork;
    const metadata = new MediaMetadata({ title, artist, artwork: avatar ? [{ src: avatar }] : [] });
    session.metadata = metadata;
    publishedMetadata = metadata;
  } catch {
    // Invalid or unsupported artwork should never prevent audio playback.
    clearNowPlayingArtwork();
  }
}

function getAudio() {
  if (audio) return audio;
  // One native element for the browsing session, independent of profile routes
  // and dialog lifecycles. Keep the element that received the listener's tap.
  const player = new Audio();
  // If audible autoplay is blocked, let the browser buffer metadata before
  // the first eligible tap rather than starting the media request on that tap.
  player.preload = 'metadata';
  const readTime = () => {
    if (!snapshot.key) return;
    update({ position: player.currentTime, duration: Number.isFinite(player.duration) ? player.duration : 0 });
  };
  player.addEventListener('loadedmetadata', readTime);
  player.addEventListener('durationchange', readTime);
  player.addEventListener('timeupdate', readTime);
  player.addEventListener('volumechange', () => update({ volume: player.volume }));
  player.addEventListener('playing', () => {
    if (player.paused || !snapshot.key || !snapshot.wantsPlayback || openVideos) return;
    update({ playing: true, error: null });
  });
  player.addEventListener('waiting', () => update({ playing: false }));
  player.addEventListener('pause', () => {
    if (!player.paused) return;
    if (!openVideos && !snapshot.videoOpen && !starting && !player.ended) {
      update({ playing: false, wantsPlayback: false });
    } else update({ playing: false });
  });
  player.addEventListener('ended', () => {
    if (!player.ended) return;
    const next = snapshot.wantsPlayback && !snapshot.videoOpen ? adjacentSource(1) : undefined;
    if (next) startProfileAudio(next);
    else update({ playing: false, wantsPlayback: false });
  });
  player.addEventListener('error', () => {
    if (snapshot.key && player.error) playError('This audio couldn’t load. Try playing it again.');
  });
  audio = player;
  return player;
}

function pauseAudio() {
  request++;
  starting = false;
  audio?.pause();
  update({ playing: false });
}

function playAudio() {
  if (!audio || !snapshot.wantsPlayback || snapshot.videoOpen) return;
  const pending = ++request;
  starting = true;
  publishNowPlayingArtwork();
  void audio.play().then(() => {
    if (pending === request) starting = false;
  }).catch((error: unknown) => {
    if (pending !== request) return;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      playError('Tap Play audio to resume.', true);
    } else playError('This audio couldn’t play. Try again.');
  });
}

export function startProfileAudio({ key, url, artwork: nextArtwork }: ProfileAudioSource) {
  const artworkChanged = artwork?.avatar !== nextArtwork?.avatar
    || artwork?.title !== nextArtwork?.title
    || artwork?.artist !== nextArtwork?.artist;
  if (snapshot.key === key) {
    artwork = nextArtwork;
    if (artworkChanged && !snapshot.videoOpen && (snapshot.wantsPlayback || publishedMetadata)) publishNowPlayingArtwork();
    return;
  }
  loadProfileAudio({ key, url, artwork: nextArtwork }, true);
}

function loadProfileAudio(source: ProfileAudioSource, wantsPlayback: boolean, needsGesture = false) {
  const player = getAudio();
  pauseAudio();
  clearNowPlayingArtwork();
  artwork = source.artwork;
  player.src = source.url;
  update({ key: source.key, wantsPlayback, needsGesture, position: 0, duration: 0, error: null });
  playAudio();
}

/** Refresh the active profile's tracks without resetting the current track or manual pause. */
export function setProfileAudioQueue(profileId: string, sources: readonly ProfileAudioSource[], autoplay: boolean) {
  const previous = queue;
  const key = snapshot.key;
  queue = { profileId, sources };
  const current = sources.find(source => source.key === key);
  if (current) {
    startProfileAudio(current);
    return;
  }
  const oldIndex = previous?.sources.findIndex(source => source.key === key) ?? -1;
  const sameProfile = previous?.profileId === profileId;
  if (key && (key.startsWith(`${profileId}/`) || (sameProfile && oldIndex >= 0))) {
    const replacement = sources[Math.min(Math.max(oldIndex, 0), sources.length - 1)];
    if (replacement) loadProfileAudio(replacement, snapshot.wantsPlayback, snapshot.needsGesture);
    else resetProfileAudio();
    return;
  }
  if (!sameProfile && oldIndex >= 0) resetProfileAudio();
  if (autoplay && sources.length) startProfileAudio(sources[0]);
}

function adjacentSource(direction: -1 | 1) {
  if (!queue) return undefined;
  const current = queue.sources.findIndex(source => source.key === snapshot.key);
  if (snapshot.key && current < 0) return undefined;
  return queue.sources[Math.max(0, current) + direction];
}

export function skipProfileAudioTrack(profileId: string, direction: -1 | 1) {
  if (queue?.profileId !== profileId) return;
  const source = adjacentSource(direction);
  if (source) loadProfileAudio(source, !snapshot.key || snapshot.wantsPlayback || snapshot.needsGesture);
}

export function selectProfileAudioTrack(profileId: string, key: string) {
  if (queue?.profileId !== profileId) return;
  const source = queue.sources.find(track => track.key === key);
  if (!source) return;
  if (snapshot.key !== key) startProfileAudio(source);
  else if (!snapshot.wantsPlayback) toggleProfileAudio(source);
}

export function retryProfileAudioOnGesture(source: ProfileAudioSource) {
  if (snapshot.key === source.key && snapshot.needsGesture && !snapshot.videoOpen) {
    toggleProfileAudio(source);
  }
}

export function toggleProfileAudio(source: ProfileAudioSource) {
  if (snapshot.key !== source.key) {
    startProfileAudio(source);
    return;
  }
  artwork = source.artwork;
  if (snapshot.wantsPlayback) {
    update({ wantsPlayback: false });
    pauseAudio();
    return;
  }
  if (audio?.error || (snapshot.error && audio?.src !== source.url)) {
    // A reopened profile may have received a fresh signed URL.
    const position = snapshot.position;
    if (audio) {
      if (audio.src !== source.url) audio.src = source.url;
      else audio.load();
      audio.currentTime = position;
    }
  }
  update({ wantsPlayback: true, needsGesture: false, error: null });
  playAudio();
}

export function seekProfileAudio(key: string, seconds: number) {
  if (!audio || key !== snapshot.key || !snapshot.duration || !Number.isFinite(seconds)) return;
  const position = Math.max(0, Math.min(seconds, snapshot.duration));
  audio.currentTime = position;
  update({ position });
}

export function setProfileAudioVolume(volume: number) {
  if (!Number.isFinite(volume) || !supportsProfileAudioVolume()) return;
  const player = getAudio();
  player.volume = Math.max(0, Math.min(volume, 1));
  update({ volume: player.volume });
}

export function clearProfileAudio(key?: string) {
  if (key && key !== snapshot.key) return;
  queue = null;
  resetProfileAudio();
}

function resetProfileAudio() {
  if (!snapshot.key) return;
  pauseAudio();
  clearNowPlayingArtwork();
  artwork = undefined;
  audio?.removeAttribute('src');
  audio?.load();
  update({ ...empty, videoOpen: snapshot.videoOpen, volume: snapshot.volume });
}

export function clearProfileAudioForProfile(profileId: string) {
  const ownsQueue = queue?.profileId === profileId;
  const ownsPlayback = snapshot.key?.startsWith(`${profileId}/`) || (ownsQueue
    && queue?.sources.some(source => source.key === snapshot.key));
  if (ownsQueue) queue = null;
  if (ownsPlayback) resetProfileAudio();
}

export function setProfileAudioAccount(accountId: string | null) {
  if (playbackAccount !== undefined && playbackAccount !== accountId) clearProfileAudio();
  playbackAccount = accountId;
}

export function suspendProfileAudioForVideo() {
  openVideos++;
  if (openVideos === 1) {
    pauseAudio();
    clearNowPlayingArtwork();
    update({ videoOpen: true });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--openVideos) return;
    // A route can close one video and mount another in the same commit.
    queueMicrotask(() => {
      if (openVideos || !snapshot.videoOpen) return;
      update({ videoOpen: false });
      playAudio();
    });
  };
}
