import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const track = { key: 'creator/track', url: 'https://audio.test/track.m4a' };
const otherTrack = { key: 'another-creator/track', url: 'https://audio.test/another-track.m4a' };
const artwork = { avatar: 'https://images.test/creator-avatar.png', title: 'Profile track', artist: 'Creator' };

function createPlayback({ autoplayAllowed = true, adjustableVolume = true, mediaSessionSupported = false } = {}) {
  let canPlay = autoplayAllowed;
  const players = [];
  const attempts = [];
  const mediaSession = mediaSessionSupported ? { metadata: null } : undefined;

  class AudioFixture extends EventTarget {
    paused = true;
    currentTime = 0;
    duration = 180;
    error = null;
    ended = false;
    #volume = 1;

    get volume() { return this.#volume; }
    set volume(next) {
      if (!adjustableVolume || this.#volume === next) return;
      this.#volume = next;
      this.dispatchEvent(new Event('volumechange'));
    }

    constructor() {
      super();
      players.push(this);
    }

    play() {
      attempts.push({ source: this.src, position: this.currentTime });
      if (!canPlay) return Promise.reject(new DOMException('User activation required', 'NotAllowedError'));
      this.paused = false;
      queueMicrotask(() => { if (!this.paused) this.dispatchEvent(new Event('playing')); });
      return Promise.resolve();
    }

    pause() {
      if (this.paused) return;
      this.paused = true;
      queueMicrotask(() => this.dispatchEvent(new Event('pause')));
    }

    removeAttribute(name) {
      if (name === 'src') this.src = '';
    }

    load() {
      this.currentTime = 0;
    }
  }

  class MediaMetadataFixture {
    constructor({ title, artist, artwork: images }) {
      this.title = title;
      this.artist = artist;
      this.artwork = Array.from(images, ({ src }) => ({ src: new URL(src).href }));
    }
  }

  return {
    ...sourceModule('src/features/profile/profileAudioPlayback.ts', {}, {
      Audio: AudioFixture, DOMException, queueMicrotask,
      navigator: { mediaSession }, MediaMetadata: mediaSessionSupported ? MediaMetadataFixture : undefined,
    }),
    attempts,
    players,
    mediaSession,
    get player() { return players.find(player => player.preload === 'metadata'); },
    grantPlayback() { canPlay = true; },
  };
}

test('Now Playing uses the profile avatar and refreshes it without restarting playback', async () => {
  const playback = createPlayback({ mediaSessionSupported: true });
  playback.startProfileAudio(track);
  await setImmediate();
  assert.equal(playback.mediaSession.metadata, null);

  playback.startProfileAudio({ ...track, artwork });
  assert.deepEqual(playback.mediaSession.metadata.artwork, [{ src: artwork.avatar }]);
  assert.equal(playback.mediaSession.metadata.title, artwork.title);
  assert.equal(playback.mediaSession.metadata.artist, artwork.artist);
  const nextArtwork = { ...artwork, avatar: 'https://images.test/updated-avatar.png' };
  playback.startProfileAudio({ ...track, artwork: nextArtwork });
  assert.deepEqual(playback.mediaSession.metadata.artwork, [{ src: nextArtwork.avatar }]);
  assert.equal(playback.attempts.length, 1);

  playback.toggleProfileAudio({ ...track, artwork: nextArtwork });
  assert.deepEqual(playback.mediaSession.metadata.artwork, [{ src: nextArtwork.avatar }]);
  playback.startProfileAudio(otherTrack);
  assert.equal(playback.mediaSession.metadata, null);
});

test('Portalite uses its dedicated Now Playing artwork and other profiles use their own avatars', () => {
  const customArtwork = 'https://portalink.test/assets/portalite-now-playing.png';
  const { profileAudioArtwork } = sourceModule('src/features/profile/profileAudio.ts', {
    './portalite-now-playing.png': customArtwork,
  });

  assert.equal(profileAudioArtwork('49e4e861-795a-47f2-b4a6-b071351c4d4b', artwork.avatar), customArtwork);
  assert.equal(profileAudioArtwork('another-creator', artwork.avatar), artwork.avatar);
  assert.equal(profileAudioArtwork('another-creator'), undefined);
});

test('an eligible first tap publishes Now Playing artwork, which yields to video and clears on profile exit', async () => {
  const playback = createPlayback({ autoplayAllowed: false, mediaSessionSupported: true });
  const source = { ...track, artwork };
  playback.startProfileAudio(source);
  await setImmediate();
  assert.equal(playback.mediaSession.metadata, null);
  assert.equal(playback.getProfileAudioSnapshot().needsGesture, true);

  playback.grantPlayback();
  playback.retryProfileAudioOnGesture(source);
  assert.deepEqual(playback.mediaSession.metadata.artwork, [{ src: artwork.avatar }]);
  await setImmediate();

  const leaveVideo = playback.suspendProfileAudioForVideo();
  assert.equal(playback.mediaSession.metadata, null);
  const updatedArtwork = { ...artwork, avatar: 'https://images.test/avatar-during-video.png' };
  playback.startProfileAudio({ ...source, artwork: updatedArtwork });
  assert.equal(playback.mediaSession.metadata, null);
  leaveVideo();
  await setImmediate();
  assert.deepEqual(playback.mediaSession.metadata.artwork, [{ src: updatedArtwork.avatar }]);
  assert.equal(playback.getProfileAudioSnapshot().playing, true);

  playback.clearProfileAudioForProfile('creator');
  assert.equal(playback.mediaSession.metadata, null);
});

test('unavailable Media Session and invalid artwork still allow playback', async () => {
  const unsupported = createPlayback();
  const invalid = createPlayback({ mediaSessionSupported: true });
  unsupported.startProfileAudio({ ...track, artwork });
  invalid.startProfileAudio({ ...track, artwork: { ...artwork, avatar: 'https://[' } });
  await setImmediate();
  assert.equal(unsupported.getProfileAudioSnapshot().playing, true);
  assert.equal(invalid.getProfileAudioSnapshot().playing, true);
  assert.equal(invalid.mediaSession.metadata, null);
});

test('volume support probes a separate source-free element without changing active playback', async () => {
  const playback = createPlayback();
  playback.startProfileAudio(track);
  await setImmediate();
  assert.equal(playback.supportsProfileAudioVolume(), true);
  assert.equal(playback.supportsProfileAudioVolume(), true);
  const probe = playback.players.find(player => player !== playback.player);
  assert.equal(playback.players.length, 2);
  assert.equal(probe.src, undefined);
  assert.equal(playback.player.volume, 1);
  assert.equal(playback.getProfileAudioSnapshot().playing, true);
  assert.equal(playback.attempts.length, 1);
});

test('volume is observable before playback and persists through playback interruptions', async () => {
  const playback = createPlayback();
  const reported = [];
  playback.subscribeProfileAudio(() => reported.push(playback.getProfileAudioSnapshot().volume));
  playback.setProfileAudioVolume(0.3);
  assert.deepEqual(reported, [0.3]);
  assert.equal(playback.attempts.length, 0);
  playback.startProfileAudio(track);
  await setImmediate();

  const leaveVideo = playback.suspendProfileAudioForVideo();
  playback.setProfileAudioVolume(0.6);
  leaveVideo();
  await setImmediate();
  assert.equal(playback.getProfileAudioSnapshot().playing, true);
  assert.equal(playback.getProfileAudioSnapshot().volume, 0.6);
  assert.equal(playback.player.volume, 0.6);
  assert.equal(playback.attempts.length, 2);

  playback.player.volume = 0.5;
  assert.equal(reported.at(-1), 0.5);
  playback.clearProfileAudio();
  assert.equal(playback.getProfileAudioSnapshot().volume, 0.5);
});

test('readback detects hardware-only volume and a setter cannot create a playback element', () => {
  const playback = createPlayback({ adjustableVolume: false });
  assert.equal(playback.supportsProfileAudioVolume(), false);
  playback.setProfileAudioVolume(0.2);
  assert.equal(playback.players.length, 1);
  assert.equal(playback.getProfileAudioSnapshot().volume, 1);
  assert.equal(playback.player, undefined);
  assert.equal(playback.attempts.length, 0);
});

test('profile entry starts audible playback once when autoplay is allowed', async () => {
  const playback = createPlayback();
  playback.startProfileAudio(track);
  await setImmediate();
  assert.equal(playback.getProfileAudioSnapshot().playing, true);
  assert.equal(playback.getProfileAudioSnapshot().needsGesture, false);

  playback.player.currentTime = 41;
  playback.player.dispatchEvent(new Event('timeupdate'));
  playback.startProfileAudio(track);
  await setImmediate();
  assert.deepEqual(playback.attempts, [{ source: track.url, position: 0 }]);
  assert.equal(playback.getProfileAudioSnapshot().position, 41);
});

test('browser policy denial retries the current track from an eligible gesture', async () => {
  const playback = createPlayback({ autoplayAllowed: false });
  playback.startProfileAudio(track);
  await setImmediate();
  assert.equal(playback.getProfileAudioSnapshot().needsGesture, true);
  assert.equal(playback.getProfileAudioSnapshot().playing, false);

  playback.grantPlayback();
  playback.retryProfileAudioOnGesture(otherTrack);
  playback.startProfileAudio(track);
  await setImmediate();
  assert.equal(playback.attempts.length, 1, 'A stale gesture or repeated render must not retry autoplay');

  playback.retryProfileAudioOnGesture(track);
  await setImmediate();
  assert.deepEqual(playback.attempts.map(attempt => attempt.source), [track.url, track.url]);
  assert.equal(playback.getProfileAudioSnapshot().playing, true);
  assert.equal(playback.getProfileAudioSnapshot().needsGesture, false);
});

test('manual Pause survives profile re-entry, gestures and a video round trip', async () => {
  const playback = createPlayback();
  playback.startProfileAudio(track);
  await setImmediate();
  playback.toggleProfileAudio(track);
  await setImmediate();
  assert.equal(playback.getProfileAudioSnapshot().wantsPlayback, false);
  assert.equal(playback.getProfileAudioSnapshot().needsGesture, false);

  playback.startProfileAudio(track);
  playback.retryProfileAudioOnGesture(track);
  playback.suspendProfileAudioForVideo()();
  await setImmediate();
  assert.equal(playback.player.paused, true);
  assert.equal(playback.attempts.length, 1);
});

test('video holds defer entry playback until the final video closes', async () => {
  const playback = createPlayback();
  const leaveFirstVideo = playback.suspendProfileAudioForVideo();
  const leaveSecondVideo = playback.suspendProfileAudioForVideo();
  playback.startProfileAudio(track);
  playback.retryProfileAudioOnGesture(track);
  await setImmediate();
  assert.equal(playback.player.paused, true);
  assert.equal(playback.attempts.length, 0);

  leaveFirstVideo();
  await setImmediate();
  assert.equal(playback.attempts.length, 0);
  leaveSecondVideo();
  await setImmediate();
  assert.equal(playback.attempts.length, 1);
  assert.equal(playback.getProfileAudioSnapshot().playing, true);
});

test('a gesture during a video hold cannot retry blocked autoplay', async () => {
  const playback = createPlayback({ autoplayAllowed: false });
  playback.startProfileAudio(track);
  await setImmediate();
  const leaveVideo = playback.suspendProfileAudioForVideo();

  playback.grantPlayback();
  playback.retryProfileAudioOnGesture(track);
  await setImmediate();
  assert.equal(playback.attempts.length, 1);
  assert.equal(playback.player.paused, true);

  leaveVideo();
  await setImmediate();
  assert.equal(playback.getProfileAudioSnapshot().needsGesture, true);
  assert.equal(playback.attempts.length, 1, 'Ending a hold must not spend a gesture denied during the hold');

  playback.retryProfileAudioOnGesture(track);
  await setImmediate();
  assert.equal(playback.attempts.length, 2);
  assert.equal(playback.getProfileAudioSnapshot().playing, true);
});

test('manual Pause while a video holds playback cancels the scheduled resume', async () => {
  const playback = createPlayback();
  playback.startProfileAudio(track);
  await setImmediate();
  const leaveVideo = playback.suspendProfileAudioForVideo();
  playback.toggleProfileAudio(track);
  leaveVideo();
  await setImmediate();

  assert.equal(playback.getProfileAudioSnapshot().wantsPlayback, false);
  assert.equal(playback.player.paused, true);
  assert.equal(playback.attempts.length, 1);
});

test('leaving a platform profile clears only that creator and prevents a pending video resume', async () => {
  const playback = createPlayback();
  playback.startProfileAudio(track);
  await setImmediate();
  playback.clearProfileAudioForProfile('another-creator');
  assert.equal(playback.getProfileAudioSnapshot().playing, true);

  const leaveVideo = playback.suspendProfileAudioForVideo();
  playback.clearProfileAudioForProfile('creator');
  leaveVideo();
  await setImmediate();
  assert.equal(playback.getProfileAudioSnapshot().key, null);
  assert.equal(playback.player.src, '');
  assert.equal(playback.player.paused, true);
  assert.equal(playback.attempts.length, 1);
});
