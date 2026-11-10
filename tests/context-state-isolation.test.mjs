import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { deferred } from './helpers/hook-harness.mjs';

function compile(path, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, Error, require(name) {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  } });
  return exports;
}

// Mount the real providers and query hook with independently retained hook state.
// Effects can be held to assert the first render after an account change, before
// a passive-effect reset would have hidden any previously authorized content.
function harness(kind, queryIds = []) {
  const components = new Map(), contexts = new Map(), reads = [], writes = [], gates = [];
  let current, cursor = 0, dirty = true, effects = [], context, queries = [], stateWrites = 0;
  const auth = { user: { id: 'alice' }, isAuthenticated: true, requestAuthenticatedDestination: intent => gates.push(intent) };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useContext: target => contexts.get(target),
    useState(initial) {
      const slots = current, index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; stateWrites++; }
      }];
    },
    useRef(initial) { return current[cursor++] ??= { current: initial }; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!same(current[index]?.deps, deps)) current[index] = { deps, value: factory() };
      return current[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const slots = current, index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const services = {
    profiles: { getProfile(id) { const request = { id, account: auth.user?.id ?? null, ...deferred() }; reads.push(request); return request.promise; } },
    engagement: {
      getProjectEngagement(id) { const request = { id, account: auth.user?.id ?? null, ...deferred() }; reads.push(request); return request.promise; },
      setEngagement(mutation) { const request = { mutation, account: auth.user?.id ?? null, ...deferred() }; writes.push(request); return request.promise; },
    },
  };
  const source = compile(`../src/contexts/${kind === 'profile' ? 'ProfileDataContext' : 'EngagementContext'}.tsx`, {
    react, './ServicesContext': { useServices: () => services }, './AuthContext': { useAuth: () => auth },
    '../types/engagement': compile('../src/types/engagement.ts', {}),
    '../features/auth/interactionIntent': { interactionIntent: label => ({ kind: 'interaction', label }) },
  });
  const call = (key, fn) => {
    if (!components.has(key)) components.set(key, []);
    current = components.get(key); cursor = 0;
    return fn();
  };
  const commit = () => { effects.splice(0).forEach(effect => effect()); };
  const render = (runEffects = true) => {
    dirty = false;
    const element = call('provider', () => source[kind === 'profile' ? 'ProfileDataProvider' : 'EngagementProvider']({ children: null }));
    context = element.props.value;
    contexts.set(element.type._context, context);
    queries = queryIds.map((id, index) => call(`query-${index}`, () => source.useProfileQuery(id)));
    if (runEffects) commit();
    return { context, queries };
  };
  render();
  return {
    reads, writes, gates, auth, services, render, commit,
    get context() { if (dirty) render(); return context; },
    get queries() { if (dirty) render(); return queries; },
    get stateWrites() { return stateWrites; },
    switchAccount(id, runEffects = true) { auth.user = id ? { id } : null; auth.isAuthenticated = Boolean(id); return render(runEffects); },
    async flush() { for (let i = 0; i < 30; i++) { if (dirty) render(); await Promise.resolve(); } return { context, queries }; },
    dispose() { for (const slots of components.values()) for (const slot of slots) slot?.cleanup?.(); },
  };
}

const profile = (name, projects = []) => ({ id: 'creator', name, categories: [], projects });
test('overview cache deduplicates overview reads without satisfying a full media read and clears on account change', async () => {
  const h=harness('profile');
  h.services.profiles.getProfileOverview=id=>{const request={id,mode:'overview',...deferred()};h.reads.push(request);return request.promise;};
  const first=h.context.fetchProfile('creator','overview'), duplicate=h.context.fetchProfile('creator','overview');
  assert.equal(h.reads.length,1);
  const compact=profile('Compact',[{id:'document',attachments:[]}]);h.reads[0].resolve(compact);await Promise.all([first,duplicate]);await h.flush();
  assert.equal(h.context.peekProfile('creator','overview'),compact);
  assert.equal(h.context.peekProfile('creator'),null);
  const full=h.context.fetchProfile('creator');assert.equal(h.reads.length,2);
  const prepared=profile('Full',[{id:'document',attachments:[{sourceUrl:'private.pdf'}]}]);h.reads[1].resolve(prepared);await full;await h.flush();
  assert.equal(h.context.peekProfile('creator'),prepared);
  h.switchAccount('bob',false);assert.equal(h.context.peekProfile('creator'),null);assert.equal(h.context.peekProfile('creator','overview'),null);
  h.dispose();
});
const summary = (changes = {}) => ({ projectId: 'project', isLiked: false, isSaved: false, isReposted: false,
  likeCount: 0, saveCount: 0, repostCount: 0, ...changes });
