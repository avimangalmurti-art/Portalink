import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function welcomeHarness(mode = 'mobile', options = {}) {
  const slots = [], layout = [], passive = [], listeners = new Map(), accentCalls = [], frames = new Map(), observers = [];
  let cursor = 0, stepFields = null, profileFields = null, renderedRoot, escape, nextFrame = 0;
  const document = { activeElement: null };
  class Element {
    constructor(type) { this.type = type; this.scrollTop = 200; this.blurs = 0; this.children = []; this.scrolls = []; }
    matches() { return this.type === 'input'; }
    blur() { this.blurs++; document.activeElement = null; }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    scrollIntoView(options) { this.scrolls.push(options); }
    addEventListener() {}
    removeEventListener() {}
    contains(element) { return this === element || this.children.some(child=>child===element||child.contains(element)); }
    getBoundingClientRect() { return this.bounds ?? { top: 0, bottom: 800 }; }
    querySelector(selector) {
      if (selector === '.mobile-onboarding-fields') return stepFields;
      if (selector === '.profile-setup-fields') return profileFields;
      return this.children.find(child => child.type === selector) ?? this.children.map(child => child.querySelector(selector)).find(Boolean) ?? null;
    }
  }
  const hook = queue => (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
      slots[index]?.cleanup?.();
      slots[index] = { deps };
      queue.push(() => { slots[index].cleanup = effect(); });
    }
  };
  const react = { ...React,
    useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useLayoutEffect: hook(layout), useEffect: hook(passive),
  };
  const imports = {
    '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown() {} },
    react, 'lucide-react': { ArrowLeftIcon: 'svg', ChevronLeftIcon: 'svg', XIcon: 'svg', CheckIcon: 'svg' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus: (_open, _ref, close) => { escape = close; } },
    '../../data/navButtonTokens': { findNavAccent: () => ({ id: 'pink' }), navAccents: options.navAccents ?? [], isLightSurface: () => false },
    '../../utils/accentTokens': { resolveAccentTokens: (color, scheme) => { accentCalls.push({color,scheme}); return {}; } },
    '../ui/Button': { Button: 'button' }, '../ui/AppearanceSwitch': { AppearanceSwitch: 'button' },
    '../ui/ConfirmationDialog': { ConfirmationDialog: 'discard-layer' },
    '../ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'welcome-media' }, './helloWorldSignIn.css': {}, './profile-setup.css': {},
    '../../presentation/usePresentation': { usePresentation: () => mode },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/auth/AccountWelcomeSurface.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, document, HTMLElement: Element, requestAnimationFrame: callback => { const id=++nextFrame;if(options.queuedFrames)frames.set(id,callback);return id; }, cancelAnimationFrame: id=>frames.delete(id), ResizeObserver: class { constructor(callback){this.callback=callback;observers.push(this);} observe() {} disconnect() {this.disconnected=true;} }, window: {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  }, require(name) { assert.ok(name in imports, name); return imports[name]; } });
  const attach = node => {
    if (!React.isValidElement(node)) return;
    const element = node.ref && typeof node.ref === 'object' ? node.ref.current ??= new Element(node.type) : new Element(node.type);
    element.children = React.Children.toArray(node.props.children).map(attach).filter(Boolean);
    return element;
  };
  return {
    document, listeners, accentCalls, escape: () => escape(),
    get stepFields() { return stepFields; },
    get profileFields() { return profileFields; },
    element:selector=>renderedRoot.querySelector(selector),
    resize:()=>observers.forEach(observer=>{if(!observer.disconnected)observer.callback();}),
    flushFrames:()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback());},
    control() { const control = new Element('button'); control.focus(); return control; },
    input() { const input = new Element('input'); input.focus(); return input; },
    render(title = 'Sign in', changes = {}) {
      cursor = 0;
      const tree = exports.AccountWelcomeSurface({ title, signIn: title === 'Sign in', accentColor: '#ff2d55', onDismiss() {}, children: null, ...changes });
      if (nodes(tree).some(node => node.props.className === 'mobile-onboarding-fields')) stepFields ??= new Element('div');
      else stepFields = null;
      if(nodes(tree).some(node=>node.props.className==='profile-setup-fields'))profileFields??=new Element('div');else profileFields=null;
      renderedRoot=attach(tree); return tree;
    },
    paint() { layout.splice(0).forEach(fn => fn()); },
    afterPaint() { passive.splice(0).forEach(fn => fn()); },
    pageShow(persisted) { listeners.get('pageshow')?.({ persisted }); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('mobile account arrival clears restored input focus before paint', () => {
  const h = welcomeHarness();
  const input = h.input();
  h.render(); h.paint();
  assert.equal(input.blurs, 1);
  assert.equal(h.document.activeElement.type, 'h2');
  h.afterPaint();
  assert.equal(h.document.activeElement.type, 'h2');
  h.unmount();
  assert.equal(h.listeners.size, 0);
});

test('mobile typing survives rerenders and keyboard resizing; a new account step returns to its heading', () => {
  const h = welcomeHarness();
  h.render(); h.paint(); h.afterPaint();
  const input = h.input();
  h.render(); h.paint(); h.afterPaint();
  h.listeners.get('resize')?.();
  h.pageShow(false);
  assert.equal(h.document.activeElement, input);
  assert.equal(input.blurs, 0);
  h.render('Create your account'); h.paint(); h.afterPaint();
  assert.equal(h.document.activeElement.type, 'h2');
  assert.equal(input.blurs, 1);
  h.unmount();
});

test('appearance changes keep the current step focus and both scrollers; real step navigation resets them', () => {
  const h = welcomeHarness();
  const children = React.createElement('form', { className: 'mobile-onboarding-form' },
    React.createElement('div', { className: 'mobile-onboarding-fields' }, React.createElement('button', { type: 'button' }, 'Accent')));
  const props = { mobileOnboarding: true, showAppearance: false, children };
  let tree = h.render('Choose appearance', props); h.paint(); h.afterPaint();
  const content = nodes(tree).find(node => node.props.className?.includes('account-welcome-content')).ref.current;
  assert.equal(content.scrollTop, 0);
  assert.equal(h.stepFields.scrollTop, 0);
  const selected = h.control();
  content.scrollTop = 24; h.stepFields.scrollTop = 120;
  for (const appearance of [
    { accentColor: '#30D158' }, { systemGray: 'gray3' }, { highContrast: true }, { reduceTranslucency: true }, { theme: 'light' },
  ]) {
    tree = h.render('Choose appearance', { ...props, ...appearance }); h.paint(); h.afterPaint();
    assert.equal(h.document.activeElement, selected, 'choosing appearance must not refocus the heading');
    assert.equal(content.scrollTop, 24);
    assert.equal(h.stepFields.scrollTop, 120, 'appearance rerenders must not reset the field viewport');
    assert.equal(nodes(tree).some(node => node.props.role === 'alertdialog'), false);
  }
  h.render('Create your profile', props); h.paint(); h.afterPaint();
  assert.equal(content.scrollTop, 0);
  assert.equal(h.stepFields.scrollTop, 0);
  assert.equal(h.document.activeElement.type, 'h2');
  const input = h.input();
  content.scrollTop = 10; h.stepFields.scrollTop = 90;
  h.render('Create account', props); h.paint(); h.afterPaint();
  assert.equal(input.blurs, 1);
  assert.equal(content.scrollTop, 0);
  assert.equal(h.stepFields.scrollTop, 0);
  assert.equal(h.document.activeElement.type, 'h2');
  h.unmount();
});

test('restoring a mobile account page from back-forward cache returns to the welcome screen', () => {
  const h = welcomeHarness();
  h.render(); h.paint(); h.afterPaint();
  const input = h.input();
  h.pageShow(true);
  assert.equal(input.blurs, 1);
  assert.equal(h.document.activeElement.type, 'h2');
  h.unmount();
});

test('desktop keeps its existing after-paint heading focus without mobile restoration handling', () => {
  const h = welcomeHarness('web');
  const input = h.input();
  h.render(); h.paint();
  assert.equal(h.document.activeElement, input);
  assert.equal(input.blurs, 0);
  h.afterPaint();
  assert.equal(h.document.activeElement.type, 'h2');
  assert.equal(h.listeners.size, 0);
  h.unmount();
});

function nodes(tree) {
  return React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
}

test('sign-in embeds Hello World media and the existing form on MOBILE and WEB without the static icon or appearance surface', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = welcomeHarness(presentation), actions = [];
    const form = React.createElement('form', { onSubmit: () => actions.push('submit') },
      React.createElement('input', { id: 'email', type: 'email', autoComplete: 'email' }),
      React.createElement('input', { id: 'password', type: 'password', autoComplete: 'current-password' }),
      React.createElement('button', { type: 'submit' }, 'Sign in'));
    const tree = h.render('Sign in', { signIn: true, showAppearance: true, children: form, onDismiss: () => actions.push('dismiss') });
    assert.equal(tree.props['data-account-signin'], true);
    const media = nodes(tree).filter(node => node.type === 'welcome-media');
    assert.equal(media.length, 1);
    assert.equal(media[0].props.welcomeMedia, true);
    assert.equal(media[0].props.landing, undefined, 'The sign-in form owns the actions; embedded media must not add landing controls');
    assert.equal(media[0].props.onComplete, undefined, 'Media readiness cannot dismiss the sign-in form');
    assert.equal(nodes(tree).some(node => node.type === 'img'), false, 'The old static app-icon is removed');
    assert.equal(nodes(tree).some(node => node.props.className?.includes('auth-signin-vanta')), false);
    assert.equal(nodes(tree).some(node => node.props.className?.includes('account-welcome-appearance')), false);
    assert.equal(nodes(tree).some(node => node.props.role === 'radiogroup'), false);
    assert.equal(nodes(tree).find(node => node.type === 'header').props.className, 'sr-only');
    assert.equal(nodes(tree).find(node => node.type === 'h2').props.children, 'Sign in');
    assert.equal(nodes(tree).find(node => node.props.role === 'dialog').props['aria-label'], 'Sign in');
    assert.equal(nodes(tree).find(node => node.type === 'form').props, form.props,
      'Embedding media preserves the supplied form inputs and handlers');
    nodes(tree).find(node => node.type === 'form').props.onSubmit();
    nodes(tree).find(node => node.props['aria-label'] === (presentation === 'mobile' ? 'Back' : 'Close')).props.onClick();
    assert.deepEqual(actions, ['submit', 'dismiss']);
    h.paint(); h.afterPaint(); h.unmount();
  }
});

