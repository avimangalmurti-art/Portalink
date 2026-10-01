import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function execute(code, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText,
    { exports, crypto, File, Blob, URL, ...globals, require(name) { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; } });
  return exports;
}
const load = (path, imports, globals) => execute(source(path), imports, globals);
const shareModel = load('src/features/sharing/shareModel.ts');
const validation = load('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel });
const registration = load('src/features/auth/registration.ts', { '../profile/validation': validation, '../sharing/shareModel': shareModel });
const authTypes = load('src/types/auth.ts');
const id = 'bf9c6b61-ac26-432c-9a9e-ebf55721cfff';
const draft = { version: 1, id, name: '  Example Creator  ', location: '  City  ', accentColor: '#0A84FF', hasAvatar: false };
const session = (account = 'a', extra = {}) => ({ user: { id: account, isEmailVerified: true, profileId: '', registration: draft, ...extra } });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('shared registration return paths survive confirmation without persisting tokens or allowing redirects', () => {
  for (const path of ['/share/creator?view=portals', '/share/creator/c/portal', '/share/creator/c/portal/project?page=2&media=image-1']) {
    assert.equal(registration.readSharedReturnPath(path), path);
    const saved = JSON.parse(JSON.stringify({...draft, returnPath:path}));
    assert.equal(registration.readRegistrationProfile(saved).returnPath, path);
  }
  for (const path of ['https://example.test/share/a', '//example.test/share/a', '/share/a/../../messages', '/share/%2e%2e', '/share/a\\b', '/messages', '/p/a', null, 2]) {
    assert.equal(registration.readSharedReturnPath(path), undefined);
    assert.equal(registration.readRegistrationProfile({...draft, returnPath:path}).returnPath, undefined);
  }
  assert.equal(registration.readSharedReturnPath('/share/a?code=private&access_token=private&next=https://example.test&view=portals#access_token=private'), '/share/a?view=portals');
});

test('landing signup preserves a destination once, cancellation clears it and ordinary gates still sign in', async () => {
  const hooks = hookRuntime();
  const {AuthProvider} = load('src/contexts/AuthContext.tsx', {
    react: hooks.react, './ServicesContext': {useServices: () => ({auth:{getSession:async()=>null,onAuthStateChange:()=>()=>{}}})}, '../types/auth': authTypes,
    '../utils/passwordRecoveryReturn': {isPasswordRecoveryReturn: () => false, clearPasswordRecoveryReturn() {}},
  }, {window:{location:{href:'http://example.test'}},document:{activeElement:null},HTMLElement:class{}});
  const render = () => hooks.render(() => AuthProvider({children:null})).props.value;
  render(); await tick();
  const intent = {kind:'route',path:'/share/a/c/b/c',label:'view shared content'};
  render().requestAuthenticatedDestination(intent, 'signUp');
  assert.equal(render().pendingView,'signUp'); assert.equal(render().gateMessage,null);
  render().closeAuth(); assert.equal(render().consumePendingIntent(),null);
  render().requestAuthenticatedDestination(intent, 'signUp');
  assert.equal(render().consumePendingIntent(),intent); assert.equal(render().consumePendingIntent(),null);
  render().requestAuthenticatedDestination(intent);
  assert.equal(render().pendingView,'signIn');
  render().closeAuth();
  render().requestAuthenticatedDestination(intent, 'forgotPassword');
  assert.equal(render().pendingView,'forgotPassword'); assert.equal(render().gateMessage,null);
  render().requestAuth('signIn');
  assert.equal(render().peekPendingIntent(),intent, 'returning from password help retains the shared destination');
});

test('registration metadata is normalized and never becomes an ownership or verification claim', () => {
  const value = registration.readRegistrationProfile({ ...draft, accountId: 'victim', profileId: 'victim-profile', isEmailVerified: true });
  assert.equal(value.name, 'Example Creator');
  assert.equal(value.location, 'City');
  assert.equal(value.accountId, undefined);
  assert.equal(value.profileId, undefined);
  assert.equal(value.isEmailVerified, undefined);
  assert.equal(value.isPrivate, false, 'Older registration drafts retain their Public default.');
  for (const isPrivate of [false, true]) {
    const saved = registration.readRegistrationProfile(JSON.parse(JSON.stringify({ ...draft, isPrivate })));
    assert.equal(saved.isPrivate, isPrivate);
  }
  for (const change of [{version: 2}, {id: 'bad'}, {name: ''}, {location: 8}, {accentColor: 'url(unsafe)'}, {hasAvatar: 'yes'}, {isPrivate: 'false'}, {isPrivate: null}]) {
    assert.equal(registration.readRegistrationProfile({ ...draft, ...change }), undefined);
  }
});

test('automatic setup waits for verification and never interrupts recovery or existing profiles', () => {
  assert.equal(registration.canResumeRegistration(session(), 'signUp'), true);
  for (const [value, view] of [[null, null], [session('a', {isEmailVerified: false}), null], [session('a', {profileId: 'p'}), null], [session('a', {registration: undefined}), null], [{...session(), isPasswordRecovery: true}, null], [session(), 'resetPassword'], [session(), 'forgotPassword']]) {
    assert.equal(registration.canResumeRegistration(value, view), false);
  }
});

function creationHarness({ existing = null, uncertain = false, failure = false } = {}) {
  let current = session(), row = existing, inserts = 0;
  const services = {
    auth: { async getSession() { return current; } },
    profiles: { async getProfileForAccount() { return row; }, async createProfile() {
      inserts++;
      if (failure) throw new Error('temporary failure');
      row = {id: 'new-profile', avatar: 'saved.webp'};
      if (uncertain) throw new Error('response lost after commit');
      return {profile: row, avatarPersisted: true};
    } },
  };
  return { services, inserts: () => inserts, switchAccount: () => { current = session('b'); } };
}

test('completion reuses existing profiles and reconciles uncertain inserts without creating twice', async () => {
  for (const options of [{}, {uncertain: true}, {existing: {id: 'existing', avatar: 'kept.webp'}}]) {
    const h = creationHarness(options);
    const first = await registration.createOrResumeProfile(h.services, 'a', {name: 'Creator'});
    const second = await registration.createOrResumeProfile(h.services, 'a', {name: 'Changed draft'});
    assert.equal(first.profile.id, second.profile.id);
    assert.equal(h.inserts(), options.existing ? 0 : 1);
    if (options.existing) assert.equal(second.profile.avatar, 'kept.webp');
  }
  const h = creationHarness({failure: true});
  await assert.rejects(registration.createOrResumeProfile(h.services, 'a', {name: 'Creator'}), /temporary failure/);
});

test('account changes and password recovery prevent profile completion', async () => {
  const h = creationHarness();
  h.services.profiles.getProfileForAccount = async () => { h.switchAccount(); return {id: 'old-profile'}; };
  await assert.rejects(registration.createOrResumeProfile(h.services, 'a', {name: 'Creator'}), /Sign in to this account/);
  assert.equal(h.inserts(), 0);
  h.services.auth.getSession = async () => ({...session(), isPasswordRecovery: true});
  await assert.rejects(registration.createOrResumeProfile(h.services, 'a', {name: 'Creator'}), /Sign in to this account/);
});

test('avatar retries reuse identical bytes without overwriting a different completed selection', async () => {
  const file = ts.createSourceFile('contentServices.ts', source('src/services/supabase/contentServices.ts'), ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'uploadAvatar');
  const paths = [];
  const { uploadAvatar } = execute(`${fn.getText(file)}\nexports.uploadAvatar = uploadAvatar`, {}, {
    AVATAR_BUCKET: 'avatars', safeFileName: value => value,
    requireSupabase: () => ({storage: {from: () => ({ upload: async path => { paths.push(path); return {}; }, getPublicUrl: path => ({data: {publicUrl: path}}) })}}),
  });
  for (const bytes of ['original', 'original', 'reselected']) await uploadAvatar('a', {file: new File([bytes], 'photo.webp', {type: 'image/webp'}), fileName: 'photo.webp'}, id);
  assert.equal(paths[0], paths[1]);
  assert.notEqual(paths[1], paths[2]);
  assert.match(paths[0], /^a\/registration-.*-[a-f0-9]{64}$/);
});

function hookRuntime() {
  const slots = []; let cursor = 0; const effects = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= {current: initial}; },
    useMemo(factory, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = {deps, value: factory()}; return slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = {deps, cleanup: fn()}; }); },
  };
  return {react, render(fn) {cursor = 0; const result = fn(); effects.splice(0).forEach(effect => effect()); return result;},
    unmount() { for (const slot of slots) slot?.cleanup?.(); }};
}

const formNodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(formNodes)];
const signupField = (tree, key) => formNodes(tree).find(node => node.props?.id === `auth-signup-${key}`);

function signupRestoreHarness({ store, submitted, presentation = 'mobile', rememberedEmail = '', readDraft, requestAccount, pendingIntent = null, registrationReturnPath } = {}) {
  const hooks = hookRuntime(), reads = [], selectedAvatars = [], appearanceChanges = [];
  let step = 'appearance';
  const avatar = { avatar: null, error: null,
    select(file, details = {}) { avatar.avatar = { file, ...details }; selectedAvatars.push(avatar.avatar); },
    clear() { avatar.avatar = null; },
  };
  const authContext = { rememberedEmail, rememberEmail(value) { authContext.rememberedEmail = value; },
    peekPendingIntent: () => pendingIntent, refreshSession: async () => true };
  const draftApi = { ...registration,
    async readRegistrationDraft(email) {
      reads.push(email);
      if (readDraft) return readDraft(email);
      return !email || store.saved?.email === email ? store.saved : null;
    },
    async saveRegistrationDraft(profile, email, picture) {
      store.saved = { registration: { ...profile }, email, avatar: picture, requiresEmailVerification: false };
    },
    async markRegistrationVerification(key) {
      assert.equal(key, store.saved.registration.id);
      store.saved.requiresEmailVerification = true;
    },
  };
  const asyncAction = load('src/hooks/useAsyncAction.ts', { react: hooks.react });
  const authFlows = load('src/features/auth/useAuthFlows.ts', {
    react: hooks.react, '../../hooks/useAsyncAction': asyncAction, '../../types/auth': authTypes,
    '../../contexts/AuthContext': { useAuth: () => authContext }, './registration': draftApi,
    '../../contexts/ServicesContext': { useServices: () => ({ auth: { async signUp(input) {
      submitted.push(input);
      if (requestAccount) return requestAccount(input);
      return { email: input.email, requiresEmailVerification: true, session: null };
    } } }) },
  });
  const { SignUpForm } = execute(source('src/features/auth/AuthDialog.tsx') + '\nexports.SignUpForm = SignUpForm;', {
    react: hooks.react, 'lucide-react': { AlertCircleIcon: 'AlertIcon', CheckCircle2Icon: 'CheckIcon' },
    '../../contexts/AuthContext': { useAuth: () => authContext },
    '../../components/auth/AuthField': { AuthField: 'AuthField' }, '../../components/ui/Button': { Button: 'Button' }, '../../components/ui/InterfaceIcon': {},
    '../../components/profile/AvatarPicker': { AvatarPicker: 'AvatarPicker' }, '../../components/profile/ProfileField': { ProfileField: 'ProfileField' },
    '../../components/profile/ProfileVisibilityField': { ProfileVisibilityField: 'ProfileVisibilityField' },
    '../../components/profile/ProfileLocationPicker': { ProfileLocationPicker: 'ProfileLocationPicker' },
    '../../presentation/usePresentation': { usePresentation: () => presentation }, './registration': draftApi,
    '../profile/useProfileOnboarding': { useAvatarSelection: () => avatar }, '../profile/validation': validation,
    '../../components/auth/MobileOnboarding': { MobileOnboardingAppearance: 'Appearance', MobileOnboardingAction: 'Action' },
    '../../components/auth/AccountWelcomeSurface': {}, './useAuthFlows': authFlows, './validation': load('src/features/auth/validation.ts'),
  });
  const props = { accentColor: '#0A84FF', systemGray: 'gray6', firstFieldRef: { current: null }, registrationReturnPath,
    onStepChange(next) { step = next; }, onBusyChange() {}, onDirtyChange() {}, onViewChange() {},
    onAccentColorChange(value) { props.accentColor = value; appearanceChanges.push(['accent', value]); },
    onSystemGrayChange(value) { props.systemGray = value; appearanceChanges.push(['gray', value]); },
  };
  return { props, avatar, reads, selectedAvatars, appearanceChanges, get step() { return step; },
    render() { return hooks.render(() => SignUpForm({ ...props, step })); },
    showStep(next) { step = next; }, unmount: hooks.unmount,
  };
}

