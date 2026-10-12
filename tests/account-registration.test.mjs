import { sourceModule } from './helpers/source-module.mjs';
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
    { exports, crypto, File, Blob, URL, ...globals, require(name) {
      if(name==='../../utils/profileHandle')return sourceModule('src/utils/profileHandle.ts', {'../features/sharing/shareModel':shareModel});
      if(name==='../../contexts/ServicesContext' && !(name in imports))return {useServices:()=>({profiles:{checkPublicHandle:async()=> 'available'}})};

      if (name.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts'); assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; } });
  return exports;
}
const load = (path, imports, globals) => execute(source(path), imports, globals);
const shareModel = load('src/features/sharing/shareModel.ts');
const validation = load('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel });
const registration = load('src/features/auth/registration.ts', { '../profile/validation': validation, '../sharing/shareModel': shareModel });
const authTypes = load('src/types/auth.ts');
const id = 'bf9c6b61-ac26-432c-9a9e-ebf55721cfff';
const draft = { version: 1, id, name: '  Example Creator  ', handle: 'example.creator', location: '  City  ', accentColor: '#0A84FF', hasAvatar: false };
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
    '../legal/signupTermsContext': {useSignupTerms: () => ({requestConsent: async () => []})},
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
    '../../components/auth/AuthField': { AuthField: 'AuthField' }, '../../components/ui/Button': { Button: 'Button' }, '../../components/ui/InterfaceIcon': {}, '../../components/ui/PortalinkSplashLoader': {PortalinkSplashLoader:'welcome'},
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

test('signup is one email/password/name screen and does not read, save or restore drafts on either platform', async () => {
  for (const presentation of ['mobile','web']) {
    const submitted=[], store={saved:{registration:draft,email:'old@example.test',requiresEmailVerification:true}};
    const h=signupRestoreHarness({presentation, submitted, store});
    let tree=h.render();
    assert.deepEqual(h.reads,[]); assert.equal(signupField(tree,'name').props.value,'');
    assert.equal(signupField(tree,'location'),undefined); assert.equal(signupField(tree,'confirmation'),undefined);
    assert.equal(formNodes(tree).some(node=>node.type==='AvatarPicker'||node.type==='Appearance'),false);
    assert.equal(signupField(tree,'password').props.revealPassword,true);
    for(const [key,value] of [['email','new@example.test'],['password','synthetic-password'],['name','Avi']]) signupField(h.render(),key).props.onChange(value);
    await h.render().props.onSubmit({preventDefault(){}}); h.render();
    assert.equal(submitted.length,1); assert.equal(submitted[0].registration.handle,'avi'); assert.equal(submitted[0].registration.location,''); assert.equal(submitted[0].registration.hasAvatar,false);
    assert.equal(submitted[0].legalVersions,undefined); assert.equal(store.saved.email,'old@example.test');
    assert.deepEqual(h.reads,[]); h.unmount();
  }
});
test('invalid signup fields prevent an account request without a confirm password or location requirement', async()=>{
 const submitted=[],h=signupRestoreHarness({submitted,store:{saved:null}});
 await h.render().props.onSubmit({preventDefault(){}});assert.equal(submitted.length,0);
 for(const [key,value] of [['email','new@example.test'],['password','short'],['name','Avi']])signupField(h.render(),key).props.onChange(value);
 await h.render().props.onSubmit({preventDefault(){}});assert.equal(submitted.length,0);assert.ok(signupField(h.render(),'password').props.error);
 h.unmount();
});
test('email signup preserves only safe return metadata without persisting a local draft',async()=>{
 const submitted=[],h=signupRestoreHarness({submitted,store:{saved:null},pendingIntent:{kind:'route',path:'/share/creator?page=2&access_token=private'}});
 for(const [key,value] of [['email','new@example.test'],['password','synthetic-password'],['name','Avi']])signupField(h.render(),key).props.onChange(value);
 await h.render().props.onSubmit({preventDefault(){}});assert.equal(submitted[0].registration.returnPath,'/share/creator?page=2');assert.doesNotMatch(JSON.stringify(submitted[0].registration),/private/);h.unmount();
});