async function loadedEngagement(initial = summary()) {
  const h = harness('engagement');
  h.context.ensure('project');
  h.reads[0].resolve(initial); await h.flush();
  return h;
}

test('profile queries and peeks hide owner records on the first guest or different-account render', async () => {
  const h = harness('profile', ['creator', 'creator']);
  try {
    assert.equal(h.reads.length, 1, 'Mounted readers share the same request.');
    const owner = profile('Owner', [{ id: 'hidden-project', cover: 'signed-owner-url' }]);
    h.reads[0].resolve(owner); await h.flush();
    assert.ok(h.queries.every(query => query.profile === owner));
    const old = h.context;
    const guest = h.switchAccount(null, false);
    assert.ok(guest.queries.every(query => query.profile === null && query.status === 'loading'));
    assert.equal(guest.context.peekProfile('creator'), null);
    assert.equal(old.peekProfile('creator'), null);
    old.cacheProfile(owner); old.invalidateProfiles();
    await assert.rejects(old.fetchProfile('creator'), /account changed/);
    h.commit(); await h.flush();
    assert.equal(h.reads.length, 2);
    const publicRecord = profile('Public'); h.reads[1].resolve(publicRecord); await h.flush();
    assert.ok(h.queries.every(query => query.profile === publicRecord));
    const next = h.switchAccount('bob', false);
    assert.ok(next.queries.every(query => query.profile === null && query.error === null));
    h.commit(); await h.flush();
    assert.equal(h.reads.length, 3);
    h.reads[2].resolve(profile('Bob view')); await h.flush();
    assert.equal(h.queries[0].profile.name, 'Bob view');
  } finally { h.dispose(); }
});

test('late profile reads cannot enter a new identity, including returning to the original account', async () => {
  const h = harness('profile', ['creator']);
  try {
    const oldRead = h.context.fetchProfile('creator');
    const rejected = assert.rejects(oldRead, /account changed/);
    h.switchAccount('bob'); await h.flush();
    h.switchAccount('alice'); await h.flush();
    const current = profile('Current Alice'); h.reads[2].resolve(current); await h.flush();
    h.reads[0].resolve(profile('Old owner', [{ id: 'hidden' }]));
    h.reads[1].resolve(profile('Old Bob')); await rejected; await h.flush();
    assert.equal(h.queries[0].profile, current);
    assert.equal(h.context.peekProfile('creator'), current);
  } finally { h.dispose(); }
});

test('a profile read invalidated by a write joins the current request instead of returning stale data', async () => {
  const h = harness('profile', ['creator']);
  try {
    const first = h.context.fetchProfile('creator');
    h.context.invalidateProfiles(); await h.flush();
    assert.equal(h.reads.length, 2);
    h.reads[0].resolve(profile('Before write')); await h.flush();
    assert.equal(h.queries[0].profile, null);
    const latest = profile('After write'); h.reads[1].resolve(latest); await h.flush();
    assert.equal(await first, latest);
    assert.equal(h.queries[0].profile, latest);
    assert.equal(h.context.peekProfile('creator'), latest);
  } finally { h.dispose(); }
});

test('confirmed profile replacement fences pending reads and same-account refresh retains visible data', async () => {
  const h = harness('profile', ['creator']);
  try {
    const confirmed = profile('Saved');
    h.context.cacheProfile(confirmed); await h.flush();
    h.reads[0].resolve(profile('Obsolete')); await h.flush();
    assert.equal(h.queries[0].profile, confirmed);
    h.context.invalidateProfiles(); await h.flush();
    assert.equal(h.queries[0].profile, confirmed);
    assert.equal(h.queries[0].status, 'loading');
    h.reads[1].reject(new Error('Offline')); await h.flush();
    assert.equal(h.queries[0].profile, null);
    assert.equal(h.queries[0].status, 'error');
    h.queries[0].retry(); await h.flush();
    h.reads[2].resolve(profile('Retried')); await h.flush();
    assert.equal(h.queries[0].profile.name, 'Retried');
  } finally { h.dispose(); }
});

test('obsolete profile failures and replaced service instances cannot affect the current query', async () => {
  const h = harness('profile', ['creator']);
  try {
    const old = h.context.fetchProfile('creator');
    h.context.invalidateProfiles(); await h.flush();
    h.reads[0].reject(new Error('Obsolete error')); await h.flush();
    assert.equal(h.queries[0].error, null);
    const latest = profile('Current'); h.reads[1].resolve(latest); await h.flush();
    assert.equal(await old, latest);
    const replacement = deferred();
    h.services.profiles = { getProfile: () => replacement.promise };
    const first = h.render(false);
    assert.equal(first.queries[0].profile, null);
    h.commit();
    const replaced = profile('Replacement service'); replacement.resolve(replaced); await h.flush();
    assert.equal(h.queries[0].profile, replaced);
  } finally { h.dispose(); }
});

