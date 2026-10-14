import test from 'node:test';
import assert from 'node:assert/strict';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';
const file = new URL('../src/features/profile/useProfileProjectQuery.ts', import.meta.url);
const overview = { id: 'creator', projects: ['one', 'two'].map(id => ({ id, categoryId: 'work', cover: id+'.webp', attachments: [] })) };
const view = id => ({ creator: { id: 'creator' }, project: { id, categoryId: 'work', attachments: [{ sourceUrl: id+'.pdf' }] } });
function fixture(read = async id => view(id), presentation = 'web', initialQuery = {}) {
  const data = { scope: {}, revision: 0 };
  const calls = [];
  const query = { profile: overview, status: 'ready', error: null, retry() {}, ...initialQuery };
  const full = {profile:null,status:'loading'}, fullIds=[];
  data.peekProfile = (id, mode) => mode === 'full' && full.profile?.id === id ? full.profile : null;
  const dependencies = { '../../presentation/usePresentation': { usePresentation: () => presentation }, '../../contexts/ProfileDataContext': { useProfileData: () => data, useProfileQuery: (id, mode) => { if(mode==='full'){if(id)fullIds.push(id);return full;}assert.equal(mode, 'overview'); return query; } } };
  const h = hookHarness(file, 'useProfileProjectQuery', { projects: { getProjectView(id) { calls.push(id); return read(id); } } }, {}, ['creator', null, null], data, dependencies);
  return { h, data, calls, query, full, fullIds };
}
test('overview opens without preparing originals; only selected project hydrates and revisits are immediate', async () => {
  const f = fixture();
  await f.h.flush();
  assert.equal(f.h.value.profile, overview);
  assert.deepEqual(f.calls, []);
  f.h.options(['creator','one','work']);
  assert.equal(f.h.value.status, 'loading');
  await f.h.flush();
  assert.deepEqual(f.calls, ['one']);
  assert.equal(f.h.value.profile.projects[0].attachments[0].sourceUrl,'one.pdf');
  assert.equal(f.h.value.profile.projects[1].attachments.length,0);
  assert.equal(overview.projects[0].attachments.length,0);
  f.h.options(['creator',null,null]);
  assert.equal(f.h.value.profile,overview);
  f.h.options(['creator','one','work']);
  assert.equal(f.h.value.status,'ready');
  await f.h.flush(); assert.deepEqual(f.calls,['one']);
});
for (const presentation of ['mobile', 'web']) test(`first ${presentation} project visit prepares selected media in parallel without showing it before overview confirmation`, async () => {
  for (const mediaFirst of [true, false]) {
    const selected = deferred();
    const f = fixture(() => selected.promise, presentation, { profile: null, status: 'loading' });
    f.h.options(['creator', 'one', 'work']);
    assert.equal(f.h.value.status, 'loading');
    assert.deepEqual(f.calls, ['one'], 'The selected read starts while the overview is still pending.');
    if (mediaFirst) {
      selected.resolve(view('one'));
      await f.h.flush();
      assert.equal(f.h.value.profile, null);
      assert.equal(f.h.value.status, 'loading');
    }
    f.query.profile = overview;
    f.query.status = 'ready';
    f.h.rerender();
    assert.equal(f.h.value.status, mediaFirst ? 'ready' : 'loading');
    if (!mediaFirst) {
      assert.equal(f.h.value.profile, null);
      selected.resolve(view('one'));
    }
    await f.h.flush();
    assert.equal(f.h.value.status, 'ready');
    assert.equal(f.h.value.profile.projects[0].attachments[0].sourceUrl, 'one.pdf');
    assert.deepEqual(f.calls, ['one'], 'Changing overview readiness joins the existing selected read.');
  }
});

test('pending overview must confirm project membership before prepared media can be displayed', async () => {
  const f = fixture(async id => view(id), 'web', { profile: null, status: 'loading' });
  f.h.options(['creator', 'private', 'work']);
  await f.h.flush();
  assert.equal(f.h.value.profile, null);
  f.query.profile = overview;
  f.query.status = 'ready';
  f.h.rerender();
  await f.h.flush();
  assert.equal(f.h.value.profile, overview);
  assert.equal(f.h.value.profile.projects.some(project => project.id === 'private'), false);
  assert.deepEqual(f.calls, ['private']);
});

test('failed or missing overview owns its error and retry, with no selected read until retry starts', async () => {
  for (const status of ['error', 'not-found']) {
    let retries = 0;
    const f = fixture(async id => view(id), 'web', { profile: null, status, error: 'Overview unavailable' });
    f.query.retry = () => { retries++; f.query.status = 'loading'; f.query.error = null; f.h.rerender(); };
    f.h.options(['creator', 'one', 'work']);
    await f.h.flush();
    assert.equal(f.h.value, f.query);
    assert.deepEqual(f.calls, []);
    f.h.value.retry();
    assert.equal(retries, 1);
    await f.h.flush();
    assert.deepEqual(f.calls, ['one']);
    assert.equal(f.h.value.profile, null);
    f.query.profile = overview;
    f.query.status = 'ready';
    f.h.rerender();
    await f.h.flush();
    assert.equal(f.h.value.status, 'ready');
  }
});

