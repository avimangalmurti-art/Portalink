import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const profileId = 'profile-id';
const trackRow = (id, revision = `revision-${id}`) => ({
  id,
  title: `Track ${id}`,
  artist: '',
  description: '',
  enabled: true,
  audio_path: `${profileId}/${revision}/audio.mp3`,
  cover_path: `${profileId}/${revision}/cover.jpg`,
  revision,
});

function harness({ reads = [], writes = [] } = {}) {
  const operations = [];
  const signingBatches = [];
  const removed = [];
  const supabase = {
    from: table => {
      assert.equal(table, 'profile_audio_tracks');
      const request = { filters: {}, order: [] };
      const query = {
        select(columns) { request.columns = columns; return query; },
        eq(column, value) { request.filters[column] = value; return query; },
        order(column) { request.order.push(column); return query; },
        range(start, end) { request.range = [start, end]; return query; },
        abortSignal(signal) { request.signal = signal; return query; },
        update(row) { request.update = row; return query; },
        delete() { request.delete = true; return query; },
        maybeSingle() { request.one = true; return query; },
        overrideTypes() { return query; },
        then(resolve) {
          operations.push(request);
          return Promise.resolve(request.update || request.delete ? writes.shift() : reads.shift()).then(resolve);
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'profile-audio');
      return {
        async createSignedUrls(paths) {
          signingBatches.push(Array.from(paths));
          return { data: paths.map(path => ({ path, signedUrl: `https://example.test/${path}` })), error: null };
        },
        async remove(paths) { removed.push(...paths); },
      };
    } },
  };
  const service = sourceModule('src/services/supabase/profileAudioService.ts', {
    '../../features/profile/profileAudio': {},
    './client': { requireSupabase: () => supabase },
  });
  return { service, operations, signingBatches, removed };
}

test('queue reads preserve server order and batches signed URLs once for multiple tracks', async () => {
  const first = trackRow('first');
  const second = trackRow('second');
  const { service, operations, signingBatches } = harness({ reads: [{ data: [first, second], error: null }] });
  const signal = new AbortController().signal;
  const result = await service.readProfileAudioTracks(profileId, signal);

  assert.deepEqual(Array.from(result, item => item.track.id), ['first', 'second']);
  assert.deepEqual(operations[0].filters, { profile_id: profileId });
  assert.deepEqual(operations[0].order, ['created_at', 'id']);
  assert.equal(operations[0].signal, signal);
  assert.deepEqual(signingBatches, [[first.audio_path, first.cover_path, second.audio_path, second.cover_path]]);
  assert.equal(result[1].track.audioUrl, `https://example.test/${second.audio_path}`);
});

test('the legacy schema retains its soundtrack and edit identity during rollout', async () => {
  const legacy = trackRow('original');
  delete legacy.id;
  const missingColumn = { code: '42703', message: 'column profile_audio_tracks.id does not exist' };
  const { service, operations } = harness({ reads: [{ error: missingColumn }, { data: legacy, error: null }] });
  const result = await service.readProfileAudioTracks(profileId, new AbortController().signal);

  assert.equal(result.length, 1);
  assert.equal(result[0].track.id, profileId);
  assert.equal(result[0].row.revision, legacy.revision);
  assert.equal(operations[1].one, true);
  assert.doesNotMatch(operations[1].columns, /^id,/);
});

test('editing and removing tracks target one stable ID and require the expected revision', async () => {
  const second = trackRow('second');
  const updated = { ...second, title: 'New name', revision: 'second-revision' };
  const { service, operations, removed } = harness({ writes: [{ data: updated }, { data: { revision: updated.revision } }] });
  const next = await service.saveProfileAudio(profileId, { row: second }, {
    title: updated.title, artist: '', description: '', enabled: true,
  });
  await service.removeProfileAudio(profileId, next);

  assert.deepEqual(operations[0].filters, { profile_id: profileId, id: second.id, revision: second.revision });
  assert.equal(next.track.id, second.id);
  assert.equal(next.track.title, updated.title);
  assert.deepEqual(operations[1].filters, { profile_id: profileId, id: second.id, revision: updated.revision });
  assert.deepEqual(removed, [second.audio_path, second.cover_path]);
});
