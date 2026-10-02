import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, ...globals, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const anchored = load('../src/utils/anchoredMenu.ts');
const positions = load('../src/features/media-interactions/mediaCommentsPosition.ts', { '../../utils/anchoredMenu': anchored });
const position = positions.positionMediaComments;

test('comments retain reading width above a small page toolbar', () => {
  const result = position({ left: 500, top: 430, bottom: 458 }, 180, { width: 1056, height: 698 });
  assert.equal(result.width, 320);
  assert.equal(result.left, 500);
  assert.equal(result.top, 244);
});

test('comments flip below a toolbar near the top and shift left at the right edge', () => {
  const result = position({ left: 980, top: 30, bottom: 58 }, 240, { width: 1056, height: 698 });
  assert.equal(result.top, 64);
  assert.equal(result.left + result.width, 1048);
});

test('narrow, short and keyboard-offset viewports contain the entire visible popup', () => {
  for (const viewport of [
    { width: 240, height: 600 },
    { width: 390, height: 230, offsetTop: 180 },
    { width: 180, height: 140, offsetLeft: 170, offsetTop: 260 },
  ]) {
    for (const height of [100, 320, 900]) {
      const result = position({ left: 1020, top: 610, bottom: 632 }, height, viewport);
      const x = viewport.offsetLeft ?? 0, y = viewport.offsetTop ?? 0;
      assert.ok(result.left >= x + 8);
      assert.ok(result.top >= y + 8);
      assert.ok(result.left + result.width <= x + viewport.width - 8);
      assert.ok(result.top + Math.min(height, result.maxHeight) <= y + viewport.height - 8);
    }
  }
});

test('pinched visual viewport offsets preserve the anchor position', () => {
  const viewport = { width: 600, height: 400, offsetLeft: 160, offsetTop: 220 };
  const result = position({ left: 200, top: 500, bottom: 528 }, 150, viewport);
  assert.equal(result.left, 200);
  assert.equal(result.top, 344);
});

function events(object = {}) {
  const listeners = new Map();
  return Object.assign(object, {
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    emit(name, event) { for (const handler of [...listeners.get(name) ?? []]) handler(event); },
    listenerCount() { return [...listeners.values()].reduce((sum, items) => sum + items.size, 0); },
  });
}

function harness(fullscreen = false, mode = 'web') {
  const attributes = new Map(), viewportStyles = new Map(), modalCalls = [];
  const shell = { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) }, presentation = {};
  const document = events({ fullscreenElement: fullscreen ? presentation : null, body: {}, querySelector: () => shell });
  const viewport = events({ width: 1056, height: 698, offsetLeft: 0, offsetTop: 0 });
  const window = events({ visualViewport: viewport, innerWidth: 1056, innerHeight: 698 });
  const effects = [], layouts = [], frames = new Map(), states = [], observers = [];
  let rect = { left: 680, top: 430, bottom: 450 }, focused = 0, closed = 0, sequence = 0, visibility;
  const anchor = { getBoundingClientRect: () => rect, closest: () => shell };
  const trigger = { contains: (target) => target === trigger, focus: () => focused++ };
  const panel = { style: {}, scrollHeight: 180, children: [{}], contains: (target) => target === panel };
  const react = { ...React,
    useRef: () => ({ current: panel }),
    useState(initial) { const slot = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[slot], (next) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }]; },
    useEffect: (fn) => effects.push(fn), useLayoutEffect: (fn) => layouts.push(fn),
  };
  const { MediaCommentsPopover } = load('../src/features/media-interactions/MediaCommentsPopover.tsx', {
    react, 'react-dom': { createPortal: (node, host) => ({ node, host }) }, './mediaCommentsPosition': positions,
    '../../presentation/usePresentation': { usePresentation: () => mode },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: { style: { setProperty: (key, value) => viewportStyles.set(key, value) } } }) },
    '../../hooks/useModalFocus': { useModalFocus: (...args) => modalCalls.push(args) },
  }, {
    document, window,
    requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class { constructor(fn) { this.update = fn; this.observed = []; observers.push(this); } observe(node) { this.observed.push(node); } disconnect() { this.observed = []; } },
    IntersectionObserver: class { constructor(fn) { visibility = fn; } observe() {} disconnect() {} },
  });
  const selected = MediaCommentsPopover({ id: 'comments-1', label: 'Comments for Page 1', anchorRef: { current: anchor }, triggerRef: { current: trigger }, onClose: () => closed++, children: 'Comments content' });
  const portal = selected.type(selected.props);
  const rendered = mode === 'mobile' ? { ...portal, scope: portal.node.props['data-presentation'], node: portal.node.props.children } : portal;
  const cleanups = [...layouts, ...effects].map((fn) => fn());
  return { ...rendered, document, window, viewport, shell, presentation, panel, trigger, states, observers, attributes, viewportStyles, modalCalls,
    get focused() { return focused; }, get closed() { return closed; },
    move(next) { rect = next; window.emit('scroll', {}); for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } },
    hideAnchor() { visibility?.([{ isIntersecting: false }]); },
    cleanup() { cleanups.forEach((fn) => fn?.()); },
  };
}

