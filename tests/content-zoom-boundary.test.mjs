import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const actionMap = sourceModule('src/presentation/mobile/contextActions.ts', { 'lucide-react': new Proxy({}, { get: (_, key) => key }) });

function compile(path, require, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require, ...globals });
  return exports;
}

test('app boundary contains browser zoom before popup handlers without swallowing content gestures or scrolling', () => {
  let cleanup;
  const listeners = new Map();
  const document = {
    addEventListener(type, callback, options) {
      assert.equal(options.capture, true, 'Comments and portalled popups may stop bubbling');
      assert.equal(options.passive, false);
      listeners.set(type, callback);
    },
    removeEventListener(type, callback, capture) {
      assert.equal(capture, true);
      assert.equal(listeners.get(type), callback);
      listeners.delete(type);
    },
  };
  compile('../src/presentation/useAppZoomBoundary.ts', () => ({ useEffect: effect => { cleanup = effect(); } }), { document }).useAppZoomBoundary();
  const dispatch = (type, details = {}) => {
    const event = { cancelable: true, defaultPrevented: false, ...details,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { assert.fail('Content must still receive its own gestures'); },
    };
    listeners.get(type)(event);
    return event.defaultPrevented;
  };
  assert.equal(dispatch('wheel', { ctrlKey: true }), true);
  assert.equal(dispatch('wheel', { metaKey: true }), true);
  assert.equal(dispatch('wheel', { deltaY: 100 }), false);
  assert.equal(dispatch('touchmove', { touches: [{}, {}] }), true);
  assert.equal(dispatch('touchmove', { touches: [{}] }), false);
  assert.equal(dispatch('gesturestart'), true);
  assert.equal(dispatch('gesturechange'), true);
  assert.equal(dispatch('gesturechange', { cancelable: false }), false);
  assert.equal(listeners.has('keydown'), false, 'Browser accessibility shortcuts remain available');
  cleanup();
  assert.equal(listeners.size, 0);
});