test('shared signup saves the safe destination on both platforms while ordinary desktop signup adds none', async () => {
  const sharedPath = '/share/creator/c/art/project?view=projects&page=2&media=image-a&access_token=secret&next=https://outside.test#code=secret';
  const safePath = '/share/creator/c/art/project?view=projects&page=2&media=image-a';
  for (const options of [
    { presentation: 'web', pendingIntent: { kind: 'route', path: sharedPath }, expected: safePath },
    { presentation: 'web', registrationReturnPath: sharedPath, expected: safePath },
    { presentation: 'mobile', pendingIntent: { kind: 'route', path: sharedPath }, expected: safePath },
    { presentation: 'web' },
    { presentation: 'web', pendingIntent: { kind: 'route', path: '/messages' } },
    { presentation: 'web', registrationReturnPath: 'https://outside.test/share/creator' },
  ]) {
    const store = { saved: null }, submitted = [];
    const h = signupRestoreHarness({ ...options, store, submitted });
    h.render(); await tick();
    h.showStep('profile'); let tree = h.render();
    signupField(tree, 'name').props.onChange('Shared Reader');
    signupField(tree, 'location').props.onChange('London, GB');
    h.showStep('account'); tree = h.render();
    for (const [key, value] of [['email', 'reader@example.test'], ['password', 'synthetic-test-password'], ['confirmation', 'synthetic-test-password']]) {
      signupField(tree, key).props.onChange(value);
    }
    await h.render().props.onSubmit({ preventDefault() {} });
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].registration.returnPath, options.expected);
    assert.equal(store.saved.registration.returnPath, options.expected);
    assert.equal(store.saved.requiresEmailVerification, true);
    assert.equal(registration.readRegistrationProfile(JSON.parse(JSON.stringify(submitted[0].registration))).returnPath, options.expected);
    assert.doesNotMatch(JSON.stringify(submitted[0].registration), /secret|outside\.test|access_token|next=/);
    h.unmount();
  }
});

test('fresh signup remount restores pending details and picture without repeating the accepted account request', async () => {
  for (const presentation of ['mobile', 'web']) {
    const store = { saved: null }, submitted = [];
    const image = new File(['restorable-image'], 'profile.webp', { type: 'image/webp' });
    const original = new File(['original-image'], 'original.png', { type: 'image/png' });
    const crop = { x: 0, y: 0, width: 100, height: 100, zoom: 2 };
    const first = signupRestoreHarness({ store, submitted, presentation });
    first.render(); await tick();
    first.showStep('profile');
    let tree = first.render();
    signupField(tree, 'name').props.onChange('Saved Creator');
    signupField(tree, 'location').props.onChange('San Francisco, US');
    first.avatar.select(image, { originalSource: original, crop });
    if (presentation === 'mobile') formNodes(tree).find(node => node.type === 'ProfileVisibilityField').props.onChange(true);
    first.showStep('account'); tree = first.render();
    for (const [key, value] of [['email', 'saved@example.test'], ['password', 'do-not-store-password'], ['confirmation', 'do-not-store-password']]) {
      signupField(tree, key).props.onChange(value);
    }
    tree = first.render(); await tree.props.onSubmit({ preventDefault() {} });
    first.render();
    assert.equal(submitted.length, 1);
    const savedId = store.saved.registration.id;
    assert.equal(store.saved.requiresEmailVerification, true);
    assert.equal(JSON.stringify(store.saved).includes('do-not-store-password'), false);
    first.unmount();

    const restored = signupRestoreHarness({ store, submitted, presentation });
    assert.equal(restored.render().props.role, 'status');
    await tick(); restored.render(); tree = restored.render();
    assert.equal(restored.step, 'verification');
    assert.equal(formNodes(tree).find(node => node.props?.title === 'Check your email').props.description.includes('saved@example.test'), true);
    assert.equal(formNodes(tree).some(node => node.type === 'form' || node.type === 'AuthField'), false,
      'Accepted signup resumes its verification notice, not another account form');
    assert.equal(restored.avatar.avatar.file, image);
    assert.equal(restored.avatar.avatar.originalSource, original);
    assert.equal(restored.avatar.avatar.crop, crop);
    assert.deepEqual(restored.appearanceChanges, [['accent', '#0A84FF'], ['gray', 'gray6']]);
    restored.render(); await tick(); restored.render();
    assert.equal(submitted.length, 1, 'Restoring and rerendering cannot request another account');
    assert.equal(store.saved.registration.id, savedId);
    assert.deepEqual(restored.reads, [undefined], 'Restoration reads once per mount, not on each render');
    restored.unmount();
  }
});

test('an unsubmitted saved draft restores all editable fields and reuses its id only after new passwords are entered', async () => {
  for (const presentation of ['mobile', 'web']) {
    const image = new File(['saved-avatar'], 'saved.webp', { type: 'image/webp' });
    const savedRegistration = { ...draft, name: 'Restored Creator', location: 'London, GB', isPrivate: true,
      accentColor: '#FF375F', systemGray: 'gray4', hasAvatar: true, returnPath: '/share/creator/c/portal/project' };
    const store = { saved: { registration: savedRegistration, email: 'saved@example.test', avatar: { file: image }, requiresEmailVerification: false } };
    const submitted = [], h = signupRestoreHarness({ store, submitted, presentation, rememberedEmail: 'saved@example.test' });
    h.render(); await tick(); let tree = h.render();
    assert.equal(h.step, 'account');
    assert.equal(signupField(tree, 'email').props.value, 'saved@example.test');
    assert.equal(signupField(tree, 'password').props.value, '');
    assert.equal(signupField(tree, 'confirmation').props.value, '');
    await tree.props.onSubmit({ preventDefault() {} });
    assert.equal(submitted.length, 0, 'Restored profile data is not authorization to submit an account');
    h.showStep('profile'); tree = h.render();
    assert.equal(signupField(tree, 'name').props.value, savedRegistration.name);
    assert.equal(signupField(tree, 'location').props.value, savedRegistration.location);
    assert.equal(formNodes(tree).find(node => node.type === 'AvatarPicker').props.pending.file, image);
    if (presentation === 'mobile') assert.equal(formNodes(tree).find(node => node.type === 'ProfileVisibilityField').props.isPrivate, true);
    h.showStep('account'); tree = h.render();
    signupField(tree, 'password').props.onChange('new-password');
    signupField(tree, 'confirmation').props.onChange('new-password');
    tree = h.render(); await tree.props.onSubmit({ preventDefault() {} });
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].registration.id, id);
    assert.equal(submitted[0].registration.isPrivate, true);
    assert.equal(submitted[0].registration.accentColor, savedRegistration.accentColor);
    assert.equal(submitted[0].registration.systemGray, savedRegistration.systemGray);
    assert.equal(submitted[0].registration.returnPath, savedRegistration.returnPath);
    assert.equal(store.saved.avatar.file, image);
    assert.equal(JSON.stringify(store.saved).includes('new-password'), false);
    assert.deepEqual(h.reads, ['saved@example.test']);
    h.unmount();
  }
});

