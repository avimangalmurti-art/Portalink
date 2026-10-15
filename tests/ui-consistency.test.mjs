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
  const document = {
    activeElement: null,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  };
  function dispatch(name, event) { for (const listener of [...listeners.get(name) ?? []]) listener(event); }
  class Element {
    constructor(parent = null, modal = false) {
      this.parent = parent; this.modal = modal; this.children = []; this.isConnected = true;
      this.disabled = false; this.hidden = false; this.visibility = 'visible'; this.tabIndex = 0;
      parent?.children.push(this);
    }
    contains(other) { return other === this || this.children.some((child) => child.contains(other)); }
    closest(selector) {
      if (selector.includes('role=')) return this.modal ? this : this.parent?.closest(selector) ?? null;
      return this.hidden ? this : this.parent?.closest(selector) ?? null;
    }
    matches(selector) { return selector === ':disabled' && this.disabled; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    querySelectorAll() { return this.children.flatMap((child) => [child, ...child.querySelectorAll()]); }
    focus(options) {
      if (this.disabled || this.hidden || this.visibility === 'hidden') return;
      this.focusOptions = options;
      document.activeElement = this; dispatch('focusin', { target: this });
    }
  }
  const { containModalFocus } = compile('../src/hooks/useModalFocus.ts', {
    document, HTMLElement: Element, getComputedStyle: (element) => ({ visibility: element.visibility }),
  });
  return { document, Element, containModalFocus, key(key, shiftKey = false) {
    const event = { key, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    dispatch('keydown', event); return event;
  } };
}

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