function densityHarness({ readOnly = false, mobile = false } = {}) {
  let cursor = 0, effectCursor = 0, pages = 3, projectId = 'project';
  const motions = [];
  const slots = [], effects = [], pending = [], listeners = new Map(), timers = new Map(), commits = [];
  let timerId = 0;
  const surface = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type, callback) => { if (listeners.get(type) === callback) listeners.delete(type); },
  };
  const react = { ...React, useCallback: fn => fn,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useEffect(fn, deps) {
      const i = effectCursor++;
      if (!effects[i] || deps.some((dep, j) => !Object.is(dep, effects[i].deps[j]))) {
        pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  const pinch = compile('../src/utils/pinchGesture.ts', () => ({}));
  const layout = compile('../src/features/projects/pageLayout.ts', () => ({}));
  const { ProjectMediaViewer } = compile('../src/components/media/ProjectMediaViewer.tsx', name => {
    if (name.endsWith('/publicOrigin')) return { PUBLIC_ORIGIN: 'https://portalinknetworks.com' };
    if (name === 'react') return react;
    if (name.endsWith('/contextActions')) return actionMap;
    if (name.endsWith('/useProjectReach')) return { useProjectReach() {} };
    if (name === 'react-router-dom') return { useNavigate: () => () => {} };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ isInitializing: false, viewerProfileId: null }) };
    if (name.endsWith('/contentPinchMotion')) return { touchMidpoint: touches => ({ x: touches[1].clientX / 2, y: 0 }), beginContentPinch: () => { const m = { updates: [], settled: [], cancelled: false, update(...args) { this.updates.push(args); }, settle(value) { this.settled.push(value); }, cancel() { this.cancelled = true; } }; motions.push(m); return m; } };
    if (name.endsWith('/pinchGesture')) return pinch;
    if (name.endsWith('/pageLayout')) return layout;
    if (name.endsWith('/viewerMemory')) return { readViewerMemory: () => ({}), updateViewerMemory() {} };
    if (name.endsWith('/useProjectEngagement')) return { useProjectEngagement: () => ({ isPending: () => false, isEngaged: () => false }) };
    if (name.endsWith('/MobilePageContext')) return { MobilePageContext: React.createContext(null) };
    if (name.endsWith('/useProjectComments')) return { useProjectComments: () => ({}) };
    return new Proxy({}, { get: () => () => null });
  }, { URL, URLSearchParams, performance: { now: () => 1000 }, WheelEvent: { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 },
    window: { location: { search: '', hash: '', pathname: '/p/creator/c/category/project', origin: 'https://portalink.test' }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } },
  });
  const attachments = ['one', 'two'].map(id => ({ id, kind: 'image', displayName: id, typeLabel: 'Image' }));
  const setPages = next => { pages = next; };
  const commit = next => commits.push(next);
  function attach(node) {
    if (!React.isValidElement(node)) return;
    if ('data-page-density-surface' in node.props) node.ref.current = surface;
    React.Children.toArray(node.props.children).forEach(attach);
  }
  function render() {
    cursor = effectCursor = 0;
    attach(ProjectMediaViewer({ projectId, projectTitle: 'Work', attachments, pageCount: null,
      mobileNavigation: mobile ? { index: null, isIndexOpen: false } : undefined, responseRailWidth: { width: 52 }, singlePanel: null, pagesPerRow: pages, onPagesPerRowChange: setPages,
      onPagesPerRowCommit: readOnly ? undefined : commit,
      processing: { resolveState: () => 'ready', resolveMessage: () => '', canRetry: () => false, retrying: [] },
      isRailOpen: false, onRailOpenChange() {}, onClose() {},
    }));
    pending.splice(0).forEach(fn => fn());
  }
  render();
  const touches = distance => [{ clientX: 0, clientY: 0 }, { clientX: distance, clientY: 0 }];
  return { motions, commits, timers, listeners, render, get pages() { return pages; },
    start(distance) { listeners.get('touchstart')({ touches: touches(distance) }); },
    move(distance) {
      const event = { touches: touches(distance), cancelable: true, defaultPrevented: true, preventDefault() { this.prevented = true; } };
      listeners.get('touchmove')(event);
      return event;
    },
    end() { listeners.get('touchend')(); },
    changeProject() { projectId = 'another'; render(); },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test('project page pinch changes only content density across rerenders and commits its final bounded value', () => {
  const h = densityHarness();
  h.start(100);
  assert.equal(h.move(125).prevented, true);
  assert.equal(h.pages, 2, 'Spreading fingers makes pages larger');
  h.render(); h.move(1); assert.equal(h.pages, 9);
  h.render(); h.move(10000); assert.equal(h.pages, 1);
  h.render(); h.move(100); assert.equal(h.pages, 3);
  h.render(); h.move(125); assert.equal(h.pages, 2);
  assert.deepEqual(h.commits, [], 'No database writes while fingers are moving');
  h.end(); h.end();
  assert.deepEqual(h.commits, [2]);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});

test('project gestures preserve native scrolling, read-only permissions and cancel on project navigation', () => {
  const h = densityHarness({ readOnly: true });
  h.listeners.get('wheel')({ deltaY: 100, preventDefault() { assert.fail('Native scroll'); } });
  h.listeners.get('touchstart')({ touches: [{ clientX: 0, clientY: 0 }] });
  h.listeners.get('touchmove')({ touches: [{ clientX: 0, clientY: 10 }], preventDefault() { assert.fail('Native scroll'); } });
  assert.equal(h.pages, 3);
  h.start(100); h.move(125); h.end();
  assert.equal(h.pages, 2); assert.deepEqual(h.commits, []);
  h.start(100); h.changeProject(); h.move(1);
  assert.equal(h.pages, 2, 'Old gesture cannot resize the next project');
  h.cleanup();
});


test('MOBILE vertical readers leave pinch and scrolling to their page renderers', () => {
  const h = densityHarness({ mobile: true });
  for (const event of ['wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    assert.equal(h.listeners.has(event), false, `${event} must not also change the overview density`);
  }
  assert.equal(h.pages, 3, 'opening a mobile reader does not overwrite authored density');
  assert.deepEqual(h.motions, []);
  assert.deepEqual(h.commits, []);
  h.cleanup();
});

test('MOBILE project changes never reattach density gestures or schedule unintended saves', () => {
  for (const readOnly of [false, true]) {
    const h = densityHarness({ mobile: true, readOnly });
    h.render(); h.changeProject(); h.render();
    assert.equal(h.listeners.size, 0);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.motions, []);
    assert.deepEqual(h.commits, []);
    assert.equal(h.pages, 3);
    h.cleanup();
    assert.equal(h.listeners.size, 0);
  }
});