test('signup and recovery retain their existing heading, frame and caller-controlled appearance options', () => {
  for (const presentation of ['mobile', 'web']) {
    for (const title of ['Create your account', 'Reset your password']) {
      const h = welcomeHarness(presentation);
      const mobileOnboarding = presentation === 'mobile' && title === 'Create your account';
      let tree = h.render(title, { mobileOnboarding, showAppearance: true });
      assert.equal(tree.props['data-account-signin'], undefined);
      assert.equal(tree.props['data-mobile-onboarding'], mobileOnboarding ? 'dark' : undefined);
      assert.equal(nodes(tree).some(node => node.type === 'welcome-media'), false);
      assert.ok(nodes(tree).find(node => node.props.role === 'dialog').props.className.includes('auth-signin-vanta'));
      assert.ok(nodes(tree).find(node => node.type === 'header').props.className.includes('account-welcome-heading'));
      assert.ok(nodes(tree).some(node => node.props.className?.includes('account-welcome-appearance')));
      tree = h.render(title, { mobileOnboarding, showAppearance: false });
      assert.equal(nodes(tree).some(node => node.props.className?.includes('account-welcome-appearance')), false);
      h.paint(); h.afterPaint(); h.unmount();
    }
  }
});

test('the mobile onboarding CSS scope cannot be emitted on WEB even with a retained signup prop', () => {
  const h = welcomeHarness('web');
  const tree = h.render('Create your account', { mobileOnboarding: true });
  assert.equal(tree.props['data-mobile-onboarding'], undefined);
  h.paint(); h.afterPaint(); h.unmount();
});

