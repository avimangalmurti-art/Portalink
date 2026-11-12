type AudioSource = { key: string; url: string };

type ProfileAudioSnapshot = {
  key: string | null;
  playing: boolean;
  wantsPlayback: boolean;
  needsGesture: boolean;
  videoOpen: boolean;
  position: number;
  duration: number;
  error: string | null;
};

const empty: ProfileAudioSnapshot = {
  key: null, playing: false, wantsPlayback: false, needsGesture: false, videoOpen: false, position: 0, duration: 0, error: null,
};
let snapshot = empty;
let audio: HTMLAudioElement | null = null;
let request = 0;
let starting = false;
let openVideos = 0;
let playbackAccount: string | null | undefined;
const listeners = new Set<() => void>();

export function subscribeProfileAudio(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getProfileAudioSnapshot() {
  return snapshot;
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
  update({ playing: false, wantsPlayback: false, needsGesture, error: message });
}

function getAudio() {
  if (audio) return audio;
  // One native element for the browsing session, independent of profile routes
  // and dialog lifecycles. Keep the element that received the listener's tap.
  const player = new Audio();
  player.preload = 'none';
  const readTime = () => {
    if (!snapshot.key) return;
    update({ position: player.currentTime, duration: Number.isFinite(player.duration) ? player.duration : 0 });
  };
  player.addEventListener('loadedmetadata', readTime);
  player.addEventListener('durationchange', readTime);
  player.addEventListener('timeupdate', readTime);
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
    if (player.ended) update({ playing: false, wantsPlayback: false });
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
  void audio.play().then(() => {
    if (pending === request) starting = false;
  }).catch((error: unknown) => {
    if (pending !== request) return;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      playError('Tap Play audio to resume.', true);
    } else playError('This audio couldn’t play. Try again.');
  });
}

export function startProfileAudio({ key, url }: AudioSource) {
  if (snapshot.key === key) return;
  const player = getAudio();
  pauseAudio();
  player.src = url;
  update({ key, wantsPlayback: true, needsGesture: false, position: 0, duration: 0, error: null });
  playAudio();
}

export function retryProfileAudioOnGesture(source: AudioSource) {
  if (snapshot.key === source.key && snapshot.needsGesture && !snapshot.videoOpen) {
    toggleProfileAudio(source);
  }
}

export function toggleProfileAudio(source: AudioSource) {
  if (snapshot.key !== source.key) {
    startProfileAudio(source);
    return;
  }
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

export function clearProfileAudio(key?: string) {
  if (!snapshot.key || (key && key !== snapshot.key)) return;
  pauseAudio();
  audio?.removeAttribute('src');
  audio?.load();
  update({ ...empty, videoOpen: snapshot.videoOpen });
}

export function setProfileAudioAccount(accountId: string | null) {
  if (playbackAccount !== undefined && playbackAccount !== accountId) clearProfileAudio();
  playbackAccount = accountId;
}

export function suspendProfileAudioForVideo() {
  openVideos++;
  if (openVideos === 1) {
    pauseAudio();
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
