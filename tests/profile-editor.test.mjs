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

test('visibility is staged locally and saved only on submit; Bio is not part of Edit profile', async () => {
  const h = harness();
  await h.flush();
  assert.equal(h.current.phase, 'editing');
  assert.equal(h.current.isDirty, false);
  assert.equal(h.current.canSave, false);
  h.current.setVisibility(true);
  await h.flush();
  assert.equal(Object.hasOwn(h.current.fields, 'headline'), false);
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
  assert.equal(Object.hasOwn(h.writes[0].input, 'headline'), false);
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
    assert.equal(Object.hasOwn(h.current.fields, 'headline'), false);
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

test('existing Bio text cannot block saving unrelated profile fields', async () => {
  const h = harness({ headline: 'x'.repeat(81) });
  await h.flush(); h.current.setField('name', 'Updated Name'); await h.flush(); await h.submit();
  assert.deepEqual(h.writes[0].input, { name: 'Updated Name' });
  assert.equal(h.record.headline, 'x'.repeat(81));
});

test('closing discards unsaved fields, visibility, avatar, validation errors and save state', async () => {
  const h = harness();
  await h.flush();
  const linkId = h.current.fields.links.find(link => !link.action).id;
  h.current.setField('name', '');
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
  assert.equal(h.record.headline, 'Original bio');
  assert.equal(h.current.fields.isPrivate, false);
  assert.equal(h.current.fields.links.find(link => !link.action).href, 'example.com');
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
  const linkId = h.current.fields.links.find(link => !link.action).id;
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
  assert.deepEqual(h.writes[0].input.links.filter(link => !link.action), [{ label: 'My Work', href: 'example.com/work', iconName: 'globe' }]);
  assert.deepEqual(h.writes[0].input.socialLinks, {});
});

test('failed profile save keeps edits for retry and only confirms persisted values on reopen', async () => {
  let fail=true; const h=harness({}, {updateProfile:async()=>{if(fail)throw Error('Save denied');}});
  await h.flush(); h.current.setField('name','Saved name'); h.current.setField('location','Saved city'); h.current.setVisibility(true);
  await h.flush(); await h.submit(); assert.equal(h.current.phase,'failed'); assert.equal(h.invalidations,0);
  assert.equal(h.current.fields.name,'Saved name'); assert.equal(h.record.name,'Original Name');
  fail=false; await h.submit(); assert.equal(h.current.phase,'saved'); assert.equal(h.invalidations,1);
  h.setOpen(false); await h.flush(); h.setOpen(true); await h.flush();
  assert.equal(h.current.fields.name,'Saved name'); assert.equal(h.current.fields.location,'Saved city'); assert.equal(h.current.fields.isPrivate,true);
});

test('standard profile actions default on without dirtying new or legacy links on a name-only save', async () => {
  for (const overrides of [
    { links: [], socialLinks: {} },
    { links: undefined, socialLinks: { instagram: 'instagram.com/creator' } },
    {},
  ]) {
    const h = harness(overrides);
    const originalLinks = h.record.links === undefined ? undefined : plain(h.record.links);
    const originalSocialLinks = plain(h.record.socialLinks);
    await h.flush();
    const actions = h.current.fields.links.filter(link => link.action);
    assert.deepEqual(plain(actions.map(link => link.action)), ['bio', 'collaboration', 'message']);
    assert.ok(actions.every(link => link.hidden === false));
    assert.equal(h.current.isDirty, false);
    assert.equal(h.current.canSave, false);
    assert.equal(h.writes.length, 0);
    h.current.setField('name', 'Updated Name');
    await h.flush();
    await h.submit();
    assert.deepEqual(h.writes[0].input, { name: 'Updated Name' });
    assert.deepEqual(h.record.links, originalLinks);
    assert.deepEqual(h.record.socialLinks, originalSocialLinks);
  }
});

test('removing every standard action persists hidden records and reopening does not restore them', async () => {
  const h = harness();
  await h.flush();
  for (const action of h.current.fields.links.filter(link => link.action)) {
    h.current.removeProfileLink(action.id);
  }
  await h.flush();
  assert.equal(h.current.isDirty, true);
  assert.equal(h.writes.length, 0);
  await h.submit();
  const savedActions = h.record.links.filter(link => link.action);
  assert.deepEqual(savedActions.map(link => [link.action, link.hidden]), [
    ['bio', true], ['collaboration', true], ['message', true],
  ]);
  assert.ok(savedActions.every(link => !Object.hasOwn(link, 'id')));
  assert.deepEqual(h.record.links.filter(link => !link.action), [
    { label: 'Portfolio', href: 'example.com', iconName: 'globe' },
  ]);
  h.setOpen(false); await h.flush(); h.setOpen(true); await h.flush();
  assert.equal(h.current.fields.links.filter(link => link.action && !link.hidden).length, 0);
  assert.equal(h.current.fields.links.filter(link => link.action).length, 3);
  assert.equal(h.current.isDirty, false);
  assert.equal(h.current.canSave, false);
});

test('restoring and reordering a standard action saves its position without reviving other removed actions', async () => {
  const h = harness({ links: [
    { action: 'bio', label: 'Bio', href: '', hidden: true },
    { action: 'collaboration', label: 'Collaboration', href: '', hidden: true },
    { action: 'message', label: 'Message', href: '', hidden: true },
    { label: 'Portfolio', href: 'example.com', iconName: 'globe' },
  ] });
  await h.flush();
  const message = h.current.fields.links.find(link => link.action === 'message');
  const portfolio = h.current.fields.links.find(link => !link.action);
  h.current.setProfileLink(message.id, { hidden: false });
  h.current.reorderProfileLinks([portfolio.id, message.id]);
  await h.flush();
  await h.submit();
  assert.deepEqual(h.record.links.filter(link => !link.hidden).map(link => link.action ?? link.href), [
    'example.com', 'message',
  ]);
  assert.deepEqual(h.record.links.filter(link => link.hidden).map(link => link.action), ['bio', 'collaboration']);
  h.setOpen(false); await h.flush(); h.setOpen(true); await h.flush();
  assert.deepEqual(plain(h.current.fields.links.filter(link => !link.hidden).map(link => link.action ?? link.href)), [
    'example.com', 'message',
  ]);
  assert.deepEqual(plain(h.current.fields.links.filter(link => link.hidden).map(link => link.action)), ['bio', 'collaboration']);
  assert.equal(h.current.isDirty, false);
});

test('twenty external links coexist with all three standard actions and survive action edits', async () => {
  const links = Array.from({ length: 20 }, (_, index) => ({
    label: `Website ${index + 1}`, href: `https://example.com/${index + 1}`, iconName: 'globe',
  }));
  const h = harness({ links });
  await h.flush();
  assert.equal(h.current.fields.links.length, 23);
  assert.equal(h.current.fields.links.filter(link => link.action).length, 3);
  assert.equal(h.current.addProfileLink(), null);
  h.current.removeProfileLink(h.current.fields.links.find(link => link.action === 'bio').id);
  await h.flush();
  assert.equal(h.current.addProfileLink(), null, 'Removing a standard action does not add an external-link slot');
  await h.submit();
  assert.deepEqual(h.record.links.filter(link => !link.action), links);
  assert.equal(h.record.links.filter(link => link.action).length, 3);
  h.setOpen(false); await h.flush(); h.setOpen(true); await h.flush();
  assert.deepEqual(plain(h.current.fields.links.filter(link => !link.action).map(({ id, ...link }) => link)), links);
  assert.equal(h.current.fields.links.find(link => link.action === 'bio').hidden, true);
  assert.equal(h.current.addProfileLink(), null);
});

test('unknown action metadata cannot bypass external-link URL validation', async () => {
  const h = harness({ links: [
    { action: 'unknown-action', hidden: true, label: 'Untrusted link', href: 'javascript:alert(1)' },
  ] });
  await h.flush();
  const link = h.current.fields.links.find(item => item.label === 'Untrusted link');
  assert.ok(link);
  assert.equal(Object.hasOwn(link, 'action'), false);
  assert.equal(Object.hasOwn(link, 'hidden'), false);
  h.current.setField('name', 'Updated Name');
  await h.flush();
  await h.submit();
  assert.ok(h.current.linkErrors[link.id].href);
  assert.equal(h.writes.length, 0);
  h.current.setProfileLink(link.id, { href: 'https://example.com/safe' });
  await h.flush();
  await h.submit();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].input.links.filter(item => !item.action), [
    { label: 'Untrusted link', href: 'https://example.com/safe', iconName: 'globe' },
  ]);
});