test('failed draft restoration exposes retry and does not open a blank form or submit an account', async () => {
  const submitted = [], store = { saved: null }; let fail = true;
  const h = signupRestoreHarness({ store, submitted, readDraft: async () => {
    if (fail) throw new Error('storage unavailable');
    return null;
  } });
  h.render(); await tick(); let tree = h.render();
  assert.equal(tree.props.message, 'Your saved signup could not be restored. Please try again.');
  assert.equal(formNodes(tree).some(node => node.type === 'form' || node.type === 'AuthField'), false);
  assert.deepEqual(submitted, []);
  fail = false; tree.props.onRetry(); h.render(); await tick(); tree = h.render();
  assert.equal(tree.type, 'form');
  assert.equal(h.step, 'appearance');
  assert.equal(h.reads.length, 2);
  h.unmount();
});

test('changing the normalized signup email after an uncertain failure starts a separate registration draft', async () => {
  for (const presentation of ['mobile', 'web']) {
    const firstImage = new File(['first-image'], 'first.webp', { type: 'image/webp' });
    const secondImage = new File(['second-image'], 'second.webp', { type: 'image/webp' });
    const store = { saved: { registration: { ...draft, hasAvatar: true }, email: 'first@example.test', avatar: { file: firstImage }, requiresEmailVerification: false } };
    const submitted = [], h = signupRestoreHarness({ store, submitted, presentation, requestAccount: async () => {
      throw new Error('Response lost after the provider may have accepted signup');
    } });
    h.render(); await tick(); let tree = h.render();
    signupField(tree, 'password').props.onChange('test-password');
    signupField(tree, 'confirmation').props.onChange('test-password');
    tree = h.render(); await tree.props.onSubmit({ preventDefault() {} });
    const firstSaved = store.saved;
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].registration.id, id);
    tree = h.render();
    signupField(tree, 'email').props.onChange(' FIRST@EXAMPLE.TEST ');
    tree = h.render(); await tree.props.onSubmit({ preventDefault() {} });
    assert.equal(submitted[1].registration.id, id, 'Whitespace and letter case retain the same account attempt');
    tree = h.render();
    signupField(tree, 'email').props.onChange('second@example.test');
    h.showStep('profile'); tree = h.render();
    formNodes(tree).find(node => node.type === 'AvatarPicker').props.onSelect(secondImage);
    h.showStep('account'); tree = h.render();
    await tree.props.onSubmit({ preventDefault() {} });
    assert.equal(submitted.length, 3);
    assert.notEqual(submitted[2].registration.id, id, 'A different account email must not reuse the uncertain attempt’s photo key');
    assert.equal(store.saved.registration.id, submitted[2].registration.id);
    assert.equal(store.saved.email, 'second@example.test');
    assert.equal(store.saved.avatar.file, secondImage);
    assert.equal(firstSaved.registration.id, id);
    assert.equal(firstSaved.avatar.file, firstImage);
    h.unmount();
  }
});

test('a pre-verification draft with a missing promised picture stays blocked until restoration succeeds', async () => {
  for (const presentation of ['mobile', 'web']) {
    const store = { saved: { registration: { ...draft, hasAvatar: true }, email: 'saved@example.test', avatar: null, requiresEmailVerification: false } };
    const submitted = [], h = signupRestoreHarness({ store, submitted, presentation });
    h.render(); await tick(); let tree = h.render();
    assert.match(tree.props.message, /saved profile picture could not be restored/);
    assert.equal(typeof tree.props.onRetry, 'function');
    assert.equal(formNodes(tree).some(node => node.type === 'form' || node.type === 'AuthField'), false);
    assert.deepEqual(submitted, []);
    assert.equal(store.saved.registration.hasAvatar, true, 'Restoration failure must not silently erase the photo promise');
    const image = new File(['available-again'], 'saved.webp', { type: 'image/webp' });
    store.saved.avatar = { file: image };
    tree.props.onRetry(); h.render(); await tick(); tree = h.render();
    assert.equal(tree.type, 'form');
    assert.equal(h.step, 'account');
    assert.equal(h.avatar.avatar.file, image);
    assert.equal(signupField(tree, 'email').props.value, 'saved@example.test');
    assert.equal(signupField(tree, 'password').props.value, '');
    assert.deepEqual(submitted, [], 'Recovering the photo does not itself request an account');
    h.unmount();
  }
});

test('signup saves the complete draft before requesting an account and handles verified/pending sessions truthfully', async () => {
  for (const mode of ['pending', 'verified', 'storage-failure', 'marker-failure']) {
    const hooks = hookRuntime(), calls = [];
    const asyncAction = load('src/hooks/useAsyncAction.ts', {react: hooks.react});
    const {useSignUp} = load('src/features/auth/useAuthFlows.ts', {
      react: hooks.react, '../../hooks/useAsyncAction': asyncAction, '../../types/auth': authTypes,
      '../../contexts/ServicesContext': {useServices: () => ({auth: {async signUp(input) {
        calls.push('signup'); assert.equal(input.registration.name, draft.name);
        return {email: input.email, requiresEmailVerification: mode !== 'verified', session: mode === 'verified' ? session() : null};
      }}})},
      '../../contexts/AuthContext': {useAuth: () => ({async refreshSession() {calls.push('refresh'); return false;}})},
      './registration': {
        async saveRegistrationDraft(profile, email, avatar) {
          assert.equal(profile, draft); assert.equal(email, 'example@example.test'); assert.equal(avatar, null);
          assert.equal(arguments.length, 3, 'Passwords must not be passed to draft persistence');
          calls.push('save-draft'); if (mode === 'storage-failure') throw new Error('full');
        },
        async markRegistrationVerification(key) {
          assert.equal(key, id); calls.push('mark-verification');
          if (mode === 'marker-failure') throw new Error('status cache unavailable');
        },
      },
    });
    let action = hooks.render(useSignUp);
    await action.submit('example@example.test', 'synthetic-test-password', draft, null);
    action = hooks.render(useSignUp);
    assert.deepEqual(calls, mode === 'storage-failure' ? ['save-draft'] : mode === 'verified' ? ['save-draft', 'signup', 'refresh'] : ['save-draft', 'signup', 'mark-verification']);
    assert.equal(action.status, mode === 'storage-failure' ? 'error' : 'success');
    if (mode !== 'storage-failure') {
      assert.equal(action.result.requiresEmailVerification, mode !== 'verified');
      assert.equal(action.error, null, 'A failed verification marker must not turn accepted signup into a retry');
    }
  }
});

