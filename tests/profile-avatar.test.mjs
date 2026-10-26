import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

/** Render the real components with controlled state and invoke their actual event handlers. */
function avatarHarness(props, { presentation = 'web', height = 816, offsetTop = 0, reducedMotion = false } = {}) {
  const instances = new Map();
  const elements = new Map();
  let current;
  let portalRenders = 0;
  const previewTargets = [];
  const inlineLayers = [];
  function eventTarget(attributes = {}) {
    const listeners = new Map();
    return { ...attributes, listeners,
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
      removeEventListener(name, callback) { listeners.get(name)?.delete(callback); if (listeners.get(name)?.size === 0) listeners.delete(name); },
      emit(name, event = {}) { for (const callback of [...(listeners.get(name) ?? [])]) callback(event); },
    };
  }
  const document = eventTarget({ activeElement: null });
  const viewport = eventTarget({ height, offsetTop });
  const window = eventTarget({ innerHeight: 912, visualViewport: viewport });
  class HTMLElement {
    constructor() {
      this.isConnected = true;
      const styles = new Map();
      this.style = { setProperty: (name, value) => styles.set(name, value), getPropertyValue: (name) => styles.get(name) ?? '' };
    }
    focus() { document.activeElement = this; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const react = {
    ...React,
    useCallback(callback, dependencies) {
      const index = current.cursor++;
      const previous = current.slots[index];
      if (!previous || dependencies.some((value, item) => value !== previous.dependencies[item])) current.slots[index] = { value: callback, dependencies };
      return current.slots[index].value;
    },
    useState(initial) {
      const index = current.cursor++;
      const slots = current.slots;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useEffect(callback, dependencies) {
      const index = current.cursor++;
      const previous = current.slots[index];
      if (!previous || !dependencies || dependencies.some((value, item) => value !== previous.dependencies?.[item])) {
        current.slots[index] = { callback, dependencies, cleanup: previous?.cleanup, pending: true };
      }
    },
    useRef(value) {
      const index = current.cursor++;
      if (!(index in current.slots)) current.slots[index] = { current: value };
      return current.slots[index];
    },
    useId() { return 'avatar-preview'; },
  };
  const image = { ResponsiveImage: ({ decorative, priority, measureWidth, ...attributes }) => React.createElement('img', { ...attributes, 'data-test-priority': priority, 'data-test-measure-width': measureWidth }) };
  function load(path, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText, { exports, window, document, HTMLElement, require: (id) => {
      if (id === 'react') return react;
      assert.ok(id in imports, `Unexpected import: ${id}`);
      return imports[id];
    } });
    return exports;
  }
  const dialogViewport = load('../src/hooks/useDialogViewport.ts', {});
  const creator = load('../src/components/profile/CreatorAvatar.tsx', { '../ui/ResponsiveImage': image });
  const { ProfileAvatar } = load('../src/components/profile/ProfileAvatar.tsx', {
    'framer-motion': { useReducedMotion: () => reducedMotion },
    'react-dom': { createPortal: (children, target) => { previewTargets.push(target); return children; } },
    './CreatorAvatar': creator,
    '../ui/ResponsiveImage': image,
    '../ui/ModalPortal': { ModalPortal: ({ children }) => { portalRenders++; return children; } },
    '../../hooks/useModalFocus': { containModalFocus: (dialog, onEscape, preventScroll) => { const layer = { dialog, onEscape, preventScroll }; inlineLayers.push(layer); return () => inlineLayers.splice(inlineLayers.indexOf(layer), 1); } },
    '../../hooks/useDialogViewport': dialogViewport,
    '../../presentation/usePresentation': { usePresentation: () => presentation },
  });
  let visited;
  let visitedElements;
  function expand(node, path = 'root') {
    if (Array.isArray(node)) return { children: node.map((child, index) => expand(child, `${path}.${index}`)) };
    if (!React.isValidElement(node)) return node;
    if (typeof node.type === 'function') {
      if (!instances.has(path)) instances.set(path, { slots: [], cursor: 0 });
      current = instances.get(path);
      current.cursor = 0;
      visited.add(path);
      return expand(node.type(node.props), `${path}.render`);
    }
    let element;
    if (typeof node.type === 'string') {
      if (!elements.has(path)) elements.set(path, new HTMLElement());
      element = elements.get(path);
      element.isConnected = true;
      visitedElements.add(path);
      if (node.ref) node.ref.current = element;
    }
    return { type: node.type, props: node.props, element, children: React.Children.toArray(node.props.children).map((child, index) => expand(child, `${path}.${index}`)) };
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of node.children ?? []) { const match = find(child, predicate); if (match) return match; }
    return null;
  }
  return {
    render() {
      visited = new Set();
      visitedElements = new Set();
      const tree = expand(React.createElement(ProfileAvatar, props));
      for (const [path, element] of elements) if (!visitedElements.has(path)) { element.isConnected = false; elements.delete(path); }
      for (const [path, instance] of instances) {
        if (!visited.has(path)) {
          for (const slot of instance.slots) slot?.cleanup?.();
          instances.delete(path);
        } else for (const slot of instance.slots) if (slot?.pending) {
          slot.pending = false;
          slot.cleanup?.();
          slot.cleanup = slot.callback();
        }
      }
      return tree;
    },
    document, window, viewport, inlineLayers, previewTargets, portalRenders: () => portalRenders,
    find,
  };
}

test('video avatars loop silently and share pause/resume with their existing preview', () => {
  const h = avatarHarness({ name: 'Portalink', avatar: '/poster.png', videoSrc: '/avatar.mp4', inlinePreview: true }, { presentation: 'mobile' });
  let tree = h.render();
  let video = h.find(tree, n => n.type === 'video');
  assert.equal(video.props.src, '/avatar.mp4');
  assert.equal(video.props.poster, '/poster.png');
  for (const flag of ['loop', 'muted', 'playsInline', 'autoPlay']) assert.equal(video.props[flag], true);
  assert.equal(video.element.paused, false);
  const trigger = h.find(tree, n => n.type === 'button');
  assert.equal(trigger.props['aria-label'], "View Portalink's profile video");
  trigger.props.onClick();
  tree = h.render();
  let dialog = h.find(tree, n => n.props?.role === 'dialog');
  assert.equal(h.find(dialog, n => n.type === 'video').props.src, '/avatar.mp4');
  const toggle = h.find(dialog, n => n.type === 'button');
  assert.equal(toggle.props.children, 'Pause animation');
  let stopped = false;
  toggle.props.onClick({ stopPropagation() { stopped = true; } });
  tree = h.render(); dialog = h.find(tree, n => n.props?.role === 'dialog');
  assert.ok(stopped && dialog, 'Pausing must not dismiss the viewer');
  assert.equal(h.find(tree, n => n.type === 'video').element.paused, true);
  assert.equal(h.find(dialog, n => n.type === 'video').element.paused, true);
  assert.equal(h.find(dialog, n => n.type === 'button').props.children, 'Play animation');
  h.find(dialog, n => n.type === 'button').props.onClick({ stopPropagation() {} });
  tree = h.render(); dialog = h.find(tree, n => n.props?.role === 'dialog');
  assert.equal(h.find(tree, n => n.type === 'video').element.paused, false);
  assert.equal(h.find(dialog, n => n.type === 'video').element.paused, false);
  h.inlineLayers[0].onEscape();
  assert.equal(h.find(h.render(), n => n.props?.role === 'dialog'), null);
});

test('reduced motion starts video avatars paused and decode failure retains the image preview', () => {
  const h = avatarHarness({ name: 'Portalink', avatar: '/poster.png', videoSrc: '/avatar.mp4' }, { reducedMotion: true });
  let tree = h.render();
  const video = h.find(tree, n => n.type === 'video');
  assert.equal(video.props.autoPlay, false);
  assert.equal(video.element.paused, true);
  video.props.onError();
  tree = h.render();
  assert.equal(h.find(tree, n => n.type === 'video'), null);
  const trigger = h.find(tree, n => n.type === 'button');
  assert.equal(trigger.props['aria-label'], "View Portalink's profile image");
  trigger.props.onClick();
  const dialog = h.find(h.render(), n => n.props?.role === 'dialog');
  assert.equal(h.find(dialog, n => n.type === 'img').props.src, '/poster.png');
});

test('initials avatars open and dismiss the standard preview even without an uploaded image', () => {
  for (const avatar of [undefined, null, '']) {
    const harness = avatarHarness({ name: 'ManjulaM', avatar });
    const button = harness.find(harness.render(), (node) => node.type === 'button');
    assert.ok(button, 'An initials avatar must remain clickable');
    button.props.onClick();
    let tree = harness.render();
    const dialog = harness.find(tree, (node) => node.props?.role === 'dialog');
    assert.ok(dialog);
    assert.equal(harness.find(tree, (node) => node.type === 'figcaption').props.children, 'ManjulaM');
    assert.ok(harness.find(dialog, (node) => node.type === 'span' && node.props.children === 'M'));
    dialog.props.onClick();
    tree = harness.render();
    assert.equal(harness.find(tree, (node) => node.props?.role === 'dialog'), null);
  }
});

test('welcome avatars can use the same preview inside their containing modal before the app portal exists', () => {
  const h = avatarHarness({ name: 'Portalink Networks Inc.', avatar: '/company.png', inlinePreview: true }, { presentation: 'mobile' });
  h.find(h.render(), node => node.type === 'button').props.onClick();
  assert.ok(h.find(h.render(), node => node.props?.role === 'dialog'));
  assert.equal(h.portalRenders(), 0, 'The welcome preview does not require the app-shell portal');
  assert.equal(h.inlineLayers.length, 1, 'It registers with the shared modal stack');
  assert.equal(h.inlineLayers[0].preventScroll, true);
  h.inlineLayers[0].onEscape();
  assert.equal(h.find(h.render(), node => node.props?.role === 'dialog'), null);
  assert.equal(h.inlineLayers.length, 0);
});

test('uploaded avatars open at full size and failed images fall back to initials inside the popup', () => {
  const harness = avatarHarness({ name: 'Portalink Networks', avatar: 'https://example.test/avatar.png' });
  harness.find(harness.render(), (node) => node.type === 'button').props.onClick();
  let dialog = harness.find(harness.render(), (node) => node.props?.role === 'dialog');
  const image = harness.find(dialog, (node) => node.type === 'img');
  assert.equal(image.props.src, 'https://example.test/avatar.png');
  assert.equal(image.props.width, 840);
  image.props.onError();
  dialog = harness.find(harness.render(), (node) => node.props?.role === 'dialog');
  assert.ok(dialog);
  assert.equal(harness.find(dialog, (node) => node.type === 'img'), null);
  assert.ok(harness.find(dialog, (node) => node.type === 'span' && node.props.children === 'PN'));
});

test('welcome viewer resolves its root host when opened and keeps the shared focus lifecycle', () => {
  const previewHost = { current: null }, root = { id: 'welcome-root' };
  const h = avatarHarness({ name: 'Portalink Networks Inc.', avatar: '/company.png', inlinePreview: true, previewHost }, { presentation: 'mobile' });
  const button = h.find(h.render(), node => node.type === 'button');
  previewHost.current = root;
  button.props.onClick();
  assert.ok(h.find(h.render(), node => node.props?.role === 'dialog'));
  assert.equal(h.previewTargets.at(-1), root, 'The filtered identity card is not the preview container');
  assert.equal(h.portalRenders(), 0, 'The welcome still does not depend on the app-shell portal');
  assert.equal(h.inlineLayers.length, 1);
  h.inlineLayers[0].onEscape();
  assert.equal(h.find(h.render(), node => node.props?.role === 'dialog'), null);
  assert.equal(h.inlineLayers.length, 0);
});

test('shared identity can prioritize its avatar while ordinary and opened avatar behavior is preserved', () => {
  for (const priority of [undefined, true, 'viewport']) {
    const h = avatarHarness({ name: 'Portalink Networks', avatar: '/avatar.webp', priority });
    const image = h.find(h.render(), node => node.type === 'img');
    assert.equal(image.props['data-test-priority'], priority ?? false);
    assert.equal(image.props['data-test-measure-width'], true);
    assert.equal(image.props.src, '/avatar.webp', 'The single stored avatar URL is preserved without invented transforms');
    assert.equal(image.props.srcSet, undefined, 'No avatar variants exist in the current profile contract');
    assert.equal(image.props.sizes, undefined, 'The obsolete fixed 128px display size is replaced by real measurement');
    h.find(h.render(), node => node.type === 'button').props.onClick();
    const dialog = h.find(h.render(), node => node.props?.role === 'dialog');
    assert.equal(h.find(dialog, node => node.type === 'img').props['data-test-priority'], true);
  }
});

test('mobile avatar preview follows the visible viewport and restores focus without retaining listeners', () => {
  const h = avatarHarness({ name: 'Synthetic Creator' }, { presentation: 'mobile', height: 780 });
  const opener = h.find(h.render(), node => node.type === 'button');
  opener.element.focus();
  opener.props.onClick();
  let tree = h.render();
  let dialog = h.find(tree, node => node.props?.role === 'dialog');
  assert.equal(dialog.props['data-presentation'], 'mobile');
  assert.equal(h.document.activeElement, dialog.element);
  assert.equal(dialog.element.style.getPropertyValue('--dialog-viewport-height'), '780px');
  const backdrop = h.find(tree, node => node.props?.['data-avatar-preview-backdrop'] === '');
  assert.equal(backdrop.props['aria-hidden'], 'true', 'The decorative under-toolbar surface is excluded from accessibility');
  assert.equal(backdrop.props.role, undefined, 'The actual preview remains the only dialog');

  h.viewport.height = 450;
  h.viewport.offsetTop = 44;
  h.viewport.emit('resize');
  assert.equal(dialog.element.style.getPropertyValue('--dialog-viewport-height'), '450px');
  assert.equal(dialog.element.style.getPropertyValue('--dialog-viewport-top'), '44px');
  h.viewport.offsetTop = 62;
  h.viewport.emit('scroll');
  assert.equal(dialog.element.style.getPropertyValue('--dialog-viewport-top'), '62px');
  tree = h.render();
  dialog = h.find(tree, node => node.props?.role === 'dialog');
  assert.equal(h.document.activeElement, dialog.element, 'An ordinary render preserves the focused dialog and stable viewport ref');

  let prevented = 0;
  h.document.emit('keydown', { key: 'Tab', preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(h.document.activeElement, dialog.element);
  h.document.emit('keydown', { key: 'Escape', preventDefault() { prevented++; }, stopPropagation() {} });
  assert.equal(h.find(h.render(), node => node.props?.role === 'dialog'), null);
  assert.equal(h.document.activeElement, opener.element);
  assert.equal(h.viewport.listeners.size, 0);
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);

  opener.props.onClick();
  dialog = h.find(h.render(), node => node.props?.role === 'dialog');
  assert.equal(dialog.element.style.getPropertyValue('--dialog-viewport-top'), '62px', 'Reopening measures the current viewport');
  dialog.props.onClick();
  h.render();
  assert.equal(h.document.activeElement, opener.element, 'Tap dismissal retains the existing focus return behavior');
  assert.equal(h.viewport.listeners.size, 0);
});

test('web avatar retains its existing preview without mobile viewport subscriptions or decorative sibling', () => {
  const h = avatarHarness({ name: 'Synthetic Creator' }, { height: 300, offsetTop: 44 });
  const opener = h.find(h.render(), node => node.type === 'button');
  opener.element.focus();
  opener.props.onClick();
  const tree = h.render();
  const dialog = h.find(tree, node => node.props?.role === 'dialog');
  assert.equal(dialog.props['data-presentation'], 'web');
  assert.equal(dialog.element.style.getPropertyValue('--dialog-viewport-height'), '');
  assert.equal(dialog.element.style.getPropertyValue('--dialog-viewport-top'), '');
  assert.equal(h.viewport.listeners.size, 0);
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.find(tree, node => node.props?.['data-avatar-preview-backdrop'] === ''), null);
  dialog.props.onClick();
  h.render();
  assert.equal(h.document.activeElement, opener.element);
});