test('the popup escapes media clipping into the themed shell or fullscreen element', () => {
  for (const fullscreen of [false, true]) {
    const env = harness(fullscreen);
    assert.equal(env.host, fullscreen ? env.presentation : env.shell);
    assert.equal(env.node.props['data-media-interaction'], '');
    assert.equal(env.panel.style.width, '320px');
    env.document.fullscreenElement = fullscreen ? null : env.presentation;
    env.document.emit('fullscreenchange', {});
    assert.equal(env.states[0], fullscreen ? env.shell : env.presentation);
    env.cleanup();
  }
});

test('mobile comments use a keyboard-aware modal without following or dismissing a hidden toolbar', () => {
  const env = harness(false, 'mobile');
  assert.equal(env.scope, 'mobile');
  assert.equal(env.node.props.children.props.role, 'dialog');
  assert.equal(env.node.props.children.props['aria-modal'], 'true');
  assert.equal(env.node.props.style.height, 'var(--dialog-viewport-height, 100dvh)');
  assert.equal(env.attributes.get('data-page-comments-open'), '');
  assert.equal(env.modalCalls[0][0], true);
  assert.equal(env.observers.length, 0);
  env.hideAnchor();
  env.viewport.height = 300;
  env.viewport.emit('resize', {});
  assert.equal(env.viewportStyles.get('--comments-bottom-inset'), '12px');
  assert.equal(env.closed, 0, 'Keyboard and hidden source toolbar must not close the composer');
  env.node.props.onPointerDown({ target: env.panel, currentTarget: {}, stopPropagation() {} });
  assert.equal(env.closed, 0);
  const backdrop = {};
  env.node.props.onPointerDown({ target: backdrop, currentTarget: backdrop, stopPropagation() {} });
  assert.equal(env.closed, 1);
  env.cleanup();
  assert.equal(env.attributes.has('data-page-comments-open'), false);
  assert.equal(env.viewport.listenerCount(), 0);
});