test('dirty account navigation keeps its draft and confirms the exact leave action in the appropriate platform surface', () => {
  for (const mode of ['mobile', 'web']) {
    const h = welcomeHarness(mode), actions = [];
    let requestLeave;
    const draft = React.createElement('input', { id: 'retained-draft', value: 'Unsubmitted name', readOnly: true });
    const props = { dirty: true, mobileOnboarding: true, showAppearance: false, onDismiss: () => actions.push('dismiss'),
      children: leave => { requestLeave = leave; return draft; } };
    const render = () => { const tree = h.render('Create your account', props); h.paint(); h.afterPaint(); return tree; };
    render();
    requestLeave(() => actions.push('switch-account-flow'));
    let tree = render();
    const sheet = nodes(tree).find(node => node.type === 'section');
    const content = nodes(tree).find(node => node.props.className?.includes('account-welcome-content'));
    const layer = nodes(tree).find(node => node.type === 'discard-layer');
    const inline = nodes(tree).find(node => node.props.role === 'alertdialog');
    assert.deepEqual(actions, [], 'Opening confirmation cannot navigate or discard');
    assert.equal(nodes(tree).find(node => node.props.hidden === true).props.children, draft, 'The draft stays mounted but hidden');
    assert.ok(layer);assert.equal(inline,undefined);assert.equal(layer.props.title,'Discard your changes?');
    layer.props.onCancel();
    tree = render();
    assert.equal(nodes(tree).some(node => node.type === 'discard-layer' || node.props.role === 'alertdialog'), false);
    assert.equal(nodes(tree).find(node => node.props.hidden === false).props.children, draft);
    assert.equal(h.document.activeElement.type, 'h2');
    assert.equal(h.document.activeElement.focusOptions.preventScroll, true);
    assert.deepEqual(actions, []);
    requestLeave(() => actions.push('switch-account-flow'));
    tree = render();
    nodes(tree).find(node=>node.type==='discard-layer').props.onConfirm();
    tree = render();
    assert.deepEqual(actions, ['switch-account-flow'], 'Discard runs the pending callback, not an unrelated dismiss');
    assert.equal(nodes(tree).some(node => node.type === 'discard-layer' || node.props.role === 'alertdialog'), false);
    h.unmount();
  }
});