test('profile linking and refresh cannot commit a stale account into the provider', async () => {
  const hooks = hookRuntime(); let current = session(), onEvent, resolveLink;
  const auth = { onAuthStateChange(fn) {onEvent = fn; return () => {};}, getSession: async () => current, attachProfile: () => new Promise(resolve => {resolveLink = resolve;}) };
  const {AuthProvider} = load('src/contexts/AuthContext.tsx', {
    react: hooks.react, './ServicesContext': {useServices: () => ({auth})}, '../types/auth': authTypes,
    '../utils/passwordRecoveryReturn': {isPasswordRecoveryReturn: () => false, clearPasswordRecoveryReturn() {}},
  }, {window: {location: {href: 'http://example.test'}}});
  const render = () => hooks.render(() => AuthProvider({children: null})).props.value;
  render(); await tick(); let context = render();
  const linking = context.linkProfile('old-profile');
  current = session('b'); onEvent(current); render();
  resolveLink(session('a', {profileId: 'old-profile'}));
  await assert.rejects(linking, /Sign in to this account/);
  assert.equal(render().user.id, 'b');
  let resolveRefresh;
  auth.getSession = () => new Promise(resolve => {resolveRefresh = resolve;});
  const refresh = render().refreshSession();
  current = session('c'); onEvent(current); render();
  resolveRefresh(session('b')); await refresh;
  assert.equal(render().user.id, 'c');
  assert.equal(render().phase, 'authenticated');
});

test('one registration form validates account and profile fields before the single submission', async () => {
  for (const presentation of ['web', 'mobile']) {
  const hooks = hookRuntime(); const submitted = [];
  const mock = {isLoading: false, result: null, error: null, submit: async (...args) => submitted.push(args)};
  const selectAvatar = () => {};
  const {SignUpForm} = execute(source('src/features/auth/AuthDialog.tsx') + '\nexports.SignUpForm = SignUpForm;', {
    react: hooks.react, 'lucide-react': {AlertCircleIcon:'AlertIcon', CheckCircle2Icon:'CheckIcon'}, '../../contexts/AuthContext': {useAuth: () => ({rememberedEmail: '', rememberEmail() {}, peekPendingIntent: () => ({kind:'route',path:'/share/original/c/portal?page=2&access_token=do-not-persist'})})},
    '../../components/auth/AuthField': {AuthField: 'AuthField'}, '../../components/ui/Button': {Button: 'Button'}, '../../components/ui/InterfaceIcon': {},
    '../../components/profile/AvatarPicker': {AvatarPicker: 'AvatarPicker'}, '../../components/profile/ProfileField': {ProfileField: 'ProfileField'},
    '../../components/profile/ProfileVisibilityField': {ProfileVisibilityField: 'ProfileVisibilityField'},
    '../../components/profile/ProfileLocationPicker': {ProfileLocationPicker: 'ProfileLocationPicker'},
    '../../presentation/usePresentation': {usePresentation: () => presentation},
    './registration': {...registration, readRegistrationDraft: async () => null},
    '../profile/useProfileOnboarding': {useAvatarSelection: () => ({avatar: null, error: null, select: selectAvatar})}, '../profile/validation': validation,
    '../../components/auth/MobileOnboarding': {MobileOnboardingAppearance:'Appearance', MobileOnboardingAction:'Action'},
    '../../components/auth/AccountWelcomeSurface': {}, './useAuthFlows': {useSignUp: () => mock}, './validation': load('src/features/auth/validation.ts'),
  });
  let step = 'appearance';
  const onStepChange = next => {step = next;};
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
  let actionKey;
  const render = () => {
    const tree = hooks.render(() => SignUpForm({step, onStepChange, registrationReturnPath: '/share/creator/c/portal/project?page=2&access_token=do-not-persist', accentColor: '#0A84FF', firstFieldRef: {current: null}, onBusyChange() {}, onDirtyChange() {}, onViewChange() {}}));
    if (tree.type === 'form') {
      const children = React.Children.toArray(tree.props.children);
      const fields = children.find(node => node.props.className === (presentation === 'mobile' ? 'mobile-onboarding-fields' : 'contents'));
      assert.ok(fields, 'step content has one independent layout region');
      assert.equal(typeof tree.props.onSubmit, 'function');
      if (presentation === 'mobile') {
        const actions = nodes(tree).filter(node => node.type === 'Action');
        assert.equal(actions.length, 1, `${step} has exactly one primary action`);
        assert.equal(nodes(fields).some(node => node.type === 'Action'), false, 'scrolling fields cannot contain the fixed action');
        const action = children.find(node => node.type === 'Action');
        assert.ok(action, 'the action stays a direct form child across every signup step');
        actionKey ??= action.key;
        assert.equal(action.key, actionKey, 'step, errors and busy state retain the same action mount');
        assert.equal(action.props.busy, mock.isLoading);
        assert.equal(action.props.onClick, undefined, 'native form submission retains validation and duplicate-submit protection');
        assert.equal(action.props.children, mock.isLoading ? 'Creating account…' : step === 'account' ? 'Create account' : 'Continue');
      } else {
        assert.equal(nodes(tree).some(node => node.type === 'Action' || node.type === 'Appearance'), false);
        assert.equal(children.find(node => node.type === 'Button').props.type, 'submit');
        assert.equal(nodes(tree).some(node => node.props.className === 'mobile-onboarding-fields'), false);
      }
    }
    return tree;
  };
  let tree = render();
  assert.equal(tree.props.role, 'status');
  assert.equal(tree.props.onSubmit, undefined, 'Draft restoration completes before an editable signup appears');
  await tick(); tree = render();
  if (presentation === 'mobile') {
    assert.equal(nodes(tree).find(node => node.type === 'Appearance').props.children, undefined, 'appearance choices no longer own a second action');
    mock.isLoading = true; tree = render();
    await tree.props.onSubmit({preventDefault() {}});
    assert.equal(step, 'appearance', 'busy activation does not navigate or submit');
    assert.equal(submitted.length, 0);
    mock.isLoading = false; mock.error = {message: 'Please try again'}; tree = render();
    const fields = nodes(tree).find(node => node.props.className === 'mobile-onboarding-fields');
    assert.ok(nodes(fields).some(node => node.props.message === 'Please try again'), 'errors remain inside the scrollable fields');
    mock.error = null; tree = render();
    assert.equal(nodes(tree).some(node => node.props?.id === 'auth-signup-email'), false);
    await tree.props.onSubmit({preventDefault() {}}); assert.equal(step, 'profile');
    tree = render();
    assert.equal(nodes(tree).some(node => node.props?.id === 'auth-signup-email'), false, 'Profile comes before credentials.');
  }
  await tree.props.onSubmit({preventDefault() {}}); assert.equal(submitted.length, 0);
  if (presentation === 'mobile') assert.equal(step, 'profile', 'A missing profile name cannot advance.');
  const visibility = nodes(tree).find(node => node.type === 'ProfileVisibilityField');
  assert.equal(Boolean(visibility), presentation === 'mobile');
  visibility?.props.onChange(true);
  for (const [key, value] of [['name', 'Creator'], ['location', 'City']]) {
    nodes(tree).find(node => node.props?.id === `auth-signup-${key}`).props.onChange(value);
  }
  tree = render(); await tree.props.onSubmit({preventDefault() {}});
  assert.equal(submitted.length, 0, 'Profile details are a draft until the final account screen submits.');
  if (presentation === 'mobile') {
    assert.equal(step, 'account');
    step = 'profile'; tree = render();
    assert.equal(nodes(tree).find(node => node.props?.id === 'auth-signup-name').props.value, 'Creator');
    assert.equal(nodes(tree).find(node => node.type === 'ProfileVisibilityField').props.isPrivate, true);
    step = 'appearance'; tree = render(); await tree.props.onSubmit({preventDefault() {}});
    assert.equal(step, 'profile'); tree = render(); await tree.props.onSubmit({preventDefault() {}});
    assert.equal(step, 'account');
  }
  tree = render();
  const field = key => nodes(tree).find(node => node.props?.id === `auth-signup-${key}`);
  assert.equal(field('password').props.revealPassword, true);
  assert.equal(field('confirmation').props.revealPassword, true);
  assert.equal(field('confirmation').props.liveError, true);
  assert.equal(field('email').props.revealPassword, undefined);
  assert.equal(field('password').props.liveError, undefined);
  assert.notEqual(field('confirmation').props.error, 'Passwords don’t match');
  for (const [key, value] of [['email', 'example@example.test'], ['password', 'test-password'], ['confirmation', 'different']]) {
    nodes(tree).find(node => node.props?.id === `auth-signup-${key}`).props.onChange(value);
  }
  tree = render();
  assert.equal(field('confirmation').props.error, 'Passwords don’t match', 'Mismatch appears before any submit or blur');
  await tree.props.onSubmit({preventDefault() {}}); assert.equal(submitted.length, 0);
  if (presentation === 'mobile') assert.equal(step, 'account', 'Mismatched passwords cannot advance.');
  field('password').props.onChange('different'); tree = render();
  assert.equal(field('confirmation').props.error, null, 'Correcting Password clears the previous submitted mismatch');
  field('password').props.onChange('test-password'); tree = render();
  assert.equal(field('confirmation').props.error, 'Passwords don’t match', 'Editing Password also recomputes mismatch');
  field('confirmation').props.onChange(''); tree = render();
  assert.equal(field('confirmation').props.error, null, 'Empty confirmation does not show a live mismatch');
  await tree.props.onSubmit({preventDefault() {}}); tree = render();
  assert.equal(submitted.length, 0, 'Empty confirmation still blocks submission');
  assert.equal(field('confirmation').props.error, 'Re-enter your password.');
  field('confirmation').props.onChange('test-password'); tree = render();
  assert.equal(field('confirmation').props.error, null, 'Correcting Confirm password clears its error immediately');
  if (presentation === 'mobile') {
    step = 'profile'; tree = render();
    nodes(tree).find(node => node.props?.id === 'auth-signup-name').props.onChange('');
    step = 'account'; tree = render(); await tree.props.onSubmit({preventDefault() {}});
    assert.equal(submitted.length, 0);
    assert.equal(step, 'profile', 'Final validation returns hidden profile errors to their field.');
    tree = render(); nodes(tree).find(node => node.props?.id === 'auth-signup-name').props.onChange('Creator');
    tree = render(); await tree.props.onSubmit({preventDefault() {}});
    step = 'account'; tree = render();
    assert.equal(nodes(tree).find(node => node.props?.id === 'auth-signup-email').props.value, 'example@example.test');
    assert.equal(nodes(tree).find(node => node.props?.id === 'auth-signup-password').props.value, 'test-password');
    assert.equal(nodes(tree).find(node => node.type === 'Action').props.children, 'Create account');
  }
  tree = render(); await Promise.all([tree.props.onSubmit({preventDefault() {}}), tree.props.onSubmit({preventDefault() {}})]);
  assert.equal(submitted.length, 1, 'Repeated activation must not submit two accounts.');
  assert.equal(submitted[0][2].name, 'Creator');
  assert.equal(submitted[0][2].location, 'City');
  assert.equal(submitted[0][2].accentColor, '#0A84FF');
  assert.equal(submitted[0][2].isPrivate, presentation === 'mobile');
  assert.equal(submitted[0][2].returnPath, '/share/original/c/portal?page=2', 'The captured shared entry wins over a category auto-select or later URL change on both platforms.');
  mock.result = {requiresEmailVerification:true, email:'example@example.test'};
  render(); tree = render();
  assert.equal(step, 'verification');
  const success = nodes(tree).find(node => node.props?.title === 'Check your email');
  assert.ok(success.props.description.includes('confirmation link'));
  assert.equal(nodes(tree).some(node => node.type === 'Welcome'), false);
  }
});

