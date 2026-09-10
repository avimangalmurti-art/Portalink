import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function compile(path, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { exports, ...globals });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const A = { accentColor: '#FF375F', systemGray: 'gray4', mode: 'dark' };
const B = { accentColor: '#0A84FF', systemGray: 'gray2', mode: 'light' };
function publicModule(storage = new Map(), dark = false) {
  const window = { localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) }, matchMedia: () => ({ matches: dark }) };
  const preferences = compile('../src/utils/appearancePreferences.ts', { window });
  return { preferences, api: compile('../src/utils/publicAppearance.ts', { window, require: () => preferences }) };
}

test('public appearance validates the existing gray/mode vocabulary and rejects injected CSS', () => {
  const { api } = publicModule();
  assert.deepEqual(plain(api.normalizePublicAppearance(A)), A);
  for (const invalid of [null, {}, [], { ...A, accentColor: 'url(evil)' }, { ...A, systemGray: 'gray99' }, { ...A, mode: 'blue' }]) {
    assert.equal(api.normalizePublicAppearance(invalid), null);
  }
});

test('visitors start with creator mode; local overrides remain per site and never change creator/private preferences', () => {
  const storage = new Map([['portalinknetworks.appearanceMode', 'light']]);
  const { api } = publicModule(storage, true);
  assert.equal(api.resolvePublicTheme(A, api.readVisitorTheme('one')), 'dark');
  api.writeVisitorTheme('one', 'light');
  assert.equal(api.resolvePublicTheme(A, api.readVisitorTheme('one')), 'light');
  assert.equal(api.readVisitorTheme('two'), null);
  assert.equal(api.resolvePublicTheme({ ...A, mode: 'auto' }, null), 'dark');
  assert.equal(storage.get('portalinknetworks.appearanceMode'), 'light');
  assert.equal(A.mode, 'dark');
});

test('saved appearance writes serialize, deduplicate and retry after a failed save', async () => {
  const { api } = publicModule();
  const writes = [];
  let fail = true;
  const write = api.createAppearanceWriter(async (id, value) => {
    if (fail) { fail = false; throw Error('offline'); }
    writes.push([id, value.accentColor]);
  });
  await assert.rejects(write('one', A), /offline/);
  await write('one', A);
  const b1 = write('one', B), b2 = write('one', B);
  assert.equal(b1, b2);
  await Promise.all([b1, write('two', A)]);
  assert.deepEqual(writes, [['one', A.accentColor], ['one', B.accentColor], ['two', A.accentColor]]);
});

function hookHarness(initial = A, initialStatus = 'ready') {
  let cursor = 0, dirty = true, result, id = 'one', enabled = true;
  const slots = [], effects = [], timers = new Map(), writes = [];
  let timerId = 0, save = async () => undefined;
  let query = { status: initialStatus, profile: { publicAppearance: initial }, error: null, retry() {} };
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v,n) => v !== slots[i].deps[n])) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v,n) => v !== slots[i].deps[n])) {
        const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const { api, preferences } = publicModule();
  const profileData = { useProfileQuery: () => query, useProfileData: () => cache };
  const cache = { cacheProfile() {} };
  const services = { profiles: { async updateProfile(profileId, input) { writes.push([profileId, plain(input.publicAppearance)]); await save(profileId, input.publicAppearance); } } };
  const hook = compile('../src/features/profile/useCreatorAppearance.ts', {
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    require: name => name === 'react' ? react : name.includes('ServicesContext') ? { useServices: () => services }
      : name.includes('ProfileDataContext') ? profileData : name.includes('publicAppearance') ? api : preferences,
  }).useCreatorAppearance;
  function render() {
    let turns = 0;
    do { if (++turns > 30) throw Error('Render loop'); dirty = false; cursor = 0; result = hook(id, enabled); while (effects.length) effects.shift()(); } while (dirty);
    return result;
  }
  return {
    render, writes, setSave: fn => { save = fn; },
    choose: patch => { render().choose(patch); return render(); },
    setQuery: value => { query = { ...query, ...value }; return render(); },
    navigate: (nextId, active = true) => { id = nextId; enabled = active; return render(); },
    async settle() { for (let i=0; i<15; i++) await Promise.resolve(); return render(); },
  };
}

test('existing creator settings load without being overwritten by local defaults', async () => {
  const h = hookHarness();
  assert.deepEqual(plain(h.render().appearance), A);
  await h.render().flush();
  assert.equal(h.writes.length, 0);
});

