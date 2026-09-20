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
function loader({ reduced = false, stillOnly = false, blocked = false, throws = false, presentation = 'web' } = {}) {
  const h = hooks();
  let completed = 0, plays = 0, pauses = 0, exitDuration = 0, renderedPresentation;
  const video = {
    play() {
      plays++;
      if (throws) throw Error('playback unavailable');
      return blocked ? Promise.reject(Error('autoplay blocked')) : Promise.resolve();
    },
    pause() { pauses++; },
  };
  const { PortalinkSplashLoader } = compile('../src/components/ui/PortalinkSplashLoader.tsx', {
    react: h.react, 'framer-motion': { motion: { div: 'div' }, useReducedMotion: () => reduced },
    '../../presentation/useViewportPresentation': { useViewportPresentation: () => presentation },
  }, { window: h.window });
  const onComplete = () => completed++;
  return { ...h,
    render() {
      const tree = h.render(() => PortalinkSplashLoader({ onComplete, stillOnly }));
      exitDuration = tree.props.transition.duration;
      renderedPresentation = tree.props['data-presentation'];
      if (tree.props.children.type === 'video') tree.props.children.ref.current = video;
      h.flush(); return tree.props.children;
    },
    setViewport(nextPresentation) { presentation = nextPresentation; },
    video,
    get completed() { return completed; }, get plays() { return plays; }, get pauses() { return pauses; },
    get exitDuration() { return exitDuration; },
    get presentation() { return renderedPresentation; },
  };
}

test('each platform plays only its own splash inline and muted once', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = loader({ presentation }), media = h.render(), mobile = presentation === 'mobile';
    assert.equal(media.type, 'video');
    assert.equal(h.presentation, presentation);
    assert.equal(media.props.src, mobile ? '/portalink-splash-mobile.mp4' : '/portalink-splash.mp4');
    assert.equal(media.props.poster, mobile ? '/portalink-splash-mobile-poster.png' : '/portalink-splash-poster.png');
    assert.equal(media.props.width, mobile ? 512 : 576);
    assert.equal(media.props.height, mobile ? 720 : 576);
    assert.equal(media.props.muted, true); assert.equal(media.props.playsInline, true);
    assert.equal(media.props.autoPlay, true); assert.equal(media.props['aria-hidden'], 'true');
    assert.equal(media.props.loop, undefined); assert.equal(media.props.controls, undefined);
    assert.equal(h.video.muted, true); assert.equal(h.video.defaultMuted, true);
    assert.equal(h.plays, 1); assert.equal(h.completed, 0);
    h.render(); assert.equal(h.plays, 1);
    media.props.onEnded(); media.props.onEnded(); assert.equal(h.completed, 1);
    h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.pauses, 1);
  }
});

test('WEB retains its 880ms presentation and 320ms fade for the 1.2-second startup budget', () => {
  const h = loader(); h.render();
  const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 880); assert.equal(h.exitDuration, 0.32);
  assert.equal(timer.delay + h.exitDuration * 1000, 1200); timer.fn();
  assert.equal(h.completed, 1);
  h.unmount();
});

test('MOBILE finishes the full clip onEnded and has a bounded fallback if playback stalls', () => {
  for (const ended of [true, false]) {
    const h = loader({ presentation: 'mobile' }), media = h.render();
    assert.equal(h.timers.size, 1);
    const timer = [...h.timers.values()][0];
    assert.equal(timer.delay, 3000);
    assert.equal(h.completed, 0);
    if (ended) {
      media.props.onEnded();
      assert.equal(h.completed, 1, 'normal playback completes without waiting for the watchdog');
    }
    timer.fn();
    media.props.onEnded();
    assert.equal(h.completed, 1, 'the watchdog and media event cannot complete startup twice');
    h.unmount(); assert.equal(h.timers.size, 0);
  }
});

test('a viewport change during startup does not replace or restart the selected platform clip', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = loader({ presentation }), media = h.render();
    const timer = [...h.timers.values()][0];
    h.setViewport(presentation === 'mobile' ? 'web' : 'mobile');
    const next = h.render();
    assert.equal(h.presentation, presentation);
    assert.equal(next.props.src, media.props.src);
    assert.equal(next.props.poster, media.props.poster);
    assert.equal(next.key, media.key);
    assert.equal(h.plays, 1); assert.equal(h.pauses, 0);
    assert.equal([...h.timers.values()][0], timer);
    h.unmount();
  }
});

test('media errors, rejected autoplay, and synchronous playback failures use the correct still without trapping startup', async () => {
  for (const presentation of ['web', 'mobile']) {
    for (const failure of ['error', 'blocked', 'throws']) {
      const h = loader({ presentation, blocked: failure === 'blocked', throws: failure === 'throws' }), media = h.render();
      if (failure === 'error') media.props.onError();
      await Promise.resolve();
      assert.equal(h.completed, 1);
      const still = h.render();
      assert.equal(still.type, 'img');
      assert.equal(still.props.src, presentation === 'mobile' ? '/portalink-splash-mobile-poster.png' : '/portalink-splash-poster.png');
      assert.equal(h.timers.size, 0);
      media.props.onError(); media.props.onEnded(); assert.equal(h.completed, 1);
      h.unmount();
    }
  }
});

test('reduced motion and later session retries use platform stills without mounting or playing video', () => {
  for (const presentation of ['web', 'mobile']) {
    for (const options of [{ reduced: true }, { stillOnly: true }]) {
      const h = loader({ presentation, ...options }), media = h.render(), mobile = presentation === 'mobile';
      assert.equal(media.type, 'img');
      assert.equal(media.props.src, mobile ? '/portalink-splash-mobile-poster.png' : '/portalink-splash-poster.png');
      assert.equal(media.props.width, mobile ? 512 : 576); assert.equal(media.props.height, mobile ? 720 : 576);
      assert.equal(h.plays, 0); assert.equal(h.completed, 1); assert.equal(h.timers.size, 0);
      if (options.reduced) assert.equal(h.exitDuration, 0);
      h.unmount();
    }
  }
});

test('preboot selects the MOBILE poster at the canonical boundary and preserves the WEB fallback', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const { MOBILE_PRESENTATION_QUERY } = compile('../src/presentation/useViewportPresentation.ts', { react: React });
  const preboot = html.match(/<div id="portalink-preboot"[\s\S]*?<\/div>/)?.[0];
  assert.ok(preboot);
  const source = preboot.match(/<source\s[^>]*>/)?.[0];
  assert.ok(source);
  assert.equal(source.match(/media="([^"]+)"/)?.[1], MOBILE_PRESENTATION_QUERY);
  assert.match(source, /srcset="\/portalink-splash-mobile-poster\.png"/);
  assert.match(source, /width="512" height="720"/);
  assert.match(preboot, /<img src="\/portalink-splash-poster\.png"[^>]*width="576" height="576"/);
  assert.ok(html.includes(`@media ${MOBILE_PRESENTATION_QUERY}`));
  assert.match(html, /#portalink-preboot\s*\{[^}]*background-color:\s*#f5eaf4/);
  assert.doesNotMatch(preboot, /<video/);
});

test('startup waits for verified session but never for media; navigation and auth retries never replay the video', () => {
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
  // No video ended/play event is needed, even if the media never downloads.
  assert.equal(presence.props.children.props.onComplete, undefined);
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
