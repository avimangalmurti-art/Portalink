import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const track = { key: 'creator/track', url: 'https://audio.test/track.m4a' };
const otherTrack = { key: 'another-creator/track', url: 'https://audio.test/another-track.m4a' };

function createPlayback({ autoplayAllowed = true } = {}) {
  let canPlay = autoplayAllowed;
  let player;
  const attempts = [];

  class AudioFixture extends EventTarget {
    paused = true;
    currentTime = 0;
    duration = 180;
    error = null;
    ended = false;

    constructor() {
      super();
      player = this;
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
  }

  return {
    ...sourceModule('src/features/profile/profileAudioPlayback.ts', {}, { Audio: AudioFixture, DOMException, queueMicrotask }),
    attempts,
    get player() { return player; },
    grantPlayback() { canPlay = true; },
  };
}

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
