import { sourceModule } from './helpers/source-module.mjs';
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
const { createProfileHandle } = execute(read('src/utils/profileHandle.ts'), {require:()=>sourceModule('src/features/sharing/shareModel.ts')});
const shareModel=sourceModule('src/features/sharing/shareModel.ts');
const validation = execute(read('src/features/profile/validation.ts'),{require:()=>shareModel});
const directory = execute(read('src/data/locationDirectory.ts'), { require: () => ({ cities: [] }) });

test('automatic handles preserve full names; collision suffixes stay within thirty characters', () => {
  assert.equal(createProfileHandle('citetest'),'citetest');
  assert.equal(createProfileHandle('Avi'),'avi');
  for (const name of ['Avi', '李 明', 'Élodie Martin', 'x'.repeat(48)]) {
    const handle = createProfileHandle(name, true);
    assert.equal(validation.validateHandle(handle), null);
    assert.ok(handle.length <= 30);
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
    ProfileServiceError, createProfileHandle, validateHandle: validation.validateHandle, normalizeHandle: validation.normalizeHandle,
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
  const react = { ...React, useLayoutEffect() {}, useEffect() {}, useRef(value) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: value };
    return slots[index];
  }, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  } };
  const exports = execute(read(file), { require(dependency) {
    if (dependency.endsWith('/ServicesContext')) return {useServices:()=>({profiles:{checkPublicHandle:overrides.checkPublicHandle??(async()=> 'available')}})};
    if (dependency.endsWith('/profileHandle')) return sourceModule('src/utils/profileHandle.ts', {'../features/sharing/shareModel':shareModel});
    if (dependency === 'react') return react;
    if (dependency === 'react/jsx-runtime') return jsxRuntime;
    if (dependency === 'framer-motion') return { useReducedMotion: () => true, AnimatePresence: 'AnimatePresence', motion: { div: 'div', section: 'section' } };
    if (dependency.endsWith('/AuthContext')) return { useAuth: () => ({ user: { id: 'account', isEmailVerified: true } }) };
    if (dependency.endsWith('/publicAppearance')) return { DEFAULT_PUBLIC_APPEARANCE: { accentColor: '#0A84FF', systemGray: 'gray6', mode: 'auto' } };
    if (dependency.endsWith('/validation')) return validation;
    if (dependency.endsWith('/data/cities')) return execute(read('src/data/cities.ts'));
    if (dependency.endsWith('/data/countryCodes')) return execute(read('src/data/countryCodes.ts'));
    if (dependency.endsWith('/data/locationDirectory')) return directory;
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

test('the directory picker preserves custom text and applies only explicit choices within the profile limit', () => {
  let value = 'Existing location outside catalogue';
  const render = component('src/components/profile/ProfileLocationPicker.tsx', 'ProfileLocationPicker', {
    id: 'location', value, onChange: next => { value = next; },
  });
  let tree = nodes(render()).find(node=>node.type==='LocationSearch');
  assert.equal(tree.type, 'LocationSearch');
  assert.equal(tree.props.label, 'Location (optional)');
  assert.equal(tree.props.value, value);
  assert.equal(tree.props.maxLength, validation.LOCATION_MAX_LENGTH);
  assert.equal(value, 'Existing location outside catalogue', 'Rendering never normalizes or overwrites saved text.');
  const city = { id: 'gn-1', kind: 'city', name: 'San Francisco', countryCode: 'US', regionName: 'California', uniqueInCountry: true };
  assert.equal(tree.props.canSelect(city), true);
  tree.props.onSelect(city);
  assert.equal(value, 'San Francisco, California, US');
  assert.equal(validation.validateLocation(value), null);
  const long = { ...city, name: 'x'.repeat(49) };
  assert.equal(tree.props.canSelect(long), false);
  tree.props.onSelect(long);
  assert.equal(value, 'San Francisco, California, US', 'An over-limit choice is rejected, never truncated.');
  tree.props.onChange('A custom location');
  assert.equal(value, 'A custom location');
  tree.props.onChange(''); assert.equal(value, '');
  tree = nodes(render({value})).find(node=>node.type==='LocationSearch');
  assert.equal(tree.props.value, '');
  const disabled = nodes(render({ disabled: true, error: 'Use 48 characters or fewer.' })).find(node=>node.type==='LocationSearch');
  assert.equal(disabled.props.disabled, true);
  assert.equal(disabled.props.error, 'Use 48 characters or fewer.');
});

test('setup collects name, handle and location without a photo picker or hidden field requirements', async () => {
  for (const presentation of ['web', 'mobile']) {
  let submitted;
  const render = component('src/features/profile/ProfileOnboardingDialog.tsx', 'ProfileOnboardingDialog', { isOpen: true, accentColor: '#0A84FF', onAccentColorChange() {}, onDismiss() {}, onComplete() {} }, {
    presentation,
    useAvatarSelection: () => ({ avatar: null, error: null, select() {}, clear() {} }),
    useCreateProfile: () => ({ status: 'idle', isLoading: false, run: async (input) => { submitted = input; } }),
  });
  let tree = render();
  const fields = nodes(tree).filter((node) => node.type === 'ProfileField');
  assert.deepEqual(fields.map((node) => node.props.label), ['Profile name', 'Public handle']);
  assert.equal(find(tree, node => node.props.id === 'onboarding-location').type, 'ProfileLocationPicker');
  assert.equal(fields[0].props.required, presentation === 'mobile');
  assert.equal(find(tree, (node) => node.type === 'AvatarPicker'),undefined);
  assert.equal(nodes(tree).some(node=>node.type==='input'&&node.props.type==='file'),false);
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
  assert.equal(submitted, undefined, 'first press checks and displays the final handle');
  tree = render();
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(submitted.name, 'Avi');
  assert.equal(submitted.location, 'San Francisco');
  assert.equal(submitted.isPrivate, presentation === 'mobile');
  assert.equal(submitted.handle, 'avi');
  assert.equal(submitted.avatar,undefined);
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

test('profile setup explicitly opts both platforms into the new surface and retains native form submission',()=>{
 for(const presentation of ['mobile','web']){
  const create={status:'idle',isLoading:false,createdProfile:null,run:async()=>{}};
  const render=component('src/features/profile/ProfileOnboardingDialog.tsx','ProfileOnboardingDialog',{isOpen:true,theme:'light',accentColor:'#0A84FF',onAccentColorChange(){},onDismiss(){},onComplete(){}},{presentation,useAvatarSelection:()=>({avatar:null,error:null,select(){},clear(){}}),useCreateProfile:()=>create});
  let tree=render();assert.equal(tree.type,'AccountWelcomeSurface');assert.equal(tree.props.profileSetup,true);assert.equal(tree.props.title,'Create your profile');assert.equal(tree.props.theme,'light');
  assert.equal(tree.props.showAppearance,presentation==='web');assert.equal(tree.props.busy,false);
  const form=find(tree,node=>node.type==='form');assert.equal(typeof form.props.onSubmit,'function');assert.equal(form.props.noValidate,true);
  assert.equal(find(form,node=>node.type==='AvatarPicker'),undefined);assert.equal(nodes(form).some(node=>node.type==='input'&&node.props.type==='file'),false);assert.equal(nodes(form).some(node=>node.props.children==='Add picture later'),false);assert.ok(find(form,node=>node.props.id==='onboarding-name'));assert.ok(find(form,node=>node.props.id==='onboarding-handle'));assert.ok(find(form,node=>node.props.id==='onboarding-location'));
  const action=find(form,node=>node.type===(presentation==='mobile'?'MobileOnboardingAction':'Button'));assert.ok(action,'The submit action remains within its real form.');assert.equal(action.props.children,'Continue');
  if(presentation==='web')assert.equal(action.props.type,'submit');
  create.status='success';create.createdProfile={id:'created',name:'Creator'};tree=render();
  assert.equal(tree.props.title,presentation==='mobile'?'Finishing setup':'Profile ready');assert.equal(find(tree,node=>node.type==='form'),undefined);
  if(presentation==='mobile')assert.ok(nodes(tree).some(node=>node.props.role==='status'&&node.props.children==='Finishing setup…'));
  else assert.ok(nodes(tree).some(node=>node.props.children==='Your profile is ready.'));
 }
});

test('profile setup checks the handle before creating once and permits retry after a refused completion',async()=>{
 for(const presentation of ['mobile','web']){
  let handleChecks=0,finish;const submissions=[];
  const create={status:'idle',isLoading:false,createdProfile:null,run:input=>{submissions.push(input);return new Promise(resolve=>finish=resolve);}};
  const render=component('src/features/profile/ProfileOnboardingDialog.tsx','ProfileOnboardingDialog',{isOpen:true,accentColor:'#0A84FF',onAccentColorChange(){},onDismiss(){},onComplete(){}},{presentation,checkPublicHandle:async()=>{handleChecks++;return 'available';},useAvatarSelection:()=>({avatar:null,error:null,select(){},clear(){}}),useCreateProfile:()=>create});
  find(render(),node=>node.props.id==='onboarding-name').props.onChange('New Creator');
  await find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(handleChecks,1);assert.equal(submissions.length,0);
  let tree=render();assert.ok(nodes(tree).some(node=>node.props.role==='status'&&String(node.props.children).includes('newcreator')));
  const submit=find(tree,node=>node.type==='form').props.onSubmit;
  const pending=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(submissions.length,1);
  finish();await pending;create.status='error';create.error='Please try again';tree=render();
  assert.ok(find(tree,node=>node.props.role==='alert'));
  const retry=find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(submissions.length,2);assert.equal(handleChecks,1);assert.equal(submissions[1].handle,'newcreator');finish();await retry;
 }
});

test('profile setup busy presentation retains authored fields and location without enabling submission or photo selection',async()=>{
 for(const presentation of ['mobile','web']){
  let writes=0;
  const create={status:'idle',isLoading:false,createdProfile:null,run:async()=>writes++};
  const render=component('src/features/profile/ProfileOnboardingDialog.tsx','ProfileOnboardingDialog',{isOpen:true,accentColor:'#0A84FF',onAccentColorChange(){},onDismiss(){},onComplete(){}},{presentation,useAvatarSelection:()=>({avatar:null,error:null,select(){},clear(){}}),useCreateProfile:()=>create});
  find(render(),node=>node.props.id==='onboarding-name').props.onChange('Retained creator');find(render(),node=>node.props.id==='onboarding-location').props.onChange('A custom place');
  create.isLoading=true;const tree=render(),form=find(tree,node=>node.type==='form');
  assert.equal(tree.props.busy,true);assert.equal(find(form,node=>node.type==='AvatarPicker'),undefined);assert.equal(nodes(form).some(node=>node.type==='input'&&node.props.type==='file'),false);
  for(const id of ['onboarding-name','onboarding-handle','onboarding-location'])assert.equal(find(form,node=>node.props.id===id).props.disabled,true);
  assert.equal(find(form,node=>node.props.id==='onboarding-name').props.value,'Retained creator');assert.equal(find(form,node=>node.props.id==='onboarding-location').props.value,'A custom place');
  if(presentation==='mobile')assert.equal(find(form,node=>node.type==='ProfileVisibilityField').props.disabled,true);
  else assert.equal(find(form,node=>node.type==='Button').props.disabled,true);
  await form.props.onSubmit({preventDefault(){}});assert.equal(writes,0);
 }
});