for (const completion of [[0, 1], [1, 0]]) {
  test(`overlapping Like and Save confirmations preserve both intents in response order ${completion}`, async () => {
    const h = await loadedEngagement();
    try {
      const store = h.context;
      store.toggle('project', 'like'); store.toggle('project', 'save');
      store.toggle('project', 'like');
      assert.equal(h.writes.length, 2, 'The same-turn pending lock blocks duplicate likes.');
      assert.equal(h.context.read('project').record.isLiked, true);
      assert.equal(h.context.read('project').record.isSaved, true);
      const responses = [summary({ isLiked: true, likeCount: 4 }), summary({ isSaved: true, saveCount: 8 })];
      for (const index of completion) { h.writes[index].resolve(responses[index]); await h.flush(); }
      const entry = h.context.read('project');
      assert.equal(entry.record.isLiked, true); assert.equal(entry.record.isSaved, true);
      assert.equal(entry.record.likeCount, 4); assert.equal(entry.record.saveCount, 8);
      assert.equal(entry.pending.like, false); assert.equal(entry.pending.save, false);
    } finally { h.dispose(); }
  });
}

test('a failed kind rolls back only itself and retains another kind pending or successfully saved', async () => {
  for (const failFirst of [true, false]) {
    const h = await loadedEngagement();
    try {
      h.context.toggle('project', 'like'); h.context.toggle('project', 'save');
      const fail = async () => { h.writes[0].reject(new Error('Like failed')); await h.flush(); };
      const save = async () => { h.writes[1].resolve(summary({ isSaved: true, saveCount: 8 })); await h.flush(); };
      if (failFirst) { await fail(); assert.equal(h.context.read('project').record.isSaved, true); await save(); }
      else { await save(); await fail(); }
      const entry = h.context.read('project');
      assert.equal(entry.record.isLiked, false); assert.equal(entry.record.likeCount, 0);
      assert.equal(entry.record.isSaved, true); assert.equal(entry.record.saveCount, 8);
      assert.equal(entry.failure.kind, 'like');
      const retry = entry.failure.retry; assert.equal(typeof retry, 'function');
      retry(); await h.flush();
      assert.equal(h.writes.length, 3); assert.equal(h.writes[2].mutation.engaged, true);
      h.writes[2].resolve(summary({ isLiked: true, likeCount: 2 })); await h.flush();
      assert.equal(h.context.read('project').record.isSaved, true);
      assert.equal(h.context.read('project').failure, null);
      retry(); assert.equal(h.writes.length, 3, 'An old Retry cannot replay after success.');
    } finally { h.dispose(); }
  }
});

test('retired repost calls never mutate or fall through to saved engagement while supported kinds stay independent', async () => {
  const h = await loadedEngagement(summary({ isLiked: true, likeCount: 6 }));
  try {
    for (const kind of ['like', 'save', 'repost']) h.context.toggle('project', kind);
    assert.equal(h.writes.length, 2, 'A stale repost call cannot create a mutation or masquerade as a save.');
    assert.deepEqual(h.writes.map(write => write.mutation.kind), ['like', 'save']);
    h.writes[1].resolve(summary({ isSaved: true, saveCount: 9 })); await h.flush();
    h.writes[0].reject(new Error('Unlike failed')); await h.flush();
    const record = h.context.read('project').record;
    assert.equal(record.isLiked, true); assert.equal(record.likeCount, 6);
    assert.equal(record.isSaved, true); assert.equal(record.saveCount, 9);
    assert.deepEqual(Array.from(h.context.knownFor('repost').engaged), []);
    assert.deepEqual(Array.from(h.context.knownFor('repost').withdrawn), []);
    h.switchAccount(null); h.context.toggle('project', 'repost');
    assert.equal(h.gates.length, 0, 'A removed action must not open authentication.');
    assert.equal(h.writes.length, 2);
  } finally { h.dispose(); }
});