test('mobile dirty Back, confirmation Escape and busy state never bypass discard consent', () => {
  const h = welcomeHarness(), actions = [];
  const props = { dirty: true, busy: true, onDismiss: () => actions.push('dismiss'), showAppearance: false };
  const render = () => { const tree = h.render('Create your account', props); h.paint(); h.afterPaint(); return tree; };
  const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props.children === label || node.props['aria-label'] === label));
  let tree = render();
  button(tree, 'Back').props.onClick();
  assert.equal(nodes(render()).some(node => node.type === 'discard-layer'), false);
  props.busy = false;
  tree = render(); button(tree, 'Back').props.onClick(); tree = render();
  assert.ok(nodes(tree).find(node => node.type === 'discard-layer'));
  h.escape();
  assert.equal(nodes(render()).some(node => node.type === 'discard-layer'), false);
  assert.deepEqual(actions, []);
  tree = render(); button(tree, 'Back').props.onClick(); render();
  props.busy = true; tree = render();
  assert.equal(nodes(tree).find(n=>n.type==='discard-layer').props.pending,true);
  nodes(tree).find(n=>n.type==='discard-layer').props.onConfirm();
  assert.deepEqual(actions, []);
  assert.ok(nodes(render()).find(node => node.type === 'discard-layer'));
  props.busy = false; tree = render();
  nodes(tree).find(node => node.type === 'discard-layer').props.onCancel();
  assert.equal(nodes(render()).some(node => node.type === 'discard-layer'), false);
  tree = render(); button(tree, 'Back').props.onClick(); tree = render();
  nodes(tree).find(n=>n.type==='discard-layer').props.onConfirm();
  assert.deepEqual(actions, ['dismiss']);
  h.unmount();
});

test('profile setup has one focused headline, decorative character and the unchanged supplied form in both themes and platforms',()=>{
 for(const mode of ['mobile','web'])for(const theme of ['light','dark']){
  const h=welcomeHarness(mode),actions=[],form=React.createElement('form',{onSubmit:()=>actions.push('submit')},React.createElement('input',{id:'profile-name'}),React.createElement('button',{type:'submit'},'Continue'));
  const tree=h.render('Create your profile',{profileSetup:true,theme,children:form,onDismiss:()=>actions.push('dismiss')});
  assert.equal(tree.props['data-profile-setup'],theme);assert.equal(tree.props['data-presentation'],mode);assert.equal(tree.props['data-account-signin'],undefined);assert.equal(tree.props['data-mobile-onboarding'],undefined);
  const headings=nodes(tree).filter(node=>typeof node.type==='string'&&/^h[1-6]$/.test(node.type));assert.equal(headings.length,1);assert.equal(headings[0].type,'h1');assert.equal(headings[0].props.children,'Create your profile');assert.equal(headings[0].props.tabIndex,-1);
  const dialog=nodes(tree).find(node=>node.props.role==='dialog');assert.equal(dialog.props['aria-label'],'Create your profile');assert.equal(dialog.props['aria-modal'],'true');assert.equal(dialog.props['data-ui-surface'],mode==='mobile'?'sheet':'popup');
  const art=nodes(tree).find(node=>node.props['aria-hidden']==='true'&&nodes(node).some(child=>child.type==='img'));assert.equal(nodes(art).find(node=>node.type==='img').props.alt,'');
  assert.ok(nodes(tree).some(node=>node.type==='p'&&node.props.children==='Make a home for your ideas.'));
  assert.equal(nodes(tree).find(node=>node.type==='form').props,form.props);nodes(tree).find(node=>node.type==='form').props.onSubmit();
  assert.deepEqual(h.accentCalls.at(-1),{color:'#ff2d55',scheme:theme});
  h.paint();h.afterPaint();assert.equal(h.document.activeElement.type,'h1');assert.equal(h.document.activeElement.focusOptions.preventScroll,true);
  nodes(tree).find(node=>node.props['aria-label']==='Close profile setup').props.onClick();assert.deepEqual(actions,['submit','dismiss']);h.unmount();
 }
});

