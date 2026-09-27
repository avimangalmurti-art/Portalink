import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function execute(source, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, { exports, crypto, File, ...globals });
  return exports;
}
const { createProfileHandle } = execute(read('src/utils/profileHandle.ts'));
const validation = execute(read('src/features/profile/validation.ts'));

test('automatic handles support duplicate, long and non-ASCII names within the existing format', () => {
  const handles = new Set();
  for (const name of ['Avi', 'Avi', '李 明', 'Élodie Martin', '_Person', 'x'.repeat(48)]) {
    const handle = createProfileHandle(name);
    assert.equal(validation.validateHandle(handle), null);
    assert.match(handle, /^[a-z0-9][a-z0-9._-]{1,19}$/);
    assert.equal(handles.has(handle), false);
    handles.add(handle);
  }
});

function creationService(errors = []) {
  const file = ts.createSourceFile('contentServices.ts', read('src/services/supabase/contentServices.ts'), ts.ScriptTarget.Latest, true);
  let method;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'supabaseProfileService') {
      method = node.initializer.properties.find((item) => item.name?.getText(file) === 'createProfile').getText(file);
    } else ts.forEachChild(node, visit);
  }
  visit(file);
  const inserts = [];
  let uploads = 0;
  const chain = {
    insert(data) { inserts.push(data); return chain; }, select() { return chain; },
    async single() { return { data: { id: 'new-profile' }, error: errors.shift() ?? null }; },
  };
  class ProfileServiceError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const { service } = execute(`exports.service = { ${method} }`, {
    ProfileServiceError, createProfileHandle, normalizeHandle: validation.normalizeHandle,
    uploadAvatar: async () => { uploads++; return 'https://example.test/avatar.webp'; },
    requireSupabase: () => ({ from: () => chain }),
    throwProfileError: (error) => { throw new ProfileServiceError('network', error.message); },
  });
  service.getProfile = async () => ({ id: 'new-profile' });
  return { service, inserts, uploads: () => uploads };
}
test('profile creation accepts only the visible setup fields and preserves location and avatar', async () => {
  const h = creationService();
  await h.service.createProfile('account', { name: '  Avi  ', location: ' San Francisco ' });
  assert.equal(h.inserts[0].name, 'Avi');
  assert.equal(h.inserts[0].headline, '');
  assert.equal(h.inserts[0].location, 'San Francisco');
  assert.equal(h.inserts[0].avatar_url, 'https://example.test/avatar.webp');
  assert.equal(h.inserts[0].account_id, 'account');
  assert.equal(validation.validateHandle(h.inserts[0].handle), null);
});
test('automatic handle collision retries use a new handle and upload the avatar only once', async () => {
  const h = creationService([{ code: '23505', message: 'duplicate key violates profiles_handle_key' }]);
  await h.service.createProfile('account', { name: 'Avi', avatar: {} });
  assert.equal(h.inserts.length, 2);
  assert.notEqual(h.inserts[0].handle, h.inserts[1].handle);
  assert.equal(h.uploads(), 1);
});

test('visibility is written on the initial insert and retained during handle retries', async () => {
  for (const isPrivate of [undefined, false, true]) {
    const h = creationService([{ code: '23505', message: 'duplicate key violates profiles_handle_key' }]);
    await h.service.createProfile('account', { name: 'Creator', isPrivate });
    assert.equal(h.inserts.length, 2);
    for (const row of h.inserts) assert.equal(row.is_private, isPrivate === true);
  }
});
test('explicit handles/headlines survive and duplicate accounts are not retried as handle collisions', async () => {
  const h = creationService();
  await h.service.createProfile('account', { name: 'Avi', handle: '@existing', headline: 'Existing headline' });
  assert.equal(h.inserts[0].handle, 'existing');
  assert.equal(h.inserts[0].headline, 'Existing headline');
  for (const [constraint, input] of [
    ['profiles_account_id_key', { name: 'Avi' }],
    ['profiles_handle_key', { name: 'Avi', handle: 'existing' }],
  ]) {
    const failure = creationService([{ code: '23505', message: `duplicate key violates ${constraint}` }]);
    await assert.rejects(failure.service.createProfile('account', input));
    assert.equal(failure.inserts.length, 1);
  }
});
test('missing name is rejected before uploading or writing', async () => {
  const h = creationService();
  await assert.rejects(h.service.createProfile('account', { name: ' ' }));
  assert.equal(h.uploads(), 0);
  assert.equal(h.inserts.length, 0);
});

