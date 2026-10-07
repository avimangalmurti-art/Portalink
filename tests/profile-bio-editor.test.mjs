import assert from 'node:assert/strict';
import test from 'node:test';
import { hookHarness, deferred } from './helpers/hook-harness.mjs';

function setup(options = {}) {
  const records = { owner: { headline: 'Saved bio', name: 'Original name' }, other: { headline: 'Other bio' } };
  const writes = [], reads = [];
  let invalidations = 0;
  const h = hookHarness(new URL('../src/features/profile/useProfileBioEditor.ts', import.meta.url), 'useProfileBioEditor', {
    profiles: {
      async getProfile(id) { reads.push(id); await options.read?.(); return { ...records[id] }; },
      async updateProfile(id, input) {
        writes.push({ id, input: JSON.parse(JSON.stringify(input)) });
        await options.save?.(); Object.assign(records[id], input); return { ...records[id] };
      },
    },
  }, {}, ['owner', options.canEdit ?? true], { invalidateProfiles() { invalidations++; } });
  return { h, records, writes, reads, get invalidations() { return invalidations; },
    async open() { await h.flush(); h.value.open(); await h.flush(); },
    async change(value) { h.value.onChange(value); await h.flush(); },
    async save() { await h.value.save(); await h.flush(); },
  };
}

test('Bio reads fresh data and saves only headline, keeping the confirmed value after Done and reopening', async () => {
  const s = setup(); await s.h.flush(); assert.equal(s.reads.length, 0);
  s.records.owner.headline = 'Newer saved bio'; await s.open();
  assert.equal(s.h.value.value, 'Newer saved bio');
  await s.change('  Updated bio  '); s.records.owner.name = 'Independently saved name';
  assert.equal(s.writes.length, 0);
  await s.save(); assert.equal(s.h.value.phase, 'saved');
  assert.deepEqual(s.writes, [{ id: 'owner', input: { headline: 'Updated bio' } }]);
  assert.equal(s.records.owner.name, 'Independently saved name'); assert.equal(s.invalidations, 1);
  await s.h.value.close(); await s.h.flush();
  assert.equal(s.h.value.isEditing, false); assert.equal(s.h.value.savedValue, 'Updated bio');
  await s.open(); assert.equal(s.h.value.value, 'Updated bio'); assert.equal(s.h.value.isDirty, false);
});

test('Bio remains optional and clearing it persists', async () => {
  const s = setup(); await s.open();
  await s.change('   '); await s.save();
  assert.equal(s.writes[0].input.headline, ''); assert.equal(s.h.value.savedValue, '');
});

test('long, multiline Unicode Bios save and reopen intact without a character cap', async () => {
  const s = setup();
  for (const bio of ['x'.repeat(81), 'A longer biography 🌍\n第二段 — creative work.\n'.repeat(500).trim()]) {
    await s.open();
    assert.equal(s.h.value.maxLength, undefined);
    await s.change(bio); await s.save();
    assert.equal(s.h.value.error, null); assert.equal(s.h.value.phase, 'saved');
    assert.equal(s.writes.at(-1).input.headline, bio);
    await s.h.value.close(); await s.open();
    assert.equal(s.h.value.value, bio); assert.equal(s.h.value.isDirty, false);
  }
});

test('failed save preserves the draft and allows retry without a success notification', async () => {
  let fail = true;
  const s = setup({ save() { if (fail) throw Error('Save denied'); } });
  await s.open(); await s.change('Unsaved bio'); await s.save();
  assert.equal(s.h.value.phase, 'editing'); assert.equal(s.h.value.value, 'Unsaved bio');
  assert.equal(s.h.value.error, 'Save denied'); assert.equal(s.invalidations, 1);
  s.h.rerender(); await s.h.flush(); assert.equal(s.h.value.value, 'Unsaved bio');
  fail = false; await s.save(); assert.equal(s.h.value.phase, 'saved'); assert.equal(s.invalidations, 2);
});

test('a write followed by a failed confirmation refreshes cached profiles without reporting success', async () => {
  const s = setup({ save() { s.records.owner.headline = 'Committed bio'; throw Error('Confirmation unavailable'); } });
  await s.open(); await s.change('Committed bio'); await s.save();
  assert.equal(s.h.value.phase, 'editing'); assert.equal(s.h.value.value, 'Committed bio');
  assert.equal(s.invalidations, 1); assert.equal(s.h.value.error, 'Confirmation unavailable');
  await s.h.value.close(); await s.open(); assert.equal(s.h.value.value, 'Committed bio');
});

test('cancel discards the draft, while unchanged Save and read-only operations never write', async () => {
  const s = setup(); await s.open(); await s.save(); assert.equal(s.writes.length, 0);
  await s.change('Discard me'); await s.h.value.close(); await s.open();
  assert.equal(s.h.value.value, 'Saved bio'); assert.equal(s.writes.length, 0);
  const reader = setup({ canEdit: false }); await reader.open(); await reader.change('Denied'); await reader.save();
  assert.equal(reader.reads.length, 0); assert.equal(reader.writes.length, 0); assert.equal(reader.h.value.isEditing, false);
});

test('a pending save blocks duplicate writes and dismissal, and still invalidates after unmount', async () => {
  const gate = deferred(), s = setup({ save: () => gate.promise });
  await s.open(); await s.change('Pending bio');
  const save = s.h.value.save(); await s.h.value.save();
  assert.equal(s.writes.length, 1); assert.equal(await s.h.value.close(), false);
  await s.h.flush(); assert.equal(s.h.value.isSaving, true); s.h.dispose();
  gate.resolve(); await save; assert.equal(s.invalidations, 1); assert.equal(s.records.owner.headline, 'Pending bio');
});

test('a former profile save cannot replace a new profile editor', async () => {
  const gate = deferred(), s = setup({ save: () => gate.promise });
  await s.open(); await s.change('First profile draft'); const pending = s.h.value.save();
  s.h.options(['other', true]); await s.open(); assert.equal(s.h.value.value, 'Other bio');
  gate.resolve(); await pending; await s.h.flush();
  assert.equal(s.invalidations, 1); assert.equal(s.h.value.value, 'Other bio'); assert.equal(s.h.value.phase, 'editing');
});

test('failed reads can retry and a cancelled or obsolete load cannot open editing later', async () => {
  let fail = true;
  const s = setup({ read() { if (fail) throw Error('Unavailable'); } });
  await s.open(); assert.equal(s.h.value.phase, 'load-failed');
  fail = false; s.h.value.retryLoad(); await s.h.flush(); assert.equal(s.h.value.phase, 'editing');
  const gate = deferred(), delayed = setup({ read: () => gate.promise }); await delayed.open();
  assert.equal(delayed.h.value.phase, 'loading'); await delayed.h.value.close();
  gate.resolve(); await delayed.h.flush(); assert.equal(delayed.h.value.isEditing, false);
});