test('profile setup retains the optional WEB appearance controls and their callbacks without adding them to MOBILE',()=>{
 const swatches=[{id:'pink',label:'Pink',dark:'#ff2d55'},{id:'blue',label:'Blue',dark:'#0A84FF'}];
 for(const mode of ['mobile','web']){
  const h=welcomeHarness(mode,{navAccents:swatches}),calls=[];
  const props={profileSetup:true,showAppearance:true,highContrast:false,reduceTranslucency:false,onAccentColorChange:value=>calls.push(['accent',value]),onHighContrastChange:value=>calls.push(['contrast',value]),onReduceTranslucencyChange:value=>calls.push(['solid',value])};
  let tree=h.render('Create your profile',props),disclosure=nodes(tree).find(node=>node.type==='details');
  assert.equal(Boolean(disclosure),mode==='web');
  if(mode==='web'){
   assert.equal(disclosure.props.open,undefined);assert.equal(nodes(disclosure).find(node=>node.type==='summary').props.children,'Appearance');
   const radios=nodes(disclosure).filter(node=>node.props.role==='radio');assert.deepEqual(radios.map(node=>node.props['aria-label']),['Pink','Blue']);assert.equal(radios[0].props['aria-checked'],true);assert.equal(radios[0].props.tabIndex,0);assert.equal(radios[1].props.tabIndex,-1);
   radios[1].props.onClick();nodes(disclosure).find(node=>node.props.id==='welcome-high-contrast').props.onToggle();nodes(disclosure).find(node=>node.props.id==='welcome-reduce-translucency').props.onToggle();
   assert.deepEqual(calls,[['accent','#0A84FF'],['contrast',true],['solid',true]]);
   tree=h.render('Create your profile',{...props,busy:true});disclosure=nodes(tree).find(node=>node.type==='details');let prevented=false;nodes(disclosure).find(node=>node.type==='summary').props.onClick({preventDefault(){prevented=true;}});
   assert.equal(prevented,true);assert.equal(nodes(disclosure).find(node=>node.type==='fieldset').props.disabled,true);assert.ok(nodes(disclosure).filter(node=>node.props.role==='radio').every(node=>node.props.disabled));
  }else assert.equal(nodes(tree).some(node=>node.props.role==='radiogroup'),false);
  tree=h.render('Create your profile',{...props,showAppearance:false});assert.equal(nodes(tree).some(node=>node.type==='details'),false);h.paint();h.afterPaint();h.unmount();
 }
});

