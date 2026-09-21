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
const validation = load('src/features/profile/validation.ts');
const registration = load('src/features/auth/registration.ts', { '../profile/validation': validation });
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
  return {react, render(fn) {cursor = 0; const result = fn(); effects.splice(0).forEach(effect => effect()); return result;}};
}

test('signup saves the image before requesting an account and handles verified/pending sessions truthfully', async () => {
  for (const mode of ['pending', 'verified', 'storage-failure']) {
    const hooks = hookRuntime(), calls = [];
    const asyncAction = load('src/hooks/useAsyncAction.ts', {react: hooks.react});
    const {useSignUp} = load('src/features/auth/useAuthFlows.ts', {
      react: hooks.react, '../../hooks/useAsyncAction': asyncAction, '../../types/auth': authTypes,
      '../../contexts/ServicesContext': {useServices: () => ({auth: {async signUp(input) {
        calls.push('signup'); assert.equal(input.registration.name, draft.name);
        return {email: input.email, requiresEmailVerification: mode === 'pending', session: mode === 'verified' ? session() : null};
      }}})},
      '../../contexts/AuthContext': {useAuth: () => ({async refreshSession() {calls.push('refresh'); return false;}})},
      './registration': {async saveRegistrationAvatar(key) {assert.equal(key, id); calls.push('save-image'); if (mode === 'storage-failure') throw new Error('full');}},
    });
    let action = hooks.render(useSignUp);
    await action.submit('example@example.test', 'synthetic-test-password', draft, null);
    action = hooks.render(useSignUp);
    assert.deepEqual(calls, mode === 'storage-failure' ? ['save-image'] : mode === 'verified' ? ['save-image', 'signup', 'refresh'] : ['save-image', 'signup']);
    assert.equal(action.status, mode === 'storage-failure' ? 'error' : 'success');
    if (mode !== 'storage-failure') assert.equal(action.result.requiresEmailVerification, mode === 'pending');
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
  const {SignUpForm} = execute(source('src/features/auth/AuthDialog.tsx') + '\nexports.SignUpForm = SignUpForm;', {
    react: hooks.react, 'lucide-react': {AlertCircleIcon:'AlertIcon', CheckCircle2Icon:'CheckIcon'}, '../../contexts/AuthContext': {useAuth: () => ({rememberedEmail: '', rememberEmail() {}, peekPendingIntent: () => ({kind:'route',path:'/share/original/c/portal?page=2&access_token=do-not-persist'})})},
    '../../components/auth/AuthField': {AuthField: 'AuthField'}, '../../components/ui/Button': {Button: 'Button'}, '../../components/ui/InterfaceIcon': {},
    '../../components/profile/AvatarPicker': {AvatarPicker: 'AvatarPicker'}, '../../components/profile/ProfileField': {ProfileField: 'ProfileField'},
    '../../components/profile/ProfileVisibilityField': {ProfileVisibilityField: 'ProfileVisibilityField'},
    '../../presentation/usePresentation': {usePresentation: () => presentation},
    './registration': registration,
    '../profile/useProfileOnboarding': {useAvatarSelection: () => ({avatar: null, error: null})}, '../profile/validation': validation,
    '../../components/auth/MobileOnboarding': {MobileOnboardingAppearance:'Appearance', MobileOnboardingAction:'Action'},
    '../../components/auth/AccountWelcomeSurface': {}, './useAuthFlows': {useSignUp: () => mock}, './validation': load('src/features/auth/validation.ts'),
  });
  let step = 'appearance';
  const render = () => hooks.render(() => SignUpForm({step, onStepChange: next => {step = next;}, registrationReturnPath: '/share/creator/c/portal/project?page=2&access_token=do-not-persist', accentColor: '#0A84FF', firstFieldRef: {current: null}, onBusyChange() {}, onDirtyChange() {}, onViewChange() {}}));
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
  let tree = render();
  if (presentation === 'mobile') {
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
  for (const [key, value] of [['email', 'example@example.test'], ['password', 'test-password'], ['confirmation', 'different']]) {
    nodes(tree).find(node => node.props?.id === `auth-signup-${key}`).props.onChange(value);
  }
  tree = render(); await tree.props.onSubmit({preventDefault() {}}); assert.equal(submitted.length, 0);
  if (presentation === 'mobile') assert.equal(step, 'account', 'Mismatched passwords cannot advance.');
  nodes(tree).find(node => node.props?.id === 'auth-signup-confirmation').props.onChange('test-password');
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
  assert.equal(submitted[0][2].returnPath, presentation === 'mobile' ? '/share/original/c/portal?page=2' : undefined, 'The captured entry wins over a category auto-select or later URL change.');
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
    const select = () => {};
    const create = {status: 'idle', isLoading: false, createdProfile: null, async run(input) {submissions.push(input);}};
    const {ProfileOnboardingDialog} = load('src/features/profile/ProfileOnboardingDialog.tsx', {
      react: hooks.react, 'lucide-react': {AlertCircleIcon:'AlertIcon', CheckCircle2Icon:'CheckIcon'}, '../../contexts/AuthContext': {useAuth: () => ({user: {id: 'a', registration: {...draft, isPrivate: true, hasAvatar: mode === 'image' || mode === 'missing'}}})},
      '../../components/auth/AccountWelcomeSurface': {AccountWelcomeSurface: 'Surface'},
      '../../components/auth/MobileOnboarding': {MobileOnboardingWelcome:'Welcome', MobileOnboardingAction:'Action'},
      '../auth/registration': {readRegistrationAvatar: async () => mode === 'image' ? {file: image, originalSource: image, crop: {zoom: 2}} : null, removeRegistrationAvatar: async key => cleaned.push(key)},
      '../../utils/publicAppearance': {DEFAULT_PUBLIC_APPEARANCE: {accentColor: '#0A84FF', mode: 'auto', systemGray: 'gray6'}},
      '../../components/profile/ProfileField': {ProfileField: 'ProfileField'}, '../../components/profile/AvatarPicker': {AvatarPicker: 'AvatarPicker'}, '../../components/ui/Button': {Button: 'Button'},
      '../../components/profile/ProfileVisibilityField': {ProfileVisibilityField: 'ProfileVisibilityField'},
      '../../presentation/usePresentation': {usePresentation: () => mode === 'missing' || mode === 'mobile-welcome' ? 'mobile' : 'web'},
      './useProfileOnboarding': {useAvatarSelection: () => ({select, avatar: null, error: null}), useCreateProfile: () => create}, './validation': validation,
    });
    const props = {isOpen: true, accentColor: '#0A84FF', onAccentColorChange() {}, onDismiss() {}, onComplete: id => completed.push(id)};
    const render = () => hooks.render(() => ProfileOnboardingDialog(props));
    render(); await tick(); render(); await tick(); render();
    assert.equal(submissions.length, mode === 'missing' ? 0 : 1);
    if (mode !== 'missing') {
      assert.equal(submissions[0].name, draft.name);
      assert.equal(submissions[0].creationKey, id);
      assert.equal(submissions[0].isPrivate, true, 'Email confirmation retains the mobile selection even on desktop.');
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
      assert.equal(JSON.stringify(tree).includes('Choose your profile image again'), true);
      assert.equal(JSON.stringify(tree).includes(draft.name), true);
      const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
      const visibility = nodes(tree).find(node => node.type === 'ProfileVisibilityField');
      assert.equal(visibility.props.isPrivate, true);
      await nodes(tree).find(node => node.type === 'form').props.onSubmit({preventDefault() {}});
      assert.equal(submissions[0].isPrivate, true, 'Retrying without the saved image preserves privacy.');
    }
  }
});