test('refreshes begun before or during a mutation cannot undo it and still refresh untouched kinds', async () => {
  for (const during of [false, true]) {
    for (const readFirst of [false, true]) {
      const h = await loadedEngagement();
      try {
        if (!during) h.context.refresh('project');
        h.context.toggle('project', 'like');
        if (during) h.context.refresh('project');
        const read = async () => { h.reads[1].resolve(summary({ isSaved: true, saveCount: 12, likeCount: 50 })); await h.flush(); };
        const save = async () => { h.writes[0].resolve(summary({ isLiked: true, likeCount: 3 })); await h.flush(); };
        if (readFirst) { await read(); assert.equal(h.context.read('project').record.isLiked, true); await save(); }
        else { await save(); await read(); }
        const entry = h.context.read('project');
        assert.equal(entry.record.isLiked, true); assert.equal(entry.record.likeCount, 3);
        assert.equal(entry.record.isSaved, true); assert.equal(entry.record.saveCount, 12);
        assert.equal(entry.isResolving, false);
      } finally { h.dispose(); }
    }
  }
});

test('an older refresh cannot undo rollback or replace a more recent read', async () => {
  const h = await loadedEngagement();
  try {
    h.context.refresh('project'); h.context.toggle('project', 'save');
    h.writes[0].reject(new Error('Save failed')); await h.flush();
    h.reads[1].resolve(summary({ isSaved: true, saveCount: 10 })); await h.flush();
    assert.equal(h.context.read('project').record.isSaved, false);
    assert.equal(h.context.read('project').record.saveCount, 0);
    h.context.refresh('project'); h.context.refresh('project');
    h.reads[3].resolve(summary({ likeCount: 7 })); await h.flush();
    h.reads[2].resolve(summary({ likeCount: 1 })); await h.flush();
    assert.equal(h.context.read('project').record.likeCount, 7);
  } finally { h.dispose(); }
});

test('engagement identity changes mask records synchronously and fence old reads, writes and Retry callbacks', async () => {
  const h = await loadedEngagement();
  try {
    const old = h.context;
    old.toggle('project', 'save'); h.writes[0].reject(new Error('Offline')); await h.flush();
    const retry = h.context.read('project').failure.retry;
    old.refresh('project'); old.toggle('project', 'like');
    const guest = h.switchAccount(null, false).context;
    assert.equal(guest.read('project').record, null); assert.equal(old.read('project').record, null);
    assert.equal(guest.canEngage, false);
    retry(); old.toggle('project', 'save'); old.ensure('another');
    assert.equal(h.writes.length, 2); assert.equal(h.reads.length, 2);
    h.commit();
    h.switchAccount('alice'); h.context.ensure('project');
    h.reads[2].resolve(summary({ isSaved: true, saveCount: 5 })); await h.flush();
    h.context.toggle('project', 'like');
    h.writes[1].resolve(summary({ isLiked: true, likeCount: 99 }));
    h.reads[1].resolve(summary({ isReposted: true, repostCount: 99 })); await h.flush();
    assert.equal(h.context.read('project').pending.like, true);
    assert.equal(h.context.read('project').record.likeCount, 1);
    assert.equal(h.context.read('project').record.repostCount, 0);
    h.writes[2].resolve(summary({ isLiked: true, likeCount: 2 })); await h.flush();
    assert.equal(h.context.read('project').record.likeCount, 2);
    assert.equal(h.context.read('project').record.saveCount, 5);
  } finally { h.dispose(); }
});

test('guests are gated, failed initial reads can retry, and unknown counts stay unknown', async () => {
  const h = harness('engagement');
  try {
    h.switchAccount(null); h.context.toggle('project', 'like');
    assert.equal(h.gates.length, 1); assert.equal(h.writes.length, 0);
    h.switchAccount('alice'); h.context.ensure('project');
    h.reads[0].reject(new Error('Offline')); await h.flush();
    h.context.toggle('project', 'save'); assert.equal(h.writes.length, 0);
    h.context.refresh('project'); h.reads[1].resolve(summary({ likeCount: null })); await h.flush();
    h.context.toggle('project', 'like');
    assert.equal(h.context.read('project').record.likeCount, null);
    h.writes[0].reject(new Error('Offline again')); await h.flush();
    assert.equal(h.context.read('project').record.likeCount, null);
    assert.equal(h.context.read('project').record.isLiked, false);
  } finally { h.dispose(); }
});

test('disposed providers ignore late work and retained mutation callbacks', async () => {
  const h = await loadedEngagement();
  h.context.refresh('project'); h.context.toggle('project', 'like');
  const store = h.context; h.dispose();
  const count = h.stateWrites;
  h.reads[1].resolve(summary({ likeCount: 10 })); h.writes[0].resolve(summary({ isLiked: true }));
  store.toggle('project', 'save'); await h.flush();
  assert.equal(h.stateWrites, count); assert.equal(h.writes.length, 1);
});