test('changes made while loading are merged into the saved creator appearance', async () => {
  const h = hookHarness(A, 'loading');
  h.choose({ mode: 'light' });
  const result = h.setQuery({ status: 'ready' });
  assert.deepEqual(plain(result.appearance), { ...A, mode: 'light' });
  await result.flush();
  assert.deepEqual(h.writes[0], ['one', { ...A, mode: 'light' }]);
});

test('reverting to A during a slow save of B persists A last', async () => {
  const h = hookHarness();
  let release;
  h.setSave((id, value) => value.accentColor === B.accentColor ? new Promise(resolve => { release = resolve; }) : Promise.resolve());
  const first = h.choose(B).flush();
  await h.settle();
  const reverted = h.choose(A).flush();
  release();
  await Promise.all([first, reverted]);
  assert.deepEqual(h.writes.map(([, value]) => value), [B, A]);
  assert.equal((await h.settle()).saving, false);
});

test('old account completion cannot leave the new account stuck saving or write in public view', async () => {
  const h = hookHarness();
  let release;
  h.setSave(() => new Promise(resolve => { release = resolve; }));
  const old = h.choose(B).flush();
  await h.settle();
  assert.equal(h.render().saving, true);
  assert.equal(h.navigate('two').saving, false);
  release(); await old;
  assert.equal((await h.settle()).saving, false);
  h.navigate('two', false);
  h.choose(B);
  await h.render().flush();
  assert.equal(h.writes.length, 1);
});

test('failed website saves stay retryable and prevent a successful pre-copy flush', async () => {
  const h = hookHarness();
  h.setSave(async () => { throw Error('offline'); });
  await assert.rejects(h.choose(B).flush(), /offline/);
  assert.ok((await h.settle()).saveError);
  h.setSave(async () => undefined);
  await h.render().flush();
  assert.equal((await h.settle()).saveError, null);
  assert.equal(h.writes.length, 2);
});

test('public bootstrap honors a newly opened creator link while retaining guest read-only routing', () => {
  const storage = new Map([['portalink.sharedViewerProfileId', 'old']]);
  const fakeReact = { createElement: (type, props) => ({ type, props }), useState: () => [true, () => {}], useEffect: fn => fn(), useCallback: fn => fn };
  const routes = { sharedProfile: { path: '/share/:profileId' }, sharedProfileCategory: { path: '/share/:profileId/c/:categoryId' }, sharedProject: { path: '/share/:profileId/c/:categoryId/:projectId' } };
  const router = { useLocation: () => ({ pathname: '/share/new' }), Navigate: 'redirect', matchPath: (path, pathname) => path === '/share/:profileId' ? { params: { profileId: pathname.split('/')[2] } } : null };
  const api = compile('../src/app/ApplicationBootstrap.tsx', {
    window: { sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) }, setTimeout: () => 1 },
    require: name => name === 'react' ? fakeReact : name === 'react-router-dom' ? router : name.includes('AuthContext') ? { useAuth: () => ({ isAuthenticated: false, isInitializing: false }) }
      : name === './routes' ? { routes, buildPath: (_, params) => `/share/${params.profileId}` } : {},
  });
  assert.notEqual(api.ApplicationBootstrap().type, 'redirect');
  assert.equal(storage.get('portalink.sharedViewerProfileId'), 'new');
});

test('an older failed save does not leave an error after the latest choice saves successfully', async () => {
  const h = hookHarness();
  let reject;
  h.setSave((id, value) => value.accentColor === B.accentColor ? new Promise((resolve, fail) => { reject = fail; }) : Promise.resolve());
  const old = h.choose(B).flush();
  const expectedFailure = assert.rejects(old, /offline/);
  await h.settle();
  const latest = h.choose({ ...A, mode: 'light' }).flush();
  reject(Error('offline'));
  await expectedFailure;
  await latest;
  assert.equal((await h.settle()).saveError, null);
});

test('a welcome-screen color choice survives sign-in without changing a public creator website', async () => {
  const h = hookHarness();
  h.navigate(null);
  h.choose({accentColor: B.accentColor});
  await h.render().flush();
  assert.equal(h.writes.length, 0);
  const result = h.navigate('returning-creator');
  assert.deepEqual(plain(result.appearance), {...A, accentColor: B.accentColor});
  await result.flush();
  assert.deepEqual(h.writes[0], ['returning-creator', {...A, accentColor: B.accentColor}]);
  h.navigate('returning-creator', false);
  h.choose({accentColor: A.accentColor});
  await h.render().flush();
  assert.equal(h.writes.length, 1);
});
