import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function compile(path, require, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readSource(path), { compilerOptions: {
    jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, { exports, require, ...globals });
  return exports;
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

const { ProjectHoverDetails, PreviewMetrics } = compile('../src/components/profile/ProjectHoverDetails.tsx', (name) => {
  if (name === 'react') return React;
  if (name.endsWith('/useProjectEngagement')) return { useProjectEngagement: () => ({ count: () => 0 }) };
  if (name.endsWith('/useProjectComments')) return { useProjectComments: () => ({ phase: 'ready', totalCount: 0 }) };
  return new Proxy({}, { get: (_, key) => key });
});

test('every profile-card variant permits native vertical scroll chaining and keeps descriptions scrollable', () => {
  for (const variant of [
    { name: 'owner', footerEnd: React.createElement('button', null, 'Edit') },
    { name: 'visitor', onOpenComments: () => undefined },
    { name: 'public link', showEngagementMetrics: false },
  ]) {
    for (const summary of ['', 'Short description', 'Long description. '.repeat(200)]) {
      const tree = ProjectHoverDetails({ projectId: 'project', summary, ...variant });
      const description = nodes(tree).find((node) => node.props?.['data-project-hover-description'] !== undefined);
      const classes = description.props.className.split(/\s+/);
      // Native `auto` chains wheel/trackpad input at both edges, including a
      // zero-overflow description. No custom delta conversion/scroll forwarding.
      assert.ok(classes.includes('overscroll-y-auto'), variant.name);
      assert.ok(classes.includes('overflow-y-auto'), variant.name);
      assert.ok(!classes.some((name) => /^overscroll.*(?:contain|none)$/.test(name)), variant.name);
      for (const node of nodes(tree)) {
        assert.equal(node.props.onWheel, undefined);
        assert.equal(node.props.onWheelCapture, undefined);
        assert.equal(node.props.onTouchMove, undefined);
      }
    }
  }
});

test('project and comment clicks remain intact after removing scroll containment', () => {
  const calls = [];
  const tree = ProjectHoverDetails({ projectId: 'project', summary: 'Summary',
    onOpen: () => calls.push('project'), onOpenComments: () => calls.push('comments') });
  nodes(tree).find((node) => node.props?.['data-project-hover-description'] !== undefined).props.onClick();
  const extension = PreviewMetrics({ counts: { like: 0, save: 0, repost: 0 }, commentCount: 0, onOpenComments: () => calls.push('comments') });
  let stopped = false;
  assert.equal(nodes(tree).some((node) => node.props?.['data-project-preview-metrics'] !== undefined), false);
  nodes(extension).find((node) => node.props?.['aria-label'] === 'Open comments (0)').props.onClick({ stopPropagation() { stopped = true; } });
  assert.deepEqual(calls, ['project', 'comments']);
  assert.equal(stopped, true);
});

function zoomHarness(enabled = true) {
  const effects = [];
  const refs = [];
  const state = [];
  let cursor = 0;
  const react = {
    useCallback: (callback) => callback,
    useEffect: (effect) => effects.push(effect),
    useRef: (value) => { const ref = { current: value }; refs.push(ref); return ref; },
    useState: (initial) => {
      const index = cursor++;
      state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
  };
  const pinch = compile('../src/utils/pinchGesture.ts', () => ({}));
  const { useContentZoom } = compile('../src/hooks/useContentZoom.ts', name => name.endsWith('/pinchGesture') ? pinch : react, {
    window: { setTimeout: () => 1, clearTimeout() {} },
  });
  const listeners = new Map();
  const view = useContentZoom(enabled);
  view.ref.current = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => { if (listeners.get(type) === handler) listeners.delete(type); },
  };
  const cleanup = effects.map((effect) => effect());
  return { state, listeners, cleanup, initial: [...state] };
}

test('profile zoom listener leaves mouse wheels, trackpad movement and momentum untouched', () => {
  const h = zoomHarness();
  const wheel = h.listeners.get('wheel');
  for (const deltaMode of [0, 1, 2]) {
    for (const deltaY of [-120, -3, -0.25, 0, 0.25, 3, 120]) {
      for (const deltaX of [0, 2.5]) {
        wheel({ deltaMode, deltaY, deltaX, ctrlKey: false, metaKey: false,
          preventDefault() { assert.fail('Normal scrolling must remain a browser default'); },
          stopPropagation() { assert.fail('Normal scrolling must not be trapped'); } });
        assert.deepEqual(h.state, h.initial);
      }
    }
  }
});

test('deliberate pinch or modified-wheel zoom remains available and listeners clean up', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const h = zoomHarness();
    let prevented = false;
    h.listeners.get('wheel')({ deltaY: -20, [modifier]: true, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(h.state[0], h.initial[0] + 1);
    h.cleanup.forEach((cleanup) => cleanup?.());
    assert.equal(h.listeners.size, 0);
  }
});

test('phone pinches resize only overview content, stay bounded, and ignore single-finger scrolling', () => {
  const h = zoomHarness();
  const touches = distance => [{ clientX: 0, clientY: 0 }, { clientX: distance, clientY: 0 }];
  const move = distance => {
    const event = { touches: touches(distance), cancelable: true, preventDefault() { this.prevented = true; } };
    h.listeners.get('touchmove')(event);
    return event;
  };
  h.listeners.get('touchstart')({ touches: touches(100) });
  assert.equal(move(125).prevented, true);
  assert.equal(h.state[0], h.initial[0] + 1);
  move(10000); assert.equal(h.state[0], 6);
  move(1); assert.equal(h.state[0], 0);
  move(100); assert.equal(h.state[0], h.initial[0], 'Reversing a pinch restores its starting size');
  h.listeners.get('touchend')();
  move(200); assert.equal(h.state[0], h.initial[0]);
  h.listeners.get('touchstart')({ touches: [touches(100)[0]] });
  h.listeners.get('touchmove')({ touches: [touches(100)[0]], cancelable: true, preventDefault() { assert.fail('Single-finger scroll must remain native'); } });
  h.cleanup.forEach(cleanup => cleanup?.());
  assert.equal(h.listeners.size, 0);
});

test('reorder mode suspends overview zoom and its adjustment announcement', () => {
  const h = zoomHarness(false);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.state[1], false);
});

test('ordinary profile and shared-profile screens retain the app-shell vertical scroller', () => {
  const source = readSource('../src/App.tsx');
  const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'screenMainClassName') expression = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(expression);
  for (const kind of ['profile', 'sharedProfile']) {
    const classes = vm.runInNewContext(expression, { route: { kind }, activeCategory: null,
      isSearchOpen: false, isMessagesOpen: false, inDesignFeature: null });
    assert.match(classes, /\boverflow-y-auto\b/);
    assert.doesNotMatch(classes, /\boverflow-hidden\b/);
  }
});
