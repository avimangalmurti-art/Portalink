import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function events(properties = {}) {
  const listeners = new Map();
  return { ...properties, listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    emit(name) { listeners.get(name)?.(); },
  };
}

function mount({ presentation = 'mobile', visual = true, previous = '' } = {}) {
  let effect, nextId = 1, editing = false;
  const frames = new Map(), timers = new Map(), values = new Map();
  if (previous) values.set('--mobile-viewport-height', [previous, 'important']);
  const style = {
    getPropertyValue: (key) => values.get(key)?.[0] ?? '',
    getPropertyPriority: (key) => values.get(key)?.[1] ?? '',
    setProperty: (key, value, priority = '') => values.set(key, [value, priority]),
    removeProperty: (key) => values.delete(key),
  };
  const viewport = events({ height: 700, scale: 1 });
  const window = events({ innerHeight: 780, innerWidth: 390,
    visualViewport: visual ? viewport : undefined,
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback) { const id = nextId++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const document = events({ activeElement: { matches: () => editing } });
  const exports = {};
  const source = readFileSync(new URL('../src/presentation/mobile/useMobileViewportFrame.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, window, document, require(name) {
    if (name === 'react') return { useLayoutEffect: (callback) => { effect = callback; } };
    if (name.endsWith('/splashLifecycle')) return { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exit' };
    throw new Error(name);
  } });
  exports.useMobileViewportFrame(presentation, { current: { style } });
  const cleanup = effect();
  function flush(queue) { const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach((callback) => callback()); }
  return { window, viewport, document, frames, timers, cleanup, style,
    height: () => style.getPropertyValue('--mobile-viewport-height'),
    frame: () => flush(frames), settle: () => flush(timers),
    focus(value) { editing = value; document.emit(value ? 'focusin' : 'focusout'); },
  };
}

test('fills the visible area at mount and reconciles delayed startup without a gesture', () => {
  const h = mount();
  assert.equal(h.height(), '700px', 'use visible height rather than stale layout height');
  h.viewport.height = 780;
  h.frame();
  assert.equal(h.height(), '780px', 'recheck after first layout');
  h.viewport.height = 800;
  h.window.emit('splash-exit');
  assert.equal(h.height(), '800px');
  h.viewport.height = 810;
  h.frame();
  assert.equal(h.height(), '810px');
  h.viewport.height = 720;
  h.window.emit('pageshow');
  assert.equal(h.height(), '720px');
  h.cleanup();
});

test('tracks expanding/collapsing browser bars and rotation without accumulating callbacks', () => {
  const h = mount(); h.frame();
  for (const height of [750, 800, 740, 700]) {
    h.viewport.height = height;
    h.viewport.emit('resize'); h.viewport.emit('scroll'); h.window.emit('resize');
    assert.equal(h.frames.size, 1);
    h.frame(); assert.equal(h.height(), `${height}px`);
  }
  h.window.innerWidth = 600; h.viewport.height = 390;
  h.window.emit('orientationchange'); h.frame();
  assert.equal(h.height(), '390px');
  h.cleanup();
});

test('keyboard animation preserves the canvas through focus and blur until closing settles', () => {
  const h = mount(); h.frame(); h.focus(true); h.frame();
  for (const height of [680, 620, 560, 500, 420]) {
    h.viewport.height = height; h.viewport.emit('resize'); h.frame();
    assert.equal(h.height(), '700px');
  }
  h.focus(false);
  for (const height of [460, 520, 600, 680, 730]) {
    h.viewport.height = height; h.viewport.emit('resize'); h.frame();
    assert.equal(h.height(), '700px');
    assert.equal(h.timers.size, 1);
  }
  h.settle(); assert.equal(h.height(), '730px');
  h.cleanup();
});

test('rotation with keyboard open uses the new layout height, not the obscured visual height', () => {
  const h = mount(); h.focus(true); h.frame();
  h.window.innerWidth = 600;
  h.window.emit('orientationchange'); h.frame();
  h.window.innerHeight = 390; h.viewport.height = 190;
  h.window.emit('orientationchange'); h.frame();
  assert.equal(h.height(), '390px');
  h.focus(false); h.viewport.height = 390; h.viewport.emit('resize'); h.frame(); h.settle();
  assert.equal(h.height(), '390px'); h.cleanup();
});

test('pinch zoom and invalid viewport measurements do not resize the layout', () => {
  const h = mount(); h.frame();
  h.viewport.scale = 2; h.viewport.height = 350;
  h.viewport.emit('resize'); h.frame(); assert.equal(h.height(), '700px');
  h.viewport.scale = 1; h.viewport.height = 720;
  h.viewport.emit('resize'); h.frame(); assert.equal(h.height(), '720px');
  h.viewport.height = -1;
  h.window.emit('resize'); h.frame(); assert.equal(h.height(), '720px'); h.cleanup();
});

test('falls back to layout height when VisualViewport is unavailable', () => {
  const h = mount({ visual: false }); assert.equal(h.height(), '780px'); h.frame();
  h.window.innerHeight = 820; h.window.emit('resize'); h.frame();
  assert.equal(h.height(), '820px'); h.cleanup();
});

test('leaving MOBILE cancels pending work and restores the previous style exactly', () => {
  for (const previous of ['', '650px']) {
    const h = mount({ previous }); h.focus(true); h.focus(false);
    assert.equal(h.frames.size, 1); assert.equal(h.timers.size, 1);
    h.cleanup();
    assert.equal(h.height(), previous);
    assert.equal(h.style.getPropertyPriority('--mobile-viewport-height'), previous ? 'important' : '');
    for (const queue of [h.frames, h.timers, h.window.listeners, h.viewport.listeners, h.document.listeners]) assert.equal(queue.size, 0);
  }
});

test('WEB installs no viewport listeners or size override', () => {
  const h = mount({ presentation: 'web', previous: '650px' });
  assert.equal(h.height(), '650px'); assert.equal(h.cleanup, undefined);
  for (const queue of [h.frames, h.timers, h.window.listeners, h.viewport.listeners, h.document.listeners]) assert.equal(queue.size, 0);
});
