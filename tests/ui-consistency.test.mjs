import {motionFixture} from './helpers/motion-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: () => ({}), ...globals });
  return exports;
}
const { allocateProjectPanels: allocate } = compile('../src/utils/projectPanelLayout.ts');
const { positionAnchoredMenu: position } = compile('../src/utils/anchoredMenu.ts');

test('shared panel allocation preserves work and restores wide preferences', () => {
  const wide = allocate(1400, true, true, 420, 440, 304, null, null);
  assert.deepEqual([wide.indexWidth, wide.responseWidth, wide.workWidth], [420, 440, 540]);
  for (const width of [327, 664, 780, 844, 1000, 1180]) {
    for (const minimum of [240, 304]) {
      for (const priority of ['index', 'response']) {
        const result = allocate(width, true, true, 420, 440, minimum, priority, null);
        assert.equal(result.indexWidth + result.responseWidth + result.workWidth, width);
        assert.ok(result.workWidth >= Math.min(320, width - 104));
        if (result.indexOpen) assert.ok(result.indexWidth >= 220);
        if (result.responseOpen) assert.ok(result.responseWidth >= minimum);
      }
    }
  }
  assert.deepEqual(allocate(1400, true, true, 420, 440, 304, null, null), wide);
});

test('compact panels can be opened, closed, and safely lose their project', () => {
  for (const panel of ['index', 'response']) {
    const result = allocate(327, true, true, 420, 440, 304, panel, panel);
    assert.equal(result.singlePanel, panel);
    assert.equal(result[panel + 'Width'], 327);
    assert.equal(result.workWidth, 0);
  }
  const closed = allocate(327, true, false, 420, 440, 304, 'response', null);
  assert.equal(closed.singlePanel, null);
  assert.ok(closed.workWidth > 0);
  const removed = allocate(327, true, true, 420, 440, 304, 'response', 'response', false);
  assert.equal(removed.responseWidth, 0);
  assert.equal(removed.indexWidth, 52);
  assert.equal(removed.workWidth, 275);
});

test('resizing a compressed panel follows the requested direction and respects work space', () => {
  for (const panel of ['index', 'response']) {
    const initial = allocate(1000, true, true, 320, 340, 304, panel, null);
    const requested = initial[panel + 'Width'] + 12;
    const next = allocate(1000, true, true, panel === 'index' ? requested : 320,
      panel === 'response' ? requested : 340, 304, panel, null);
    assert.equal(next[panel + 'Width'], requested);
    assert.ok(next.workWidth >= 320);
  }
});

test('menus flip at the lower edge and remain inside short or narrow viewports', () => {
  const anchor = { right: 790, top: 540, bottom: 580 };
  const result = position(anchor, 192, 242, 800, 600);
  assert.equal(result.top, 292);
  assert.ok(result.left + 192 <= 792);
  const short = position({ right: 190, top: 90, bottom: 130 }, 192, 420, 200, 180);
  assert.equal(short.maxHeight, 164);
  assert.equal(short.top, 8);
  assert.equal(short.left, 8);
});