test('selected failure during overview loading stays retryable without repeating the failed read on readiness', async () => {
  let reads = 0;
  const f = fixture(async id => { if (++reads === 1) throw new Error('Offline'); return view(id); }, 'web', { profile: null, status: 'loading' });
  f.h.options(['creator', 'one', 'work']);
  await f.h.flush();
  assert.equal(f.h.value.status, 'loading');
  f.query.profile = overview;
  f.query.status = 'ready';
  f.h.rerender();
  await f.h.flush();
  assert.equal(f.h.value.status, 'error');
  assert.equal(f.h.value.profile, null);
  assert.deepEqual(f.calls, ['one']);
  f.h.value.retry();
  await f.h.flush();
  assert.equal(f.h.value.status, 'ready');
  assert.deepEqual(f.calls, ['one', 'one']);
});
test('missing membership and wrong creator/category cannot resolve or inject project media', async () => {
  const missing=fixture(); missing.h.options(['creator','private','work']); await missing.h.flush(); assert.deepEqual(missing.calls,[]);
  for(const change of [v=>({...v,creator:{id:'other'}}),v=>({...v,project:{...v.project,categoryId:'other'}}),v=>({...v,project:{...v.project,id:'other'}})]) {
    const f=fixture(async id=>change(view(id))); f.h.options(['creator','one','work']); await f.h.flush(); assert.equal(f.h.value.status,'not-found'); assert.equal(f.h.value.profile,null);
  }
});
test('parallel reads cannot cross a later overview failure, navigation, or invalidated account scope', async () => {
  const old = deferred(), current = deferred();
  let count = 0;
  const f = fixture(() => ++count === 1 ? old.promise : current.promise, 'web', { profile: null, status: 'loading' });
  f.h.options(['creator', 'one', 'work']);
  await f.h.flush();
  f.query.status = 'error';
  f.query.error = 'Overview unavailable';
  f.h.rerender();
  await f.h.flush();
  old.resolve({ ...view('one'), project: { ...view('one').project, title: 'Obsolete' } });
  await f.h.flush();
  assert.equal(f.h.value, f.query);
  f.data.scope = {};
  f.data.revision++;
  f.query.status = 'loading';
  f.query.error = null;
  f.h.options(['creator', 'two', 'work']);
  await f.h.flush();
  assert.deepEqual(f.calls, ['one', 'two']);
  f.query.profile = overview;
  f.query.status = 'ready';
  f.h.rerender();
  assert.equal(f.h.value.profile, null);
  current.resolve(view('two'));
  await f.h.flush();
  assert.equal(f.h.value.profile.projects[0].attachments.length, 0);
  assert.equal(f.h.value.profile.projects[0].title, undefined);
  assert.equal(f.h.value.profile.projects[1].attachments[0].sourceUrl, 'two.pdf');
});

test('mobile video waits for overview membership before preparing sibling media', async () => {
  const f = fixture(async id => ({ ...view(id), project: { ...view(id).project, attachments: [{ kind: 'video', sourceUrl: 'selected.mp4' }] } }), 'mobile', { profile: null, status: 'loading' });
  f.h.options(['creator', 'one', 'work']);
  await f.h.flush();
  assert.deepEqual(f.fullIds, []);
  f.query.profile = overview;
  f.query.status = 'ready';
  f.h.rerender();
  await f.h.flush();
  assert.equal(f.h.value.status, 'ready');
  assert.ok(f.fullIds.includes('creator'));
  assert.deepEqual(f.calls, ['one']);
});
test('account scope and invalidation discard prepared views and late responses', async () => {
  const first=deferred(), second=deferred(); let count=0;
  const f=fixture(()=>++count===1?first.promise:second.promise); f.h.options(['creator','one','work']); await f.h.flush();
  f.data.scope={}; f.h.rerender(); assert.equal(f.h.value.profile,null); await f.h.flush();
  second.resolve(view('one')); await f.h.flush(); first.resolve({...view('one'),project:{...view('one').project,title:'obsolete'}}); await f.h.flush(); assert.equal(f.h.value.profile.projects[0].title,undefined);
  f.data.revision++; f.h.rerender(); assert.equal(f.h.value.status,'loading');
});
test('failed selected read retries without refetching overview or other media', async () => {
  let count=0; const f=fixture(async id=>{if(++count===1)throw new Error('Offline');return view(id);}); f.h.options(['creator','one','work']); await f.h.flush(); assert.equal(f.h.value.status,'error');
  f.h.value.retry(); await f.h.flush(); assert.equal(f.h.value.status,'ready'); assert.deepEqual(f.calls,['one','one']);
});
test('mobile video opens before its cross-project sequence finishes preparing', async () => {
  const f=fixture(async id=>({...view(id),project:{...view(id).project,attachments:[{kind:'video',sourceUrl:'selected.mp4'}]}}),'mobile');
  f.h.options(['creator','one','work']);await f.h.flush();assert.equal(f.h.value.status,'ready');assert.equal(f.h.value.profile.projects[1].attachments.length,0);assert.ok(f.fullIds.includes('creator'));
  f.full.profile={...overview,projects:[{...overview.projects[0],attachments:[{kind:'video',sourceUrl:'selected.mp4'}]},{...overview.projects[1],attachments:[{kind:'video',sourceUrl:'next.mp4'}]}]};f.full.status='ready';f.h.rerender();await f.h.flush();
  assert.equal(f.h.value.status,'ready');assert.equal(f.h.value.profile.projects[1].attachments[0].sourceUrl,'next.mp4');assert.deepEqual(f.calls,['one']);
  f.h.options(['creator','two','work']);
  assert.equal(f.h.value.status,'ready');
  assert.equal(f.h.value.profile.projects[1].attachments[0].sourceUrl,'next.mp4');
  assert.equal(f.h.value.profile.projects[0].attachments[0].sourceUrl,'selected.mp4');
  await f.h.flush();assert.deepEqual(f.calls,['one']);
});