test('profile setup dirty leave retains hidden fields, confirms the exact action and restores its heading',()=>{
 for(const mode of ['mobile','web']){
  const h=welcomeHarness(mode),calls=[];let requestLeave;
  const form=React.createElement('form',null,React.createElement('input',{value:'Retained name',readOnly:true}));
  const props={profileSetup:true,showAppearance:true,dirty:true,onDismiss:()=>calls.push('dismiss'),children:leave=>{requestLeave=leave;return form;}};
  const render=()=>{const tree=h.render('Create your profile',props);h.paint();h.afterPaint();return tree;};
  render();requestLeave(()=>calls.push('exact-action'));let tree=render();
  assert.equal(nodes(tree).find(node=>node.type==='fieldset'&&node.props.hidden===true).props.children,form);assert.deepEqual(calls,[]);
  const disclosure=nodes(tree).find(node=>node.type==='details');if(disclosure)assert.equal(disclosure.props.hidden,true);
  h.escape();tree=render();assert.equal(nodes(tree).some(node=>node.type==='discard-layer'),false);assert.deepEqual(calls,[]);
  requestLeave(()=>calls.push('exact-action'));tree=render();nodes(tree).find(node=>node.type==='discard-layer').props.onCancel();tree=render();
  assert.equal(h.document.activeElement.type,'h1');assert.equal(h.document.activeElement.focusOptions.preventScroll,true);assert.equal(nodes(tree).find(node=>node.type==='fieldset'&&node.props.hidden===false).props.children,form);
  requestLeave(()=>calls.push('exact-action'));tree=render();nodes(tree).find(node=>node.type==='discard-layer').props.onConfirm();render();assert.deepEqual(calls,['exact-action']);h.unmount();
 }
});

test('profile setup busy close, backdrop and Escape cannot bypass its retained dirty draft',()=>{
 for(const mode of ['mobile','web']){
  const h=welcomeHarness(mode),calls=[],props={profileSetup:true,dirty:true,busy:true,onDismiss:()=>calls.push('dismiss')};
  const render=()=>{const tree=h.render('Create your profile',props);h.paint();h.afterPaint();return tree;};
  let tree=render();assert.equal(nodes(tree).find(node=>node.props['aria-label']==='Close profile setup').props.disabled,true);assert.equal(nodes(tree).find(node=>node.type==='fieldset').props.disabled,true);
  nodes(tree).find(node=>node.props['aria-label']==='Close profile setup').props.onClick();tree.props.onPointerDown({target:tree,currentTarget:tree});h.escape();assert.equal(nodes(render()).some(node=>node.type==='discard-layer'),false);assert.deepEqual(calls,[]);
  props.busy=false;tree=render();tree.props.onPointerDown({target:{},currentTarget:tree});assert.equal(nodes(render()).some(node=>node.type==='discard-layer'),false);
  tree.props.onPointerDown({target:tree,currentTarget:tree});render();props.busy=true;tree=render();const confirmation=nodes(tree).find(node=>node.type==='discard-layer');assert.equal(confirmation.props.pending,true);confirmation.props.onConfirm();assert.deepEqual(calls,[]);
  props.busy=false;tree=render();nodes(tree).find(node=>node.type==='discard-layer').props.onConfirm();assert.deepEqual(calls,['dismiss']);h.unmount();
 }
});

test('MOBILE profile setup reveals clipped fields within its own scroller and resets it only on arrival or restored page',()=>{
 for(const profileSetup of [false,true]){
  const h=welcomeHarness('mobile',{queuedFrames:true}),children=React.createElement('form',null,React.createElement('div',{className:'profile-setup-fields'},React.createElement('input',{id:'profile-name'})));
  const props={profileSetup,children,showAppearance:false},title='Create your profile';
  h.render(title,props);h.profileFields.bounds={top:250,bottom:500};h.paint();h.afterPaint();
  assert.equal(h.profileFields.scrollTop,profileSetup?0:200,'Only the opt-in fields scroller participates in profile arrival reset.');
  const input=h.element('input');input.bounds={top:550,bottom:590};input.focus();
  h.resize();h.flushFrames();assert.equal(input.scrolls.length,profileSetup?1:0,'An input visible in the outer frame still needs reveal when clipped by the profile fields viewport.');
  if(profileSetup)assert.deepEqual(JSON.parse(JSON.stringify(input.scrolls[0])),{block:'center',inline:'nearest',behavior:'instant'});
  input.bounds={top:300,bottom:350};h.resize();h.flushFrames();assert.equal(input.scrolls.length,profileSetup?1:0,'Already visible fields must not scroll again.');
  h.profileFields.scrollTop=120;h.render(title,{...props,theme:'light'});h.paint();h.afterPaint();h.pageShow(false);
  assert.equal(h.document.activeElement,input);assert.equal(h.profileFields.scrollTop,120,'Ordinary appearance rerenders and keyboard changes retain scroll and typing.');
  h.pageShow(true);assert.equal(h.document.activeElement.type,profileSetup?'h1':'h2');assert.equal(h.profileFields.scrollTop,profileSetup?0:120);h.unmount();
 }
});