function focusEnvironment() {
  const listeners = new Map();
  const window = { visualViewport: { scale: 1 } };
  const captures = options => typeof options === 'boolean' ? options : Boolean(options?.capture);
  const document = {
    activeElement: null,
    addEventListener(name, fn, options) {
      if (!listeners.has(name)) listeners.set(name, new Map());
      listeners.get(name).set(fn, options);
    },
    removeEventListener(name, fn, options) {
      const registered = listeners.get(name);
      if (registered?.has(fn) && captures(registered.get(fn)) === captures(options)) registered.delete(fn);
    },
  };
  function dispatch(name, event) {
    for (const [listener, options] of [...listeners.get(name) ?? []]) {
      event.passive = options?.passive ?? ['touchstart', 'touchmove', 'wheel'].includes(name);
      listener(event);
    }
  }
  class Element {
    constructor(parent = null, modal = false) {
      this.parent = parent; this.parentElement = parent; this.modal = modal; this.children = []; this.isConnected = true;
      this.disabled = false; this.hidden = false; this.visibility = 'visible'; this.tabIndex = 0;
      this.dataset = {}; this.isShell = false;
      this.scrollHeight = 100; this.clientHeight = 100; this.scrollTop = 0; this.overflowY = 'visible';
      parent?.children.push(this);
    }
    contains(other) { return other === this || this.children.some((child) => child.contains(other)); }
    closest(selector) {
      if (selector === '.codex-shell') return this.isShell ? this : this.parent?.closest(selector) ?? null;
      if (selector === '.screen-exit') return this.exiting ? this : this.parent?.closest(selector) ?? null;
      if (selector.includes('role=')) return this.modal ? this : this.parent?.closest(selector) ?? null;
      return this.hidden ? this : this.parent?.closest(selector) ?? null;
    }
    matches(selector) {
      if (selector === '[data-presentation="mobile"]') return this.dataset.presentation === 'mobile';
      return selector === ':disabled' && this.disabled;
    }
    getClientRects() { return this.hidden ? [] : [{}]; }
    querySelectorAll() { return this.children.flatMap((child) => [child, ...child.querySelectorAll()]); }
    focus(options) {
      if (this.disabled || this.hidden || this.visibility === 'hidden') return;
      this.focusOptions = options;
      document.activeElement = this; dispatch('focusin', { target: this });
    }
  }
  const { containModalFocus, dismissTopModal } = compile('../src/hooks/useModalFocus.ts', {
    document, window, HTMLElement: Element, getComputedStyle: (element) => ({ visibility: element.visibility, overflowY: element.overflowY }),
  });
  return {
    document, window, Element, containModalFocus, dismissTopModal,
    key(key, shiftKey = false) {
      const event = { key, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
      dispatch('keydown', event); return event;
    },
    input(name, target, details = {}) {
      const path = [];
      for (let element = target; element; element = element.parentElement) path.push(element);
      const event = { target, cancelable: true, defaultPrevented: false, deltaX: 0, deltaY: 0, ctrlKey: false, touches: [],
        composedPath: () => [...path, document, window],
        preventDefault() { if (this.cancelable && !this.passive) this.defaultPrevented = true; }, ...details };
      dispatch(name, event); return event.defaultPrevented;
    },
    listenerCount(name) { return listeners.get(name)?.size ?? 0; },
  };
}

test('system dismissal awaits the active child without closing its parent', async () => {
  const env = focusEnvironment();
  const parent = new env.Element(null, true), child = new env.Element(null, true);
  let parentCloses = 0, childCloses = 0, finish;
  const releaseParent = env.containModalFocus(parent, () => { parentCloses++; });
  const releaseChild = env.containModalFocus(child, () => { childCloses++; return new Promise(resolve => { finish = resolve; }); });
  const dismissal = env.dismissTopModal();
  let finished = false;
  Promise.resolve(dismissal).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(childCloses, 1); assert.equal(parentCloses, 0); assert.equal(finished, false);
  finish(); await dismissal;
  releaseChild(); await env.dismissTopModal();
  assert.equal(parentCloses, 1);
  releaseParent(); assert.equal(env.dismissTopModal(), false);
});

test('only the top modal handles Escape and Tab; closing returns to its opener', () => {
  const env = focusEnvironment();
  const opener = new env.Element(); opener.focus();
  const parent = new env.Element(null, true); parent.tabIndex = -1;
  const first = new env.Element(parent); const last = new env.Element(parent);
  let parentEscapes = 0, childEscapes = 0;
  const closeParent = env.containModalFocus(parent, () => parentEscapes++);
  last.focus(); env.key('Tab'); assert.equal(env.document.activeElement, first);
  first.focus(); env.key('Tab', true); assert.equal(env.document.activeElement, last);
  const child = new env.Element(null, true); child.tabIndex = -1;
  const childFirst = new env.Element(child);
  const closeChild = env.containModalFocus(child, () => childEscapes++);
  env.key('Tab'); assert.equal(env.document.activeElement, childFirst);
  first.focus(); assert.equal(env.document.activeElement, childFirst);
  env.key('Escape'); assert.equal(childEscapes, 1); assert.equal(parentEscapes, 0);
  closeChild(); assert.equal(env.document.activeElement, last);
  closeParent(); assert.equal(env.document.activeElement, opener);
});

test('a newly disabled or hidden focused control cannot release modal focus', () => {
  const env = focusEnvironment(); const background = new env.Element(); background.focus();
  const dialog = new env.Element(null, true); dialog.tabIndex = -1;
  const first = new env.Element(dialog); const last = new env.Element(dialog);
  const close = env.containModalFocus(dialog, () => {});
  last.focus(); last.disabled = true; background.focus();
  assert.equal(env.document.activeElement, first);
  first.visibility = 'hidden'; background.focus();
  assert.equal(env.document.activeElement, dialog);
  env.key('Tab'); assert.equal(env.document.activeElement, dialog);
  close();
});

test('animated sheets can retain focus without scrolling the overlay on open, trap or close', () => {
  const env = focusEnvironment();
  const opener = new env.Element(); opener.focus();
  const dialog = new env.Element(null, true); dialog.tabIndex = -1;
  const first = new env.Element(dialog), last = new env.Element(dialog);
  const close = env.containModalFocus(dialog, () => {}, true);
  assert.equal(dialog.focusOptions.preventScroll, true);
  env.key('Tab'); assert.equal(first.focusOptions.preventScroll, true);
  env.key('Tab', true); assert.equal(last.focusOptions.preventScroll, true);
  opener.focus(); assert.equal(env.document.activeElement, last);
  assert.equal(last.focusOptions.preventScroll, true);
  close();
  assert.equal(env.document.activeElement, opener);
  assert.equal(opener.focusOptions.preventScroll, true);
});

function modalScrollEnvironment() {
  const env = focusEnvironment();
  const shell = new env.Element(); shell.isShell = true; shell.dataset.presentation = 'mobile';
  const background = new env.Element(shell); background.overflowY = 'auto'; background.scrollHeight = 450; background.scrollTop = 50;
  const backdrop = new env.Element(shell);
  const dialog = new env.Element(backdrop, true); dialog.tabIndex = -1;
  const scroller = new env.Element(dialog); scroller.overflowY = 'auto'; scroller.scrollHeight = 250;
  const item = new env.Element(scroller);
  const close = env.containModalFocus(dialog, () => {}, true);
  return { ...env, shell, background, backdrop, dialog, scroller, item, close };
}

test('mobile modal wheel scrolling stays inside the active dialog and stops at its scroll boundaries', () => {
  const h = modalScrollEnvironment();
  const wheel = (target, deltaY, details) => h.input('wheel', target, { deltaY, ...details });
  assert.equal(wheel(h.item, 40), false, 'a descendant can scroll its dialog scrollport');
  assert.equal(wheel(h.item, -40), true, 'the top boundary cannot move the page');
  h.scroller.scrollTop = 150;
  assert.equal(wheel(h.scroller, 40), true, 'the bottom boundary cannot move the page');
  assert.equal(wheel(h.scroller, -40), false, 'an element can scroll directly');
  assert.equal(wheel(h.backdrop, 40), true);
  assert.equal(wheel(h.background, 40), true, 'a scrollable background is not part of the dialog');
  const inner = new h.Element(h.scroller); inner.overflowY = 'auto'; inner.scrollHeight = 160; inner.scrollTop = 60;
  assert.equal(wheel(inner, 40), true, 'neither scrollport can move further down');
  h.scroller.scrollTop = 50;
  assert.equal(wheel(inner, 40), false, 'a parent scrollport inside the dialog can move when its child reaches the edge');
  h.scroller.overflowY = 'hidden';
  assert.equal(wheel(h.item, -40), true, 'a clipped ancestor does not consume wheel scrolling');
  assert.equal(wheel(h.backdrop, 5, { deltaX: 80 }), false, 'horizontal wheel remains available');
  assert.equal(wheel(h.backdrop, 40, { ctrlKey: true }), false, 'browser zoom remains available');

  h.shell.dataset.presentation = 'web';
  assert.equal(wheel(h.backdrop, 40), false, 'an existing dialog relinquishes the boundary on desktop');
  h.shell.dataset.presentation = 'mobile';
  assert.equal(wheel(h.backdrop, 40), true);
  h.close();
  assert.equal(wheel(h.background, 40), false);
  for (const event of ['wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) assert.equal(h.listenerCount(event), 0, `${event} listener leaked`);
});

test('mobile modal touch scrolling allows vertical content movement, horizontal gestures and pinch zoom', () => {
  const h = modalScrollEnvironment();
  const point = (clientX, clientY, identifier = 1) => ({ clientX, clientY, identifier });
  const start = target => h.input('touchstart', target, { touches: [point(100, 150)] });
  const move = (target, x, y) => h.input('touchmove', target, { touches: [point(x, y)] });
  start(h.item);
  assert.equal(move(h.item, 100, 110), false, 'the inner scrollport can consume upward motion');
  h.scroller.scrollTop = 150;
  assert.equal(move(h.item, 100, 70), true, 'upward motion at its bottom is contained');
  h.input('touchend', h.item);
  start(h.backdrop);
  assert.equal(move(h.backdrop, 100, 110), true, 'the backdrop cannot move the page');
  h.input('touchcancel', h.backdrop);
  start(h.backdrop);
  assert.equal(move(h.backdrop, 145, 145), false, 'horizontal gestures remain available');
  assert.equal(h.input('touchmove', h.backdrop, { touches: [point(145, 110), point(200, 120, 2)] }), false, 'pinch zoom remains available');
  h.window.visualViewport.scale = 1.5;
  start(h.backdrop);
  assert.equal(move(h.backdrop, 100, 110), false, 'a zoomed viewport can still pan');
  h.window.visualViewport.scale = 1;
  h.close();
  start(h.background);
  assert.equal(move(h.background, 100, 110), false, 'closing releases native page scrolling');
});

test('a child mobile modal owns scrolling until it closes and hands it back to its parent', () => {
  const h = modalScrollEnvironment();
  const child = new h.Element(h.dialog, true); child.tabIndex = -1;
  const childBody = new h.Element(child); childBody.overflowY = 'auto'; childBody.scrollHeight = 200;
  const closeChild = h.containModalFocus(child, () => {}, true);
  const wheel = target => h.input('wheel', target, { deltaY: 40 });
  assert.equal(wheel(childBody), false, 'parent cannot block the child scrollport');
  assert.equal(wheel(h.item), true, 'child guards the parent scrollport');
  childBody.scrollTop = 100;
  assert.equal(wheel(childBody), true, 'child edge cannot spill into its parent');
  child.exiting = true;
  assert.equal(wheel(h.item), false, 'an exiting layer cannot claim the scroll boundary');
  closeChild();
  assert.equal(wheel(h.item), false, 'parent resumes scrolling');
  assert.equal(wheel(h.background), true, 'parent still contains the document');
  h.close();
  assert.equal(wheel(h.background), false);
});

test('project editor Escape uses existing dirty and transfer safeguards', () => {
  for (const state of [{}, { isDirty: true }, { isDirty: true, isSaving: true }, { isTransferring: true }, { cleaning: true }]) {
    let closed = 0; const changes = [];
    const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
      useLayoutEffect() {}, useRef: () => ({ current: null }), useEffect() {}, useState: (initial) => [initial, (next) => changes.push(next)] };
    const { ProjectEditorDialog } = compile('../src/features/projects/ProjectEditorDialog.tsx', { require(name) {
      if(name.endsWith('/motion/motion')) return motionFixture;
      if (name.endsWith('/useTouchTap')) return {useTouchTap:fn=>({onPointerDown:fn})};
      if (name.endsWith('/usePresentation')) return {usePresentation:()=> 'web'};
      if (name === 'react') return react;
      return new Proxy({}, { get: (_, key) => key });
    } });
    const dialog = ProjectEditorDialog({ management: { editor: { projectId: 'project', phase: 'loading', addedMedia: {}, attachmentEdits: [], originalAttachments: [],
      upload: { isCleaningUp: state.cleaning }, close() { closed++; }, ...state } } });
    dialog.props.onClose();
    const blocked = state.isSaving || state.isTransferring || state.cleaning;
    assert.equal(closed, !blocked && !state.isDirty ? 1 : 0);
    assert.equal(changes.includes(true), Boolean(!blocked && state.isDirty));
  }
});

test('shared project dialog sends all dismissal paths through the same transfer lock', () => {
  for (const closeDisabled of [false, true]) {
    let escape, closed = 0;
    const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useLayoutEffect() {}, useRef: () => ({ current: null }) };
    const { ProjectFormDialog } = compile('../src/components/publishing/ProjectFormDialog.tsx', { React: react, require(name) {
      if(name.endsWith('/motion/motion')) return motionFixture;
      if (name.endsWith('/useTouchTap')) return {useTouchTap:fn=>({onPointerDown:fn})};
      if (name.endsWith('/usePresentation')) return {usePresentation:()=> 'web'};
      if (name === 'react') return react;
      if (name === 'framer-motion') return { motion: { div: 'div', section: 'section' }, useReducedMotion: () => true };
      if (name.endsWith('/useModalFocus')) return { useModalFocus: (_open, _ref, fn) => { escape = fn; } };
      if (name.endsWith('/useDialogViewport')) return { useDialogViewport: () => ({ current: null }) };
      return new Proxy({}, { get: (_, key) => key });
    } });
    const tree = ProjectFormDialog({ title: 'Project', titleId: 'project-title', closeDisabled, onClose: () => closed++, children: 'Fields' });
    const backdrop = tree.props.children[0];
    const section = backdrop.props.children[0];
    const close = section.props.children[0].props.children[1];
    assert.equal(section.props.role, 'dialog');
    assert.equal(close.props.disabled, closeDisabled);
    close.props.onClick();
    backdrop.props.onPointerDown({ target: backdrop, currentTarget: backdrop });
    escape();
    assert.equal(closed, closeDisabled ? 0 : 3);
    backdrop.props.onPointerDown({ target: section, currentTarget: backdrop });
    assert.equal(closed, closeDisabled ? 0 : 3);
  }
});

test('editing keeps Save associated with the form so Enter uses the normal save path', async () => {
  let saved = 0, prevented = false;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useLayoutEffect() {}, useRef: () => ({ current: null }), useEffect() {}, useState: (initial) => [initial, () => {}] };
  const { ProjectEditorDialog } = compile('../src/features/projects/ProjectEditorDialog.tsx', { require(name) {
      if(name.endsWith('/motion/motion')) return motionFixture;
    if (name.endsWith('/useTouchTap')) return {useTouchTap:fn=>({onPointerDown:fn})};
      if (name.endsWith('/usePresentation')) return {usePresentation:()=> 'web'};
      if (name === 'react') return react;
    return new Proxy({}, { get: (_, key) => key });
  } });
  const tree = ProjectEditorDialog({ management: { editor: {
    projectId: 'project', phase: 'editing', attachmentEdits: [], originalAttachments: [],
    metadata: { title: 'Project', summary: 'Description' }, fieldErrors: {}, isDirty: true,
    addedMedia: { items: [], capability: { isAvailable: true } }, upload: {}, save: async () => { saved++; },
  } } });
  const nodes = (value) => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
  const form = nodes(tree).find((node) => node.type === 'form');
  assert.ok(nodes(form).some((node) => node.type === 'Button' && node.props.type === 'submit' && !node.props.disabled));
  form.props.onSubmit({ preventDefault() { prevented = true; } });
  await Promise.resolve();
  assert.equal(prevented, true);
  assert.equal(saved, 1);
});