test('email confirmation completes the saved profile once; a missing image asks for selection instead', async () => {
  for (const mode of ['image', 'missing', 'no-image', 'mobile-welcome']) {
    const hooks = hookRuntime(), submissions = [], completed = [], cleaned = [];
    const image = new File(['synthetic-image'], 'photo.webp', {type: 'image/webp'});
    const avatar = { avatar: null, error: null, select(file, details) { avatar.avatar = { file, ...details }; }, clear() { avatar.avatar = null; } };
    const create = {status: 'idle', isLoading: false, createdProfile: null, avatarPersisted: mode === 'image', async run(input) {submissions.push(input);}};
    const {ProfileOnboardingDialog} = load('src/features/profile/ProfileOnboardingDialog.tsx', {
      react: hooks.react, 'lucide-react': {AlertCircleIcon:'AlertIcon', CheckCircle2Icon:'CheckIcon'}, '../../contexts/AuthContext': {useAuth: () => ({user: {id: 'a', registration: {...draft, isPrivate: true, systemGray: 'gray4', hasAvatar: mode === 'image' || mode === 'missing'}}})},
      '../../components/auth/AccountWelcomeSurface': {AccountWelcomeSurface: 'Surface'},
      '../../components/auth/MobileOnboarding': {MobileOnboardingWelcome:'Welcome', MobileOnboardingAction:'Action'},
      '../auth/registration': {readRegistrationAvatar: async () => mode === 'image' ? {file: image, originalSource: image, crop: {zoom: 2}} : null, removeRegistrationDraft: async key => cleaned.push(key)},
      '../../utils/publicAppearance': {DEFAULT_PUBLIC_APPEARANCE: {accentColor: '#0A84FF', mode: 'auto', systemGray: 'gray6'}},
      '../../components/profile/ProfileField': {ProfileField: 'ProfileField'}, '../../components/profile/AvatarPicker': {AvatarPicker: 'AvatarPicker'}, '../../components/ui/Button': {Button: 'Button'},
      '../../components/profile/ProfileVisibilityField': {ProfileVisibilityField: 'ProfileVisibilityField'},
      '../../components/profile/ProfileLocationPicker': {ProfileLocationPicker: 'ProfileLocationPicker'},
      '../../presentation/usePresentation': {usePresentation: () => mode === 'missing' || mode === 'mobile-welcome' ? 'mobile' : 'web'},
      './useProfileOnboarding': {useAvatarSelection: () => avatar, useCreateProfile: () => create}, './validation': validation,
    });
    const props = {isOpen: true, accentColor: '#0A84FF', onAccentColorChange() {}, onDismiss() {}, onComplete: id => completed.push(id)};
    const render = () => hooks.render(() => ProfileOnboardingDialog(props));
    render(); await tick(); render(); await tick(); render();
    assert.equal(submissions.length, mode === 'missing' ? 0 : 1);
    if (mode !== 'missing') {
      assert.equal(submissions[0].name, draft.name);
      assert.equal(submissions[0].creationKey, id);
      assert.equal(submissions[0].isPrivate, true, 'Email confirmation retains the mobile selection even on desktop.');
      assert.equal(submissions[0].publicAppearance.systemGray, 'gray4');
      if (mode === 'image') { assert.equal(submissions[0].avatar.file, image); assert.equal(submissions[0].avatar.crop.zoom, 2); }
      create.status = 'success'; create.createdProfile = {id: 'created'};
      render(); await tick(); render();
      if (mode === 'mobile-welcome') {
        assert.deepEqual(completed, [], 'Mobile must pause at Welcome after saving.');
        const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
        const welcome = nodes(render()).find(node => node.type === 'Welcome');
        assert.ok(welcome);
        welcome.props.onComplete(); welcome.props.onComplete();
      }
      assert.deepEqual(completed, ['created']); assert.deepEqual(cleaned, [id]);
    } else {
      const tree = render();
      assert.equal(tree.props.busy, false);
      assert.equal(JSON.stringify(tree).includes('Your saved profile picture could not be restored yet'), true);
      assert.equal(JSON.stringify(tree).includes(draft.name), true);
      const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
      const visibility = nodes(tree).find(node => node.type === 'ProfileVisibilityField');
      assert.equal(visibility.props.isPrivate, true);
      await nodes(tree).find(node => node.type === 'form').props.onSubmit({preventDefault() {}});
      assert.equal(submissions.length, 0, 'A missing promised image cannot silently produce an empty-avatar profile');
      nodes(tree).find(node => node.type === 'AvatarPicker').props.onClear();
      await nodes(render()).find(node => node.type === 'form').props.onSubmit({preventDefault() {}});
      assert.equal(submissions[0].isPrivate, true, 'Explicitly removing the saved image preserves privacy.');
      assert.equal(submissions[0].publicAppearance.systemGray, 'gray4');
      assert.equal(submissions[0].publicAppearance.accentColor, draft.accentColor);
      assert.equal(submissions[0].avatar, undefined);
    }
  }
});

