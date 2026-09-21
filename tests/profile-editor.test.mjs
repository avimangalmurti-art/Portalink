import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const compiled = new Map();
function load(path, dependencies = {}) {
  if (!compiled.has(path)) {
    compiled.set(path, ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const exports = {};
  vm.runInNewContext(compiled.get(path), {
    exports, URL, Error,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const validation = load('../src/features/profile/validation.ts');
const profileLinks = load('../src/features/profile/profileLinks.ts', {
  '../../components/profile/categoryIcons': { profileLinkIconNames: ['globe', 'instagram'] },
});

function harness(overrides = {}, options = {}) {
  const record = {
    id: 'creator', name: 'Original Name', headline: 'Original bio', location: 'Portland',
    isPrivate: false, links: [{ label: 'Portfolio', href: 'example.com', iconName: 'globe' }],
    socialLinks: {}, ...overrides,
  };
  const slots = [];
  const effects = [];
  const writes = [];
  let cursor = 0, dirty = true, current, isOpen = true, invalidations = 0, clears = 0, reads = 0;
  const equalDeps = (before, after) => before && after && before.length === after.length
    && before.every((value, index) => Object.is(value, after[index]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => {
        const value = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; }
      }];
    },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useMemo(compute, deps) {
      const i = cursor++;
      if (!slots[i] || !equalDeps(slots[i].deps, deps)) slots[i] = { value: compute(), deps };
      return slots[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (slots[i] && equalDeps(slots[i].deps, deps)) return;
      const previous = slots[i];
      const slot = slots[i] = { deps };
      effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  const avatar = {
    avatar: null, error: null,
    clear() { avatar.avatar = null; clears++; },
  };
  const profiles = {
    async getProfile(id) { assert.equal(id, record.id); reads++; return plain(record); },
    async updateProfile(id, input) {
      writes.push({ id, input: plain(input) });
      await options.updateProfile?.(id, input);
      Object.assign(record, plain(input));
    },
  };
  const invalidateProfiles = () => { invalidations++; };
  const asyncAction = load('../src/hooks/useAsyncAction.ts', { react });
  const { useProfileEditor } = load('../src/features/profile/useProfileEditor.ts', {
    react,
    '../../contexts/ServicesContext': { useServices: () => ({ profiles }) },
    '../../contexts/ProfileDataContext': { useProfileData: () => ({ invalidateProfiles }) },
    '../../hooks/useAsyncAction': asyncAction,
    './validation': validation,
    './profileLinks': profileLinks,
    './useProfileOnboarding': { useAvatarSelection: () => avatar },
  });
  return {
    writes, record,
    get current() { return current; },
    get invalidations() { return invalidations; },
    get clears() { return clears; },
    get reads() { return reads; },
    setOpen(value) { isOpen = value; dirty = true; },
    chooseAvatar(value) { avatar.avatar = value; dirty = true; },
    async flush() {
      for (let iteration = 0; iteration < 20; iteration++) {
        if (dirty) {
          dirty = false;
          cursor = 0;
          current = useProfileEditor(record.id, isOpen);
          effects.splice(0).forEach(effect => effect());
        }
        await new Promise(resolve => setImmediate(resolve));
        if (!dirty) return current;
      }
      assert.fail('Profile editor did not settle');
    },
    async submit() { await current.submit(); return this.flush(); },
  };
}

test('bio and visibility are staged locally and saved together only on submit', async () => {
  const h = harness();
  await h.flush();
  assert.equal(h.current.phase, 'editing');
  assert.equal(h.current.isDirty, false);
  assert.equal(h.current.canSave, false);
  h.current.setField('headline', '  Updated bio  ');
  h.current.setVisibility(true);
  await h.flush();
  assert.equal(h.current.fields.headline, '  Updated bio  ');
  assert.equal(h.current.fields.isPrivate, true);
  assert.equal(h.current.isDirty, true);
  assert.equal(h.current.canSave, true);
  assert.equal(h.record.headline, 'Original bio');
  assert.equal(h.record.isPrivate, false);
  assert.equal(h.writes.length, 0);
  assert.equal(h.invalidations, 0);
  await h.submit();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].id, 'creator');
  assert.equal(h.writes[0].input.headline, 'Updated bio');
  assert.equal(h.writes[0].input.isPrivate, true);
  assert.equal(h.invalidations, 1);
  assert.equal(h.current.phase, 'saved');
});

test('visibility can be returned to public without rewriting an unchanged bio', async () => {
  const h = harness({ isPrivate: true });
  await h.flush();
  h.current.setVisibility(false);
  await h.flush();
  assert.equal(h.writes.length, 0);
  assert.equal(h.current.isDirty, true);
  await h.submit();
  assert.equal(h.writes[0].input.isPrivate, false);
  assert.equal(Object.hasOwn(h.writes[0].input, 'headline'), false);
});

test('a name-only save omits unchanged bio and privacy, preserving independent edits', async () => {
  for (const overrides of [{}, { headline: undefined, isPrivate: undefined }]) {
    const h = harness(overrides);
    await h.flush();
    assert.equal(h.current.fields.headline, h.record.headline ?? '');
    assert.equal(h.current.fields.isPrivate, false);
    h.current.setField('name', '  Updated Name  ');
    // Another profile surface may save these fields while this editor is open.
    h.record.headline = 'Independent bio';
    h.record.isPrivate = true;
    await h.flush();
    await h.submit();
    assert.equal(h.writes[0].input.name, 'Updated Name');
    for (const omitted of ['headline', 'isPrivate', 'avatar']) {
      assert.equal(Object.hasOwn(h.writes[0].input, omitted), false, `${omitted} must remain untouched`);
    }
    assert.equal(h.record.headline, 'Independent bio');
    assert.equal(h.record.isPrivate, true);
  }
});

test('an optional bio can be cleared, while the 80-character limit remains enforced', async () => {
  const cleared = harness();
  await cleared.flush();
  cleared.current.setField('headline', '   ');
  await cleared.flush();
  await cleared.submit();
  assert.equal(cleared.current.fieldErrors.headline, null);
  assert.equal(cleared.writes[0].input.headline, '');

  const limited = harness();
  await limited.flush();
  limited.current.setField('headline', 'x'.repeat(81));
  await limited.flush();
  await limited.submit();
  assert.match(limited.current.fieldErrors.headline, /80/);
  assert.equal(limited.writes.length, 0);
  limited.current.setField('headline', `  ${'x'.repeat(80)}  `);
  await limited.flush();
  assert.equal(limited.current.fieldErrors.headline, null);
  await limited.submit();
  assert.equal(limited.writes[0].input.headline, 'x'.repeat(80));
});

test('closing discards unsaved fields, visibility, avatar, validation errors and save state', async () => {
  const h = harness();
  await h.flush();
  const linkId = h.current.fields.links[0].id;
  h.current.setField('name', '');
  h.current.setField('headline', 'Unsaved bio');
  h.current.setVisibility(true);
  h.current.setProfileLink(linkId, { href: 'javascript:alert(1)' });
  h.chooseAvatar({ file: { name: 'replacement.webp' } });
  await h.flush();
  await h.submit();
  assert.ok(h.current.fieldErrors.name);
  assert.ok(h.current.linkErrors[linkId].href);
  h.setOpen(false);
  await h.flush();
  assert.equal(h.current.fields, null);
  assert.equal(h.current.profile, null);
  assert.equal(h.current.avatar.avatar, null);
  assert.equal(h.current.isDirty, false);
  assert.equal(h.current.save.status, 'idle');
  assert.deepEqual(plain(h.current.fieldErrors), {});
  assert.deepEqual(plain(h.current.linkErrors), {});
  assert.equal(h.clears, 1);
  assert.equal(h.writes.length, 0);
  h.setOpen(true);
  await h.flush();
  assert.equal(h.reads, 2);
  assert.equal(h.current.fields.name, 'Original Name');
  assert.equal(h.current.fields.headline, 'Original bio');
  assert.equal(h.current.fields.isPrivate, false);
  assert.equal(h.current.fields.links[0].href, 'example.com');
  assert.equal(h.current.isDirty, false);
  assert.equal(h.current.phase, 'editing');
});

test('a save completing after close cannot mark the next opening as saved', async () => {
  let finishSave;
  const h = harness({}, { updateProfile: () => new Promise(resolve => { finishSave = resolve; }) });
  await h.flush();
  h.current.setVisibility(true);
  await h.flush();
  const pending = h.current.submit();
  await h.flush();
  assert.equal(h.current.phase, 'saving');
  h.setOpen(false);
  await h.flush();
  h.setOpen(true);
  await h.flush();
  assert.equal(h.current.phase, 'editing');
  assert.equal(h.current.fields.isPrivate, false);
  finishSave();
  await pending;
  await h.flush();
  assert.equal(h.current.phase, 'editing');
  assert.equal(h.current.save.status, 'idle');
  assert.equal(h.current.fields.isPrivate, false);
});

test('existing name, location and link validation still prevents invalid service writes', async () => {
  const h = harness();
  await h.flush();
  for (const name of [' ', 'n'.repeat(49)]) {
    h.current.setField('name', name);
    await h.flush();
    await h.submit();
    assert.ok(h.current.fieldErrors.name);
    assert.equal(h.writes.length, 0);
  }
  h.current.setField('name', '  Valid Name  ');
  h.current.setField('location', 'l'.repeat(49));
  await h.flush();
  await h.submit();
  assert.equal(h.current.fieldErrors.name, null);
  assert.match(h.current.fieldErrors.location, /48/);
  assert.equal(h.writes.length, 0);
  h.current.setField('location', '  New City  ');
  await h.flush();
  const linkId = h.current.fields.links[0].id;
  for (const label of [' ', 'l'.repeat(49)]) {
    h.current.setProfileLink(linkId, { label });
    await h.flush();
    await h.submit();
    assert.ok(h.current.linkErrors[linkId].label);
    assert.equal(h.writes.length, 0);
  }
  h.current.setProfileLink(linkId, { label: '  My Work  ' });
  for (const href of ['', 'javascript:alert(1)', 'https://example.com/has space']) {
    h.current.setProfileLink(linkId, { href });
    await h.flush();
    await h.submit();
    assert.ok(h.current.linkErrors[linkId].href);
    assert.equal(h.writes.length, 0);
  }
  h.current.setProfileLink(linkId, { href: '  example.com/work  ' });
  await h.flush();
  await h.submit();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].input.name, 'Valid Name');
  assert.equal(h.writes[0].input.location, 'New City');
  assert.deepEqual(h.writes[0].input.links, [{ label: 'My Work', href: 'example.com/work', iconName: 'globe' }]);
  assert.deepEqual(h.writes[0].input.socialLinks, {});
});