for (const initialPreference of [false, true]) test(`compact navigation preserves desktop preference ${initialPreference} across routes and presentations`, () => {
  let cursor = 0, effects = [], preferred = initialPreference, location = { pathname: '/one', search: '' }, presentation = 'web';
  const slots = [], changes = [];
  const { useCompactNavigation } = compile('../src/hooks/useCompactNavigation.ts', {
    require(name) {
      if(name.endsWith('/motion/motion')) return motionFixture;
      if (name === 'react-router-dom') return { useLocation: () => location };
      if (name === '../presentation/usePresentation') return { usePresentation: () => presentation };
      return {
        useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
          return [slots[i].value, (next) => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
        useEffect(effect, deps) { const i = cursor++; if (!slots[i] || deps.some((value, n) => value !== slots[i].deps[n])) {
          slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect(); });
        } },
      };
    },
  });
  const render = () => { cursor = 0; effects = []; const result = useCompactNavigation(preferred, (next) => { preferred = next; changes.push(next); }); effects.forEach((effect) => effect()); return result; };
  render(); assert.equal(render().collapsed, initialPreference);
  presentation = 'mobile'; render(); assert.equal(render().collapsed, true);
  render().toggle(); assert.equal(render().collapsed, false);
  location = { pathname: '/messages', search: '' }; render(); assert.equal(render().collapsed, true);
  render().toggle(); assert.equal(render().collapsed, false);
  presentation = 'web'; render(); assert.equal(render().collapsed, initialPreference);
  presentation = 'mobile'; render(); assert.equal(render().collapsed, true);
  presentation = 'web'; render(); assert.equal(render().collapsed, initialPreference);
  assert.deepEqual(changes, []);
  render().toggle(); assert.equal(render().collapsed, !initialPreference); assert.deepEqual(changes, [!initialPreference]);
});