function profileResumeHarness({ initialRegistration, readAvatar = async () => null } = {}) {
  const hooks = hookRuntime(), submissions = [], reads = [], cleaned = [], completed = [];
  let currentRegistration = initialRegistration;
  const avatar = { avatar: null, error: null,
    select(file, details = {}) { avatar.avatar = { file, ...details }; avatar.error = null; }, clear() { avatar.avatar = null; avatar.error = null; },
  };
  const create = { status: 'idle', isLoading: false, createdProfile: null, avatarPersisted: false,
    async run(input) { submissions.push(input); },
  };
  const { ProfileOnboardingDialog } = load('src/features/profile/ProfileOnboardingDialog.tsx', {
    react: hooks.react, 'lucide-react': { AlertCircleIcon: 'AlertIcon', CheckCircle2Icon: 'CheckIcon' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'a', registration: currentRegistration } }) },
    '../../components/auth/AccountWelcomeSurface': { AccountWelcomeSurface: 'Surface' },
    '../../components/auth/MobileOnboarding': { MobileOnboardingWelcome: 'Welcome', MobileOnboardingAction: 'Action' },
    '../auth/registration': {
      async readRegistrationAvatar(key) { reads.push(key); return readAvatar(key); },
      async removeRegistrationDraft(key) { cleaned.push(key); },
    },
    '../../utils/publicAppearance': { DEFAULT_PUBLIC_APPEARANCE: { accentColor: '#0A84FF', mode: 'auto', systemGray: 'gray6' } },
    '../../components/profile/ProfileField': { ProfileField: 'ProfileField' }, '../../components/profile/AvatarPicker': { AvatarPicker: 'AvatarPicker' },
    '../../components/ui/Button': { Button: 'Button' }, '../../components/profile/ProfileVisibilityField': { ProfileVisibilityField: 'ProfileVisibilityField' },
    '../../components/profile/ProfileLocationPicker': { ProfileLocationPicker: 'ProfileLocationPicker' },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    './useProfileOnboarding': { useAvatarSelection: () => avatar, useCreateProfile: () => create }, './validation': validation,
  });
  const props = { isOpen: true, accentColor: '#FFFFFF', onAccentColorChange() {}, onDismiss() {}, onComplete: key => completed.push(key) };
  const render = () => hooks.render(() => ProfileOnboardingDialog(props));
  return { render, create, avatar, submissions, reads, cleaned, completed,
    setRegistration(value) { currentRegistration = value; },
    async settle() { render(); await tick(); render(); await tick(); return render(); },
    unmount: hooks.unmount,
  };
}

