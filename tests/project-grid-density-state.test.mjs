import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { deferred } from './helpers/hook-harness.mjs';

// Multiple mounted hooks share the real module, as Home/Profile do during
// navigation. Controlled service promises expose race and unmount behavior.
function setup(options = {}) {
  const records = { owner: { id: 'owner', projectGridColumns: 2, name: 'Owner' },
    other: { id: 'other', projectGridColumns: 8 }, ...options.records };
  const writes = [];
  let invalidations = 0, active;
  const services = { profiles: { async updateProfile(id, input) {
    writes.push({ id, input: { ...input } });
    await options.save?.(id, input, writes.length);
    Object.assign(records[id], input);
    return { ...records[id] };
  } } };
  if (options.lightweight) services.profiles.updateProjectGridLayout = async (id, columns) => {
    const result = await services.profiles.updateProfile(id, { projectGridColumns: columns });
    return { id: result.id, projectGridColumns: result.projectGridColumns };
  };
  const profileData = { invalidateProfiles() { invalidations++; } };
  const react = Object.fromEntries(['useState', 'useEffect', 'useMemo', 'useCallback'].map(name =>
    [name, (...args) => active[name](...args)]));
  const densityExports = {};
  const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(transpile('../src/utils/projectGridDensity.ts'), { exports: densityExports });
  const exports = {};
  vm.runInNewContext(transpile('../src/features/profile/useProjectGridDensity.ts'), {
    exports, Error, localStorage: options.storage,
    require(name) {
      if (name === 'react') return react;
      if (name.endsWith('/ServicesContext')) return { useServices: () => services };
      if (name.endsWith('/ProfileDataContext')) return { useProfileData: () => profileData };
      if (name.endsWith('/projectGridDensity')) return densityExports;
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  function mount(profile = { ...records.owner }, canSave = true, scope = 'profile') {
    const slots = [];
    let cursor = 0, dirty = true, effects = [], result;
    const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    const hooks = {
      useState(initial) {
        const index = cursor++;
        slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        return [slots[index].value, next => {
          slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
          dirty = true;
        }];
      },
      useMemo(factory, deps) {
        const index = cursor++;
        if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
        return slots[index].value;
      },
      useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
      useEffect(effect, deps) {
        const index = cursor++;
        if (!same(slots[index]?.deps, deps)) {
          const prior = slots[index]; slots[index] = { deps };
          effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = effect(); });
        }
      },
    };
    function render() {
      active = hooks; cursor = 0; dirty = false; effects = [];
      result = exports.useProjectGridDensity(profile, canSave, scope);
      for (const effect of effects) effect();
      return result;
    }
    return {
      get value() { return dirty ? render() : result; },
      async flush() { for (let i = 0; i < 25; i++) { if (dirty) render(); await Promise.resolve(); } return result; },
      update(next, owner = canSave) { profile = next; canSave = owner; dirty = true; },
      dispose() { slots.forEach(slot => slot.cleanup?.()); },
    };
  }
  return { records, writes, mount, get invalidations() { return invalidations; } };
}

test('a saved owner profile density is restored and initializes a public visitor', async () => {
  const s = setup(), home = s.mount();
  assert.equal(home.value.columns, 2);
  home.value.setColumns(1); await home.flush();
  assert.equal(home.value.columns, 1); assert.equal(home.value.saving, false);
  assert.deepEqual(s.writes, [{ id: 'owner', input: { projectGridColumns: 1 } }]);
  assert.equal(s.invalidations, 1); assert.equal(s.records.owner.name, 'Owner');
  home.dispose();
  const profile = s.mount({ ...s.records.owner }); await profile.flush();
  const visitor = s.mount({ ...s.records.owner }, false); await visitor.flush();
  assert.equal(profile.value.columns, 1); assert.equal(visitor.value.columns, 1);
  // A new JS session reads the persisted record, rather than the owner cache.
  const fresh = setup({ records: s.records }).mount({ ...s.records.owner });
  assert.equal(fresh.value.columns, 1);
});

test('1 and 13 work; out-of-range choices clamp and visitors never save owner preferences', async () => {
  const s = setup(), owner = s.mount();
  owner.value.setColumns(0); await owner.flush(); assert.equal(owner.value.columns, 1);
  owner.value.setColumns(30); await owner.flush(); assert.equal(owner.value.columns, 13);
  owner.value.setColumns(2); await owner.flush(); assert.equal(owner.value.columns, 2);
  const visitor = s.mount({ ...s.records.owner }, false);
  visitor.value.setColumns(1); await visitor.flush();
  assert.equal(visitor.value.columns, 1); assert.equal(visitor.value.saveError, null);
  visitor.update({ ...s.records.owner, name: 'Refreshed' }); await visitor.flush();
  assert.equal(visitor.value.columns, 1);
  assert.deepEqual(s.writes.map(write => write.input.projectGridColumns), [1, 13, 2]);
  assert.equal(s.records.owner.projectGridColumns, 2);
});

test('serial latest-wins writes do not let old reads or intermediate saves reset the chosen density', async () => {
  const first = deferred(), last = deferred();
  const s = setup({ save: (_id, _input, count) => count === 1 ? first.promise : last.promise });
  const h = s.mount(); h.value.setColumns(5); h.value.setColumns(7); h.value.setColumns(13);
  await h.flush(); assert.equal(h.value.columns, 13); assert.equal(h.value.saving, true);
  assert.equal(s.writes.length, 1);
  h.update({ id: 'owner', projectGridColumns: 2 }); await h.flush(); assert.equal(h.value.columns, 13);
  first.resolve(); await h.flush();
  assert.deepEqual(s.writes.map(write => write.input.projectGridColumns), [5, 13]);
  h.update({ id: 'owner', projectGridColumns: 5 }); await h.flush(); assert.equal(h.value.columns, 13);
  last.resolve(); await h.flush();
  assert.equal(s.records.owner.projectGridColumns, 13); assert.equal(h.value.columns, 13);
  assert.equal(h.value.saving, false); assert.equal(h.value.saveError, null);
});

test('committed density saves survive navigation and a remount joins the same serialized writer', async () => {
  const first = deferred();
  const s = setup({ save: (_id, _input, count) => count === 1 ? first.promise : undefined });
  const home = s.mount(); home.value.setColumns(5); await home.flush(); home.dispose();
  const profile = s.mount({ id: 'owner', projectGridColumns: 2 }); await profile.flush();
  assert.equal(profile.value.columns, 5); assert.equal(profile.value.saving, true);
  profile.value.setColumns(9); await profile.flush(); assert.equal(s.writes.length, 1);
  first.resolve(); await profile.flush();
  assert.equal(profile.value.columns, 9); assert.equal(s.records.owner.projectGridColumns, 9);
  assert.deepEqual(s.writes.map(write => write.input.projectGridColumns), [5, 9]);
  assert.equal(s.invalidations, 2);
});

test('failure retains density and an inline error through refresh/navigation; retry only writes density', async () => {
  let fail = true;
  const s = setup({ save() { if (fail) throw Error('Save unavailable'); } });
  const h = s.mount(); h.value.setColumns(5); await h.flush();
  assert.equal(h.value.columns, 5); assert.equal(h.value.saveError, 'Save unavailable');
  assert.equal(h.value.saving, false); assert.equal(s.invalidations, 0);
  h.update({ id: 'owner', projectGridColumns: 2 }); await h.flush(); assert.equal(h.value.columns, 5);
  h.dispose(); const next = s.mount(); await next.flush();
  assert.equal(next.value.columns, 5); assert.equal(next.value.saveError, 'Save unavailable');
  fail = false; next.value.retry(); await next.flush();
  assert.equal(next.value.saveError, null); assert.equal(s.records.owner.projectGridColumns, 5);
  assert.equal(s.invalidations, 1);
});

test('a newer choice supersedes an older failure and pending writes cannot bleed into another profile', async () => {
  const first = deferred();
  const s = setup({ save: (_id, _input, count) => count === 1 ? first.promise : undefined });
  const h = s.mount(); h.value.setColumns(5); h.value.setColumns(7); await h.flush();
  h.update({ ...s.records.other }); await h.flush(); assert.equal(h.value.columns, 8);
  first.reject(Error('Older write failed')); await h.flush();
  assert.equal(h.value.columns, 8); assert.equal(h.value.saveError, null);
  assert.equal(s.records.owner.projectGridColumns, 7); assert.equal(s.records.other.projectGridColumns, 8);
  h.update({ ...s.records.owner }); await h.flush();
  assert.equal(h.value.columns, 7); assert.equal(h.value.saveError, null);
});

test('canonical density refreshes when no local choice is outstanding, without saving on mount', async () => {
  const s = setup(), h = s.mount({ id: 'owner' }); await h.flush();
  assert.equal(h.value.columns, 2); assert.equal(s.writes.length, 0);
  h.update({ id: 'owner', projectGridColumns: 6 }); await h.flush();
  assert.equal(h.value.columns, 6); assert.equal(s.writes.length, 0);
  h.update(null, false); await h.flush(); assert.equal(h.value.columns, 2);
  h.value.setColumns(4); await h.flush(); assert.equal(s.writes.length, 0);
});

test('the lightweight Home writer shares the same serialized density state and persists only columns', async () => {
  const first = deferred();
  const s = setup({ lightweight: true, save: (_id, _input, count) => count === 1 ? first.promise : undefined });
  const home = s.mount(); home.value.setColumns(5); home.value.setColumns(1); await home.flush();
  home.dispose();
  const profile = s.mount({ id: 'owner', projectGridColumns: 2 }); await profile.flush();
  assert.equal(profile.value.columns, 1); assert.equal(s.writes.length, 1);
  first.resolve(); await profile.flush();
  assert.deepEqual(s.writes.map(write => write.input), [{ projectGridColumns: 5 }, { projectGridColumns: 1 }]);
  assert.equal(s.records.owner.projectGridColumns, 1); assert.equal(s.invalidations, 2);
});

test('Home and Profile density stay independent across writes, remounts and sessions', async () => {
 const saved=new Map(); const storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
 const s=setup({storage}),home=s.mount({...s.records.owner},true,'home'),profile=s.mount();
 home.value.setColumns(5);await home.flush();await profile.flush();
 assert.equal(home.value.columns,5);assert.equal(profile.value.columns,2);assert.equal(s.writes.length,0);
 profile.value.setColumns(3);await profile.flush();home.update({...s.records.owner});await home.flush();
 assert.equal(profile.value.columns,3);assert.equal(home.value.columns,5);assert.equal(s.writes.length,1);
 home.dispose();assert.equal(s.mount({...s.records.owner},true,'home').value.columns,5);
 const fresh=setup({storage,records:s.records});
 assert.equal(fresh.mount({...s.records.owner},true,'home').value.columns,5);
 assert.equal(fresh.mount({...s.records.owner}).value.columns,3);
 assert.equal(fresh.mount({...s.records.other},true,'home').value.columns,2);
});

test('drag previews update immediately without profile writes and final release saves once',async()=>{
 const s=setup(),profile=s.mount();
 for(const value of [3,4,7,9]) {profile.value.previewColumns(value);await profile.flush();}
 assert.equal(profile.value.columns,9);assert.equal(s.writes.length,0);
 profile.value.setColumns(9);await profile.flush();
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].input.projectGridColumns,9);
});