test('mobile comments keep their fullscreen host and isolate gestures from the focused page', () => {
  const env = harness(true, 'mobile');
  assert.equal(env.host, env.presentation);
  for (const name of ['onPointerUp', 'onClick', 'onDoubleClick', 'onWheel', 'onTouchMove', 'onKeyDown']) {
    let stopped = false;
    env.node.props[name]({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
  }
  env.document.fullscreenElement = null;
  env.document.emit('fullscreenchange', {});
  assert.equal(env.closed, 1, 'Close without losing the parent draft rather than retaining stale focus/viewport nodes');
  env.cleanup();
});

test('popup events stay out of the page viewer and Escape returns focus to its trigger', () => {
  const env = harness();
  for (const name of ['onPointerDown', 'onPointerUp', 'onClick', 'onDoubleClick', 'onWheel', 'onTouchMove', 'onKeyDown']) {
    let stopped = false;
    env.node.props[name]({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true, name);
  }
  let prevented = false, stopped = false;
  env.node.props.onKeyDownCapture({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(env.closed, 1);
  assert.equal(env.focused, 1);
  env.cleanup();
});

test('outside press and scrolling the anchor out of view dismiss comments', () => {
  const env = harness();
  env.document.emit('pointerdown', { target: env.panel });
  env.document.emit('pointerdown', { target: env.trigger });
  assert.equal(env.closed, 0);
  env.document.emit('pointerdown', { target: {} });
  assert.equal(env.closed, 1);
  env.hideAnchor();
  assert.equal(env.closed, 2);
  env.cleanup();
});

test('scrolling tracks the anchor and unmount removes viewport and document listeners', () => {
  const env = harness();
  env.move({ left: 200, top: 300, bottom: 320 });
  assert.equal(env.states[1].left, 200);
  assert.equal(env.states[1].top, 112);
  assert.ok(env.observers[0].observed.includes(env.panel));
  env.cleanup();
  assert.equal(env.document.listenerCount(), 0);
  assert.equal(env.window.listenerCount(), 0);
  assert.equal(env.viewport.listenerCount(), 0);
  assert.equal(env.observers[0].observed.length, 0);
});

function interactionBarHarness(mode) {
  const states = [];
  let cursor = 0, retries = 0, dismissals = 0;
  const activity = {
    record: { engaged: { like: false, save: false, repost: false }, counts: { like: 0, save: 0, repost: 0 }, comments: [] },
    pendingKind: null, isResolvingEngagement: true, isLoading: false, isPostingComment: false,
    failure: 'Page activity is offline.', commentResumeToken: 0, shareState: 'idle',
    retry: () => { retries++; }, dismissFailure: () => { dismissals++; },
    toggle() {}, share() {}, postComment() {}, deleteComment() {},
  };
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useContext: () => null, useRef: initial => ({ current: initial }), useId: () => 'comments-id',
    useEffect() {}, useLayoutEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
  };
  const popover = () => null;
  const icon = () => null;
  const { MediaInteractionBar } = load('../src/features/media-interactions/MediaInteractionBar.tsx', {
    react,
    'lucide-react': Object.fromEntries(['BookmarkIcon', 'HeartIcon', 'Loader2Icon', 'MessageCircleIcon', 'Repeat2Icon', 'SendIcon', 'Trash2Icon', 'XIcon'].map(name => [name, icon])),
    '../../components/ui/InterfaceIcon': { InterfaceIcon: icon },
    '../../components/publishing/ProjectFormDialog': { ProjectFormDialog: 'project-form' },
    '../../components/ui/Button': { Button: 'button' },
    '../../contexts/AuthContext': { useAuth: () => ({ isAuthenticated: true }) },
    '../auth/registration': { readSharedReturnPath: () => null },
    './MobilePageContext': { MobilePageContext: {} },
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions() {} },
    '../../presentation/mobile/contextActions': { contextActions: () => ({ primary: [], groups: [] }) },
    '../media/publicMediaUrl': { publicMediaUrl: source => source },
    './useMediaInteractions': { useMediaInteractions: () => activity },
    './mediaToolbarLayout': {
      mediaToolbarLayout: () => ({ width: 200, unit: 40, slots: [1, 1, 1, 1, 1] }),
      mobileFocusedMediaToolbarLayout: () => ({ width: 200, unit: 40, slots: [1, 1, 1, 1, 1] }),
    },
    '../../presentation/usePresentation': { usePresentation: () => mode },
    './useMediaPageSize': { useMediaPageSize: () => ({ ref: { current: null }, pageWidth: 390, hostWidth: 390, isVisible: true }) },
    './MediaCommentsPopover': { MediaCommentsPopover: popover },
  });
  const render = () => {
    cursor = 0;
    return MediaInteractionBar({ target: { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Original source' } });
  };
  return { activity, render, popover, get retries() { return retries; }, get dismissals() { return dismissals; } };
}

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}

for (const mode of ['mobile', 'web']) {
  test(`${mode} exposes first-read retry outside closed Comments and keeps recovery reachable inside`, () => {
    const env = interactionBarHarness(mode);
    let nodes = descendants(env.render());
    const actions = nodes.filter(node => node.type === 'button' && /^(Like|Bookmark|Repost):/.test(node.props['aria-label'] ?? ''));
    assert.equal(actions.length, 3);
    assert.ok(actions.every(node => node.props.disabled));
    assert.equal(nodes.some(node => node.type === env.popover), false);
    const retry = nodes.find(node => node.props['aria-label'] === 'Retry page activity for Page 1');
    assert.ok(retry, 'Retry is reachable without opening Comments');
    assert.equal(retry.type, 'button');
    assert.equal(retry.props.disabled, undefined);
    retry.props.onClick(); assert.equal(env.retries, 1);

    nodes.find(node => node.props['aria-label'] === 'Show comments for Page 1').props.onClick();
    nodes = descendants(env.render());
    assert.equal(nodes.some(node => node.type === env.popover), true);
    assert.equal(nodes.some(node => node.props['aria-label'] === 'Retry page activity for Page 1'), false);
    const insideRetry = nodes.find(node => node.type === 'button' && node.props.children === 'Try again');
    assert.ok(insideRetry);
    insideRetry.props.onClick(); assert.equal(env.retries, 2);
    assert.equal(nodes.some(node => node.type === 'button' && node.props.children === 'Dismiss'), false,
      'Unresolved failure cannot be dismissed while engagement remains blocked');

    env.activity.isResolvingEngagement = false;
    nodes = descendants(env.render());
    const dismiss = nodes.find(node => node.type === 'button' && node.props.children === 'Dismiss');
    assert.ok(dismiss, 'Ordinary post-load failures retain their dismiss action');
    dismiss.props.onClick(); assert.equal(env.dismissals, 1);
    assert.ok(nodes.filter(node => node.type === 'button' && /^(Like|Bookmark|Repost):/.test(node.props['aria-label'] ?? '')).every(node => !node.props.disabled));

    env.activity.failure = null;
    nodes = descendants(env.render());
    assert.equal(nodes.some(node => node.type === 'button' && node.props.children === 'Try again'), false);
    assert.equal(nodes.some(node => node.props.role === 'alert'), false);
  });
}