function component(file, name, props, overrides = {}) {
  const slots = [];
  let cursor = 0;
  const react = { ...React, useEffect() {}, useRef(value) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: value };
    return slots[index];
  }, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  } };
  const exports = execute(read(file), { require(dependency) {
    if (dependency === 'react') return react;
    if (dependency === 'react/jsx-runtime') return jsxRuntime;
    if (dependency === 'framer-motion') return { useReducedMotion: () => true, AnimatePresence: 'AnimatePresence', motion: { div: 'div', section: 'section' } };
    if (dependency.endsWith('/AuthContext')) return { useAuth: () => ({ user: { id: 'account', isEmailVerified: true } }) };
    if (dependency.endsWith('/publicAppearance')) return { DEFAULT_PUBLIC_APPEARANCE: { accentColor: '#0A84FF', systemGray: 'gray6', mode: 'auto' } };
    if (dependency.endsWith('/validation')) return validation;
    if (dependency.endsWith('/data/cities')) return execute(read('src/data/cities.ts'));
    if (dependency.endsWith('/data/countryCodes')) return execute(read('src/data/countryCodes.ts'));
    if (dependency.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (dependency.endsWith('/useProfileOnboarding')) return overrides;
    if (dependency.endsWith('/usePresentation')) return { usePresentation: () => overrides.presentation ?? 'web' };
    if (dependency.endsWith('/imageMetadata')) return { imageDimensionsLabel: () => '', imageResolutionNotice: () => null };
    return new Proxy({}, { get: (_, key) => key });
  } });
  return (changes = {}) => { cursor = 0; return exports[name]({ ...props, ...changes }); };
}
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)]; }
const find = (tree, predicate) => nodes(tree).find(predicate);

test('account details collapse without reserving content and selection stays an accessible accent-only radio', () => {
  let chosen = false;
  const render = component('src/components/profile/ProfileVisibilityField.tsx', 'ProfileVisibilityField', {
    id: 'visibility', isPrivate: false, collapsible: true, onChange: value => { chosen = value; },
  });
  let tree = render();
  assert.equal(find(tree, node => node.type === 'p'), undefined);
  assert.equal(tree.props['aria-describedby'], undefined);
  assert.equal(find(tree, node => node.type === 'button').props['aria-expanded'], false);
  const radios = nodes(tree).filter(node => node.type === 'input');
  assert.equal(radios.length, 2);
  assert.ok(radios.every(node => node.props.type === 'radio' && node.props.className === 'sr-only'));
  radios[1].props.onChange();
  tree = render({isPrivate: chosen});
  assert.equal(nodes(tree).filter(node => node.type === 'input')[1].props.checked, true);
  find(tree, node => node.type === 'button').props.onClick();
  tree = render({isPrivate: chosen});
  assert.equal(tree.props['aria-describedby'], 'visibility-hint');
  assert.match(React.Children.toArray(find(tree, node => node.type === 'p').props.children).join(''), /Only you and approved followers/);
  find(tree, node => node.type === 'button').props.onClick();
  assert.equal(find(render({isPrivate: chosen}), node => node.type === 'p'), undefined);
  assert.ok(find(render({collapsible: false}), node => node.type === 'p'), 'Existing non-collapsible presentation remains available.');
});