test('late registration metadata hydrates untouched fields once and never overwrites edits or auto-submits them', async () => {
  const savedImage = new File(['saved-image'], 'saved.webp', { type: 'image/webp' });
  const editedImage = new File(['new-image'], 'new.webp', { type: 'image/webp' });
  const incoming = { ...draft, name: 'Saved name', location: 'Saved city', isPrivate: true,
    accentColor: '#FF375F', systemGray: 'gray4', hasAvatar: true };
  for (const edited of [null, 'name', 'location', 'isPrivate', 'avatar']) {
    const h = profileResumeHarness({ readAvatar: async () => ({ file: savedImage }) });
    let tree = h.render();
    if (edited === 'name' || edited === 'location') {
      formNodes(tree).find(node => node.props?.id === `onboarding-${edited}`).props.onChange(`Edited ${edited}`);
    } else if (edited === 'isPrivate') {
      formNodes(tree).find(node => node.type === 'ProfileVisibilityField').props.onChange(false);
    } else if (edited === 'avatar') {
      formNodes(tree).find(node => node.type === 'AvatarPicker').props.onSelect(editedImage);
    }
    h.setRegistration(incoming); tree = await h.settle();
    assert.equal(h.submissions.length, edited ? 0 : 1, 'Late metadata must not authorize submission of an edited form');
    assert.equal(formNodes(tree).find(node => node.props?.id === 'onboarding-name').props.value, edited === 'name' ? 'Edited name' : incoming.name);
    assert.equal(formNodes(tree).find(node => node.props?.id === 'onboarding-location').props.value, edited === 'location' ? 'Edited location' : incoming.location);
    assert.equal(formNodes(tree).find(node => node.type === 'ProfileVisibilityField').props.isPrivate, edited !== 'isPrivate');
    assert.equal(h.avatar.avatar.file, edited === 'avatar' ? editedImage : savedImage);
    assert.deepEqual(h.reads, edited === 'avatar' ? [] : [id], 'A locally selected picture must not be replaced from storage');
    if (edited) await formNodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(h.submissions.length, 1);
    assert.equal(h.submissions[0].creationKey, id);
    assert.equal(h.submissions[0].publicAppearance.accentColor, incoming.accentColor);
    assert.equal(h.submissions[0].publicAppearance.systemGray, incoming.systemGray);
    assert.equal(h.submissions[0].avatar.file, edited === 'avatar' ? editedImage : savedImage);
    h.setRegistration({ ...incoming, name: 'Later metadata must not replace the form' });
    tree = await h.settle();
    assert.equal(formNodes(tree).find(node => node.props?.id === 'onboarding-name').props.value, edited === 'name' ? 'Edited name' : incoming.name);
    assert.equal(h.submissions.length, 1, 'Repeated metadata updates do not create another profile');
    h.unmount();
  }
});

test('a missing saved picture can be restored or explicitly replaced without losing the pending profile', async () => {
  const image = new File(['restored-image'], 'restored.webp', { type: 'image/webp' });
  const incoming = { ...draft, name: 'Saved creator', isPrivate: true, hasAvatar: true, systemGray: 'gray4' };
  for (const recovery of ['restore', 'replace']) {
    let storedImage = null;
    const h = profileResumeHarness({ initialRegistration: incoming, readAvatar: async () => storedImage });
    let tree = await h.settle();
    assert.equal(tree.props.busy, false);
    assert.equal(h.submissions.length, 0);
    await formNodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(h.submissions.length, 0);
    assert.deepEqual(h.cleaned, [], 'A missing picture never deletes the recoverable registration');
    if (recovery === 'restore') {
      storedImage = { file: image };
      formNodes(tree).find(node => node.type === 'button' && node.props.children === 'Restore saved picture').props.onClick();
      tree = await h.settle();
      assert.equal(h.reads.length, 2);
    } else {
      formNodes(tree).find(node => node.type === 'AvatarPicker').props.onSelect(image);
      tree = await h.settle();
      assert.equal(formNodes(tree).some(node => node.type === 'button' && node.props.children === 'Restore saved picture'), false,
        'A valid replacement clears the missing-photo notice and its stale retry action');
      await formNodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    }
    assert.equal(h.submissions.length, 1);
    assert.equal(h.submissions[0].creationKey, id);
    assert.equal(h.submissions[0].avatar.file, image);
    assert.equal(h.submissions[0].name, incoming.name);
    assert.equal(h.submissions[0].isPrivate, true);
    assert.equal(h.submissions[0].publicAppearance.accentColor, incoming.accentColor);
    assert.equal(h.submissions[0].publicAppearance.systemGray, incoming.systemGray);
    h.create.status = 'success'; h.create.createdProfile = { id: 'created', avatar: '' };
    await h.settle();
    assert.deepEqual(h.cleaned, [], 'A successful profile without its promised upload must retain recovery data');
    h.create.avatarPersisted = true;
    await h.settle(); await h.settle();
    assert.deepEqual(h.cleaned, [id], 'Confirmed picture persistence removes only this registration once');
    h.unmount();
  }
});

test('restoring the saved picture after an invalid replacement clears the error and cannot get stuck loading', async () => {
  const image = new File(['restored-image'], 'restored.webp', { type: 'image/webp' });
  let storedImage = null;
  const h = profileResumeHarness({ initialRegistration: { ...draft, hasAvatar: true }, readAvatar: async () => storedImage });
  let tree = await h.settle();
  formNodes(tree).find(node => node.type === 'AvatarPicker').props.onSelect(new File(['invalid'], 'invalid.txt', { type: 'text/plain' }));
  // Model the rejection delivered by useAvatarSelection without importing its image APIs.
  h.avatar.avatar = null; h.avatar.error = 'Choose a PNG, JPEG, WebP, or GIF image.';
  tree = h.render();
  await formNodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.submissions.length, 0);
  storedImage = { file: image };
  formNodes(tree).find(node => node.type === 'button' && node.props.children === 'Restore saved picture').props.onClick();
  tree = await h.settle();
  assert.equal(h.reads.length, 2, 'Retry must read the saved picture even though replacement marked the avatar as touched');
  assert.equal(tree.props.busy, false);
  assert.equal(h.avatar.error, null);
  assert.equal(h.avatar.avatar.file, image);
  assert.equal(h.submissions.length, 1);
  assert.equal(h.submissions[0].avatar.file, image);
  assert.equal(formNodes(tree).some(node => node.type === 'button' && node.props.children === 'Restore saved picture'), false);
  await h.settle();
  assert.equal(h.submissions.length, 1);
  h.unmount();
});

test('explicitly removing a promised picture permits completion and cleans its draft only after success', async () => {
  const h = profileResumeHarness({ initialRegistration: { ...draft, hasAvatar: true } });
  let tree = await h.settle();
  formNodes(tree).find(node => node.type === 'AvatarPicker').props.onClear();
  tree = h.render();
  assert.equal(formNodes(tree).some(node => node.type === 'button' && node.props.children === 'Restore saved picture'), false);
  await formNodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.submissions.length, 1);
  assert.equal(h.submissions[0].avatar, undefined);
  assert.equal(h.submissions[0].creationKey, id);
  assert.deepEqual(h.cleaned, [], 'Explicit removal is not proof that profile creation succeeded');
  h.create.status = 'success'; h.create.createdProfile = { id: 'created', avatar: '' };
  await h.settle(); await h.settle();
  assert.deepEqual(h.cleaned, [id], 'A completed deliberate no-picture profile must not resurrect its old promised photo');
  h.unmount();
});
