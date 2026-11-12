import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

function preparationFixture() {
  const calls = [];
  let cleanup;
  const preparation = sourceModule('src/components/profile/usePrepareProfileAudio.ts', {
    react: {
      useEffect(effect) {
        cleanup?.();
        cleanup = effect();
      },
    },
    '../../services/supabase/profileAudioService': {
      readProfileAudio(profileId, signal) {
        let complete, fail;
        const result = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
        calls.push({ profileId, signal, complete, fail });
        return result;
      },
    },
    './ProfileAudioSlot': { default: () => null },
  }, { AbortController });

  return {
    ...preparation,
    calls,
    leaveRoute() {
      cleanup?.();
      cleanup = undefined;
    },
  };
}

test('early profile preparation and the mounted control share one pending result', async () => {
  const fixture = preparationFixture();
  fixture.usePrepareProfileAudio('creator', 'viewer');
  const control = fixture.acquireProfileAudio('creator', 'viewer');
  assert.equal(fixture.calls.length, 1);

  fixture.leaveRoute();
  assert.equal(fixture.calls[0].signal.aborted, false, 'The mounted control still needs the shared lookup');
  const prepared = { track: { audioUrl: 'https://media.test/creator.m4a' } };
  fixture.calls[0].complete(prepared);
  assert.equal(await control.result, prepared);

  control.release();
  assert.equal(fixture.calls[0].signal.aborted, true);
});

test('preparation does not reuse signed audio across a different profile or viewer', async () => {
  const fixture = preparationFixture();
  const guest = fixture.acquireProfileAudio('creator', null);
  const signedIn = fixture.acquireProfileAudio('creator', 'viewer');
  const secondProfile = fixture.acquireProfileAudio('second-creator', 'viewer');
  assert.deepEqual(fixture.calls.map(call => call.profileId), ['creator', 'creator', 'second-creator']);

  const results = [
    { track: { audioUrl: 'https://media.test/guest.m4a' } },
    { track: { audioUrl: 'https://media.test/viewer.m4a' } },
    { track: { audioUrl: 'https://media.test/second.m4a' } },
  ];
  fixture.calls.forEach((call, index) => call.complete(results[index]));
  const observed = await Promise.all([guest.result, signedIn.result, secondProfile.result]);
  assert.deepEqual(observed, results);
  guest.release();
  assert.equal(fixture.calls[1].signal.aborted, false);
  signedIn.release();
  secondProfile.release();
});

test('leaving the last subscriber aborts the lookup and a late result cannot serve the next visit', async () => {
  const fixture = preparationFixture();
  const previous = fixture.acquireProfileAudio('creator', null);
  previous.release();
  assert.equal(fixture.calls[0].signal.aborted, true);

  const current = fixture.acquireProfileAudio('creator', null);
  assert.equal(fixture.calls.length, 2);
  const stale = { track: { audioUrl: 'https://media.test/stale.m4a' } };
  const fresh = { track: { audioUrl: 'https://media.test/current.m4a' } };
  // A signing response can finish even after its caller stops waiting.
  fixture.calls[0].complete(stale);
  assert.equal(await previous.result, stale);
  fixture.calls[1].complete(fresh);
  assert.equal(await current.result, fresh);
  assert.equal(fixture.calls[1].signal.aborted, false);
  current.release();
});

test('owner changes invalidate the held result without letting old cleanup evict its replacement', async () => {
  const fixture = preparationFixture();
  const previous = fixture.acquireProfileAudio('creator', 'owner');
  fixture.calls[0].complete({ track: { audioUrl: 'https://media.test/old.m4a' } });
  await previous.result;
  fixture.invalidatePreparedProfileAudio('creator', 'owner');

  const current = fixture.acquireProfileAudio('creator', 'owner');
  assert.equal(fixture.calls.length, 2);
  previous.release();
  const control = fixture.acquireProfileAudio('creator', 'owner');
  assert.equal(control.result, current.result);
  assert.equal(fixture.calls.length, 2);
  const replacement = { track: { audioUrl: 'https://media.test/replacement.m4a' } };
  fixture.calls[1].complete(replacement);
  assert.equal(await control.result, replacement);
  current.release();
  control.release();
});

test('failed preparation and missing audio signatures both allow the mounted player to retry', async () => {
  const fixture = preparationFixture();
  const failedRead = fixture.acquireProfileAudio('creator', 'viewer');
  fixture.calls[0].fail(new Error('Temporary network failure'));
  await assert.rejects(failedRead.result, /Temporary network failure/);

  const missingSignature = fixture.acquireProfileAudio('creator', 'viewer');
  fixture.calls[1].complete({ track: { enabled: true, audioUrl: '' } });
  await missingSignature.result;

  const player = fixture.acquireProfileAudio('creator', 'viewer');
  const signed = { track: { enabled: true, audioUrl: 'https://media.test/track.m4a' } };
  fixture.calls[2].complete(signed);
  assert.equal(await player.result, signed);
  failedRead.release();
  missingSignature.release();
  player.release();
});
