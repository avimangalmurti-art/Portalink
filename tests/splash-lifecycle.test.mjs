import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function hooks() {
  const slots = [], effects = [], timers = new Map();
  let cursor = 0, timerId = 0;
  return {
    react: { ...React,
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useState(initial) {
        const i = cursor++;
        slots[i] ??= { value: initial };
        return [slots[i].value, value => { slots[i].value = value; }];
      },
      useCallback(callback, deps) {
        const i = cursor++;
        if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) slots[i] = { callback, deps };
        return slots[i].callback;
      },
      useEffect(effect, deps) {
        const i = cursor++;
        if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) {
          slots[i]?.cleanup?.(); slots[i] = { deps };
          effects.push(() => { slots[i].cleanup = effect(); });
        }
      },
    },
    window: {
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    timers,
    render(fn) { cursor = 0; return fn(); },
    flush() { effects.splice(0).forEach(fn => fn()); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function compile(path, imports, globals) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, ...globals, require(name) { assert.ok(name in imports, name); return imports[name]; } });
  return exports;
}
function loader({ reduced = false, stillOnly = false, blocked = false } = {}) {
  const h = hooks();
  let completed = 0, plays = 0, pauses = 0;
  const video = { play() { plays++; return blocked ? Promise.reject(Error('autoplay blocked')) : Promise.resolve(); }, pause() { pauses++; } };
  const { PortalinkSplashLoader } = compile('../src/components/ui/PortalinkSplashLoader.tsx', {
    react: h.react, 'framer-motion': { motion: { div: 'div' }, useReducedMotion: () => reduced },
  }, { window: h.window });
  const onComplete = () => completed++;
  return { ...h,
    render() {
      const tree = h.render(() => PortalinkSplashLoader({ onComplete, stillOnly }));
      if (tree.props.children.type === 'video') tree.props.children.ref.current = video;
      h.flush(); return tree.props.children;
    },
    get completed() { return completed; }, get plays() { return plays; }, get pauses() { return pauses; },
  };
}

test('splash plays inline and muted once, then reports completion only once', () => {
  const h = loader(), media = h.render();
  assert.equal(media.type, 'video');
  assert.equal(media.props.muted, true); assert.equal(media.props.playsInline, true);
  assert.equal(media.props.loop, undefined); assert.equal(media.props.controls, undefined);
  assert.equal(h.plays, 1); assert.equal(h.completed, 0);
  h.render(); assert.equal(h.plays, 1);
  media.props.onEnded(); media.props.onEnded(); assert.equal(h.completed, 1);
  h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.pauses, 1);
});

test('a slow or stalled video can add no more than three seconds to startup', () => {
  const h = loader(); h.render();
  const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 3000); timer.fn();
  assert.equal(h.completed, 1);
  h.unmount();
});

test('failed media and blocked autoplay fall back without trapping startup', async () => {
  for (const blocked of [true, false]) {
    const h = loader({ blocked }), media = h.render();
    if (!blocked) media.props.onError();
    await Promise.resolve();
    assert.equal(h.completed, 1);
    assert.equal(h.render().type, 'img');
    assert.equal(h.timers.size, 0);
    h.unmount();
  }
});

test('reduced motion and later session retries use the original still without playing video', () => {
  for (const options of [{ reduced: true }, { stillOnly: true }]) {
    const h = loader(options), media = h.render();
    assert.equal(media.type, 'img');
    assert.equal(media.props.src, '/portalink-splash-poster.png');
    assert.equal(h.plays, 0); assert.equal(h.completed, 1); assert.equal(h.timers.size, 0);
    h.unmount();
  }
});

test('startup waits for both session and media; navigation and auth retries never replay the video', () => {
  const h = hooks(), auth = { isInitializing: true, isAuthenticated: false }, location = { pathname: '/' };
  const storage = new Map();
  const { ApplicationBootstrap } = compile('../src/app/ApplicationBootstrap.tsx', {
    react: h.react, 'framer-motion': { AnimatePresence: 'presence' },
    'react-router-dom': { Navigate: 'redirect', matchPath: () => null, useLocation: () => location },
    '../App': { App: 'app' }, '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' },
    '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes: { sharedProject: {}, sharedProfileCategory: {}, sharedProfile: {} }, buildPath: (_, p) => `/share/${p.profileId}` },
    './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exited' },
  }, { window: { ...h.window, sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } } });
  const render = () => { const tree = h.render(ApplicationBootstrap); h.flush(); return tree.props.children; };
  let [app, presence] = render();
  assert.equal(app, null); assert.equal(presence.props.children.props.stillOnly, false);
  presence.props.children.props.onComplete();
  [app, presence] = render();
  assert.equal(app, null); assert.ok(presence.props.children);
  auth.isInitializing = false;
  render(); [app, presence] = render();
  assert.equal(app.type, 'app'); assert.equal(presence.props.children, null);
  location.pathname = '/messages'; [app, presence] = render();
  assert.equal(presence.props.children, null);
  auth.isInitializing = true; [app, presence] = render();
  assert.equal(app, null); assert.equal(presence.props.children.props.stillOnly, true);
  auth.isInitializing = false; [app, presence] = render();
  assert.equal(app.type, 'app'); assert.equal(presence.props.children, null);
  h.unmount();
});