test('native location choices preserve optional data and reset dependent city only on explicit changes', () => {
  let value = '';
  const render = component('src/components/profile/ProfileLocationPicker.tsx', 'ProfileLocationPicker', {
    id: 'location', value, onChange: next => { value = next; },
  });
  const selects = tree => nodes(tree).filter(node => node.type === 'select');
  let tree = render();
  assert.deepEqual(nodes(tree).filter(node => node.type === 'label').map(node => node.props.children), ['Country (optional)', 'City (optional)']);
  assert.equal(selects(tree)[1].props.disabled, true);
  selects(tree)[0].props.onChange({target: {value: 'US'}});
  tree = render({value});
  assert.equal(selects(tree)[0].props.value, 'US');
  assert.ok(nodes(selects(tree)[1]).some(node => node.props.value === 'San Francisco'));
  assert.ok(!nodes(selects(tree)[1]).some(node => node.props.value === 'London'));
  selects(tree)[1].props.onChange({target: {value: 'San Francisco'}});
  assert.equal(value, 'San Francisco, US');
  assert.equal(validation.validateLocation(value), null);
  selects(render({value}))[0].props.onChange({target: {value: 'GB'}});
  tree = render({value});
  assert.equal(selects(tree)[1].props.value, '');
  assert.ok(nodes(selects(tree)[1]).some(node => node.props.value === 'London'));
  selects(tree)[0].props.onChange({target: {value: ''}});
  assert.equal(value, '');
  value = 'Existing location outside catalogue';
  tree = render({value});
  assert.equal(value, 'Existing location outside catalogue', 'Rendering must never overwrite legacy/free-text values.');
  assert.ok(find(tree, node => node.props.id === 'location-current'));
  find(tree, node => node.type === 'button').props.onClick();
  assert.equal(value, '');
  assert.ok(selects(render({disabled: true})).every(node => node.props.disabled));
});

test('setup exposes large image selection, name and location and submits without hidden field requirements', async () => {
  for (const presentation of ['web', 'mobile']) {
  let submitted;
  const render = component('src/features/profile/ProfileOnboardingDialog.tsx', 'ProfileOnboardingDialog', { isOpen: true, accentColor: '#0A84FF', onAccentColorChange() {}, onDismiss() {}, onComplete() {} }, {
    presentation,
    useAvatarSelection: () => ({ avatar: null, error: null, select() {}, clear() {} }),
    useCreateProfile: () => ({ status: 'idle', isLoading: false, run: async (input) => { submitted = input; } }),
  });
  let tree = render();
  const fields = nodes(tree).filter((node) => node.type === 'ProfileField');
  assert.deepEqual(fields.map((node) => node.props.label), presentation === 'mobile' ? ['Profile name'] : ['Profile name', 'Where are you from?']);
  assert.equal(fields[0].props.required, presentation === 'mobile');
  assert.equal(find(tree, (node) => node.type === 'AvatarPicker').props.presentation, presentation === 'mobile' ? 'onboarding' : 'featured');
  assert.equal(nodes(tree).some((node) => String(node.props?.children).includes('Signed in as')), false);
  await find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(submitted, undefined);
  fields[0].props.onChange('Avi');
  find(tree, node => node.props.id === 'onboarding-location').props.onChange('San Francisco');
  const visibility = find(tree, node => node.type === 'ProfileVisibilityField');
  assert.equal(Boolean(visibility), presentation === 'mobile');
  visibility?.props.onChange(true);
  tree = render();
  await find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(submitted.name, 'Avi');
  assert.equal(submitted.location, 'San Francisco');
  assert.equal(submitted.isPrivate, presentation === 'mobile');
  assert.equal('handle' in submitted, false);
  assert.equal('headline' in submitted, false);
  }
});
test('featured image selection keeps replace, remove and crop save while compact editing remains 40px', () => {
  const selections = [];
  let cleared = false;
  const pending = { file: new File(['image'], 'image.png'), previewUrl: 'blob:preview', fileName: 'image.png', sizeBytes: 5 };
  const render = component('src/components/profile/AvatarPicker.tsx', 'AvatarPicker', {
    presentation: 'featured', pending, error: null, onSelect: (...args) => selections.push(args), onClear: () => { cleared = true; },
  });
  let tree = render();
  const preview = find(tree, (node) => node.type === 'ResponsiveImage');
  assert.equal(preview.props.width, 144);
  assert.equal(find(tree, (node) => node.props?.children === 'Replace'), undefined);
  find(tree, (node) => node.props?.children === 'Reposition').props.onClick();
  tree = render();
  const crop = { x: 0.2, y: 0.2, width: 0.5, height: 0.5, zoom: 2 };
  find(tree, (node) => node.type === 'ImageRepositionDialog').props.onSave({ blob: new Blob(['crop'], { type: 'image/webp' }), crop });
  assert.equal(selections[0][1].originalSource, pending.file);
  assert.equal(selections[0][1].crop, crop);
  find(tree, (node) => node.props?.children === 'Remove').props.onClick();
  assert.equal(cleared, true);
  const compact = render({ presentation: 'compact' });
  assert.equal(find(compact, (node) => node.type === 'ResponsiveImage').props.width, 40);
});
