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
        slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
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
          slots[i]?.cleanup?.(); slots[i] = { deps, effect };
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
    restartEffects() { slots.forEach(slot => { if (slot?.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); } }); },
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
function loader({ reduced = false, stillOnly = false, blocked = false, throws = false, hidden = false, legacy = false, play, presentation = 'web' } = {}) {
  const h = hooks();
  let completed = 0, plays = 0, pauses = 0, exitDuration = 0, renderedPresentation;
  const listeners = new Map(), docListeners = new Map(), frames = new Map();
  let frameId = 0;
  const document = {
    hidden,
    addEventListener(name, fn) { docListeners.set(name, fn); },
    removeEventListener(name, fn) { if (docListeners.get(name) === fn) docListeners.delete(name); },
  };
  const video = {
    paused: true, ended: false, readyState: 0,
    setAttribute() {},
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    requestVideoFrameCallback: legacy ? undefined : fn => { const id = ++frameId; frames.set(id, fn); return id; },
    cancelVideoFrameCallback(id) { frames.delete(id); },
    play() {
      plays++;
      if (throws) throw Error('playback unavailable');
      if (play) return play(plays);
      return blocked ? Promise.reject(Error('autoplay blocked')) : Promise.resolve();
    },
    pause() { pauses++; this.paused = true; listeners.get('pause')?.(); },
  };
  const { PortalinkSplashLoader } = compile('../src/components/ui/PortalinkSplashLoader.tsx', {
    react: h.react, 'framer-motion': { motion: { div: 'div' }, useReducedMotion: () => reduced },
    '../../presentation/useViewportPresentation': { useViewportPresentation: () => presentation },
    '../../hooks/useModalFocus': { useModalFocus() {} },
  }, { window: h.window, document });
  const onComplete = () => completed++;
  return { ...h,
    render() {
      const tree = h.render(() => PortalinkSplashLoader({ onComplete, stillOnly }));
      exitDuration = tree.props.transition.duration;
      renderedPresentation = tree.props['data-presentation'];
      const [poster, media] = tree.props.children;
      if (media) media.ref.current = video;
      h.flush(); return { poster, media };
    },
    start() { video.paused = false; video.readyState = 2; listeners.get('playing')?.(); },
    paint() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); },
    emit(name) { if (name === 'ended') video.ended = true; if (name === 'pause') video.paused = true; listeners.get(name)?.(); },
    hide() { document.hidden = true; docListeners.get('visibilitychange')?.(); },
    timer(delay) { const entry = [...h.timers.entries()].find(([, timer]) => timer.delay === delay); assert.ok(entry, `missing timer ${delay}`); h.timers.delete(entry[0]); entry[1].fn(); },
    listeners, docListeners, frames,
    setViewport(nextPresentation) { presentation = nextPresentation; },
    video,
    get completed() { return completed; }, get plays() { return plays; }, get pauses() { return pauses; },
    get exitDuration() { return exitDuration; },
    get presentation() { return renderedPresentation; },
  };
}

test('both platforms keep the poster painted and video hidden until a real frame is ready', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = loader({ presentation }), { poster, media } = h.render(), mobile = presentation === 'mobile';
    assert.equal(poster.type, 'img');
    assert.equal(media.type, 'video');
    assert.equal(h.presentation, presentation);
    assert.equal(media.props.src, mobile ? '/portalink-splash-mobile.mp4' : '/portalink-splash.mp4');
    assert.equal(media.props.poster, mobile ? '/portalink-splash-mobile-poster.png' : '/portalink-splash-poster.png');
    assert.equal(media.props.width, mobile ? 512 : 576);
    assert.equal(media.props.height, mobile ? 720 : 576);
    assert.equal(media.props.muted, true); assert.equal(media.props.playsInline, true);
    assert.equal(media.props.autoPlay, true); assert.equal(media.props['aria-hidden'], 'true');
    assert.equal(media.props.loop, undefined); assert.equal(media.props.controls, false);
    assert.equal(media.props.disableRemotePlayback, true); assert.equal(media.props.tabIndex, -1);
    assert.equal(media.props.style.opacity, 0);
    assert.equal(h.video.muted, true); assert.equal(h.video.defaultMuted, true);
    assert.equal(h.plays, 1); assert.equal(h.completed, 0);
    h.render(); assert.equal(h.plays, 1);
    h.start(); assert.equal(h.render().media.props.style.opacity, 0);
    h.paint(); assert.equal(h.render().media.props.style.opacity, 1);
    h.emit('ended'); h.emit('ended'); assert.equal(h.completed, 1);
    assert.equal(h.render().media.props.style.opacity, 1, 'successful exit retains the final frame');
    h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.docListeners.size, 0);
  }
});

test('WEB starts its short presentation budget on the first frame, not during buffering', () => {
  const h = loader(); h.render();
  assert.equal([...h.timers.values()].some(t => t.delay === 880), false);
  h.start(); h.paint();
  assert.equal(h.exitDuration, 0.32); h.timer(880);
  assert.equal(h.completed, 1);
  assert.equal(h.render().media.props.style.opacity, 1);
  h.unmount();
});

test('MOBILE finishes onEnded and a hard deadline replaces a hung video with the poster', () => {
  for (const ended of [true, false]) {
    const h = loader({ presentation: 'mobile' }); h.render(); h.start(); h.paint();
    assert.equal(h.completed, 0);
    if (ended) h.emit('ended'); else h.timer(2200);
    assert.equal(h.completed, 1);
    assert.equal(Boolean(h.render().media), ended);
    h.emit('ended'); assert.equal(h.completed, 1);
    h.unmount(); assert.equal(h.timers.size, 0);
  }
});

test('missing first frames use a still within 600ms, including a never-settling play promise', () => {
  const h = loader({ play: () => new Promise(() => {}) }); h.render();
  h.start(); const staleFrame = [...h.frames.values()][0];
  h.timer(600); assert.equal(h.completed, 1); assert.equal(h.frames.size, 0);
  staleFrame(); assert.equal(h.render().media, false);
  assert.equal(h.timers.size, 0); h.unmount();
});

test('browsers without frame callbacks reveal only playing, decoded media', () => {
  const h = loader({ legacy: true }); h.render(); h.emit('loadeddata');
  assert.equal(h.render().media.props.style.opacity, 0);
  h.start(); assert.equal(h.render().media.props.style.opacity, 1); h.unmount();
});

test('a viewport change during startup does not replace or restart the selected platform clip', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = loader({ presentation }), { media } = h.render();
    const timer = [...h.timers.values()][0];
    h.setViewport(presentation === 'mobile' ? 'web' : 'mobile');
    const { media: next } = h.render();
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
      const h = loader({ presentation, blocked: failure === 'blocked', throws: failure === 'throws' }); h.render();
      if (failure === 'error') h.emit('error');
      await Promise.resolve();
      assert.equal(h.completed, 1);
      const { poster, media } = h.render();
      assert.equal(media, false); assert.equal(poster.type, 'img');
      assert.equal(poster.props.src, presentation === 'mobile' ? '/portalink-splash-mobile-poster.png' : '/portalink-splash-poster.png');
      assert.equal(h.timers.size, 0);
      h.emit('error'); h.emit('ended'); assert.equal(h.completed, 1);
      h.unmount();
    }
  }
});

test('interruptions or backgrounding immediately remove video and cannot replay it on resume', () => {
  for (const event of ['pause', 'waiting', 'stalled', 'hidden']) {
    const h = loader(); h.render(); h.start(); h.paint();
    if (event === 'hidden') h.hide(); else h.emit(event);
    assert.equal(h.completed, 1); assert.equal(h.render().media, false);
    assert.equal(h.plays, 1); assert.equal(h.timers.size, 0); h.unmount();
  }
  const background = loader({ hidden: true }); background.render();
  assert.equal(background.plays, 0); assert.equal(background.completed, 1); background.unmount();
});

test('late promises from cleanup or StrictMode cannot fail a newer playback attempt', async () => {
  let rejectOld;
  const h = loader({ play: n => n === 1 ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve() });
  h.render(); h.restartEffects(); assert.equal(h.plays, 2);
  rejectOld(Error('aborted old playback')); await Promise.resolve();
  assert.equal(h.completed, 0); assert.ok(h.render().media);
  h.start(); h.listeners.get('pause')();
  assert.equal(h.completed, 0, 'a queued pause from cleanup cannot fail resumed playback');
  h.paint(); assert.equal(h.render().media.props.style.opacity, 1);
  h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
});

test('reduced motion and later session retries use platform stills without mounting or playing video', () => {
  for (const presentation of ['web', 'mobile']) {
    for (const options of [{ reduced: true }, { stillOnly: true }]) {
      const h = loader({ presentation, ...options }), { poster, media } = h.render(), mobile = presentation === 'mobile';
      assert.equal(media, false); assert.equal(poster.type, 'img');
      assert.equal(poster.props.src, mobile ? '/portalink-splash-mobile-poster.png' : '/portalink-splash-poster.png');
      assert.equal(poster.props.width, mobile ? 512 : 576); assert.equal(poster.props.height, mobile ? 720 : 576);
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

test('ready content loads beneath the bounded intro; navigation and auth retries never replay it', () => {
  for (const first of ['auth', 'media']) {
  const h = hooks(), auth = { isInitializing: true, isAuthenticated: false }, location = { pathname: '/' };
  const storage = new Map();
  const { ApplicationBootstrap } = compile('../src/app/ApplicationBootstrap.tsx', {
    react: h.react, 'framer-motion': { AnimatePresence: 'presence' },
    'react-router-dom': { Navigate: 'redirect', matchPath: () => null, useLocation: () => location },
    '../App': { App: 'app' }, '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' },
    '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes: { sharedProject: {}, sharedProfileCategory: {}, sharedProfile: {} }, buildPath: (_, p) => `/share/${p.profileId}` },
    './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exited' },
    '../presentation/useViewportPresentation': { useViewportPresentation: () => 'web' },
    '../features/auth/registration': { readSharedReturnPath: () => undefined },
  }, { window: { ...h.window, sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } } });
  const render = () => { const tree = h.render(ApplicationBootstrap); h.flush(); return tree.props.children; };
  let [app, presence] = render();
  assert.equal(app, null); assert.equal(presence.props.children.props.stillOnly, false);
  if (first === 'media') {
    presence.props.children.props.onComplete(); [app, presence] = render();
    assert.equal(app, null, 'completed intro cannot bypass session restoration');
    assert.equal(presence.props.children.type, 'splash');
  }
  auth.isInitializing = false;
  [app, presence] = render();
  assert.equal(app.type, 'app', 'data starts loading before the intro completes');
  assert.equal(presence.props.children.type, 'splash');
  presence.props.children.props.onComplete();
  render(); [app, presence] = render();
  assert.equal(app.type, 'app'); assert.equal(presence.props.children, null);
  location.pathname = '/messages'; [app, presence] = render();
  assert.equal(presence.props.children, null);
  auth.isInitializing = true; [app, presence] = render();
  assert.equal(app, null); assert.equal(presence.props.children.props.stillOnly, true);
  auth.isInitializing = false; [app, presence] = render();
  assert.equal(app.type, 'app'); assert.equal(presence.props.children, null);
  h.unmount();
  }
});

test('splash native controls are suppressed only inside the decorative startup video', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.portalink-splash-media\s*\{[^}]*grid-area:\s*1 \/ 1/);
  assert.match(css, /\.portalink-splash-video\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.portalink-splash-video::-webkit-media-controls-start-playback-button\s*\{[^}]*display:\s*none !important/);
});

function sharedBootstrap({ presentation = 'mobile', path = '/share/a/c/b/c', search = '?page=2', hash = '', recovery = false, authenticated = false } = {}) {
  const h = hooks(), requested = [], location = {pathname:path,search,hash}, storage = new Map();
  const auth = {isInitializing:true,isAuthenticated:authenticated,pendingView:recovery?'resetPassword':null,
    requestAuthenticatedDestination(intent,view) { requested.push({intent,view}); auth.pendingView=view; },
    requestAuth(view) { requested.push({view}); auth.pendingView=view; }};
  const { ApplicationBootstrap } = compile('../src/app/ApplicationBootstrap.tsx', {
    react:h.react, 'framer-motion':{AnimatePresence:'presence'},
    'react-router-dom':{Navigate:'redirect',matchPath:(_, pathname)=>pathname.startsWith('/share/')?{params:{profileId:pathname.split('/')[2]}}:null,useLocation:()=>location},
    '../App':{App:'app'}, '../components/ui/PortalinkSplashLoader':{PortalinkSplashLoader:'splash'},
    '../contexts/AuthContext':{useAuth:()=>auth},
    './routes':{routes:{sharedProject:{},sharedProfileCategory:{},sharedProfile:{}},buildPath:(_,p)=>`/share/${p.profileId}`},
    './splashLifecycle':{PORTALINK_SPLASH_EXIT_EVENT:'splash-exited'},
    '../presentation/useViewportPresentation':{useViewportPresentation:()=>presentation},
    '../features/auth/registration':{readSharedReturnPath:path=>path.startsWith('/share/')?path:undefined},
  }, {window:{...h.window,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}}});
  return {auth,requested,location,setPresentation(value){presentation=value;},render(){const tree=h.render(ApplicationBootstrap);h.flush();return tree.props.children[1].props.children;}};
}

test('mobile landing reveals actions after video and auth, then opens appearance without replaying on cancellation', () => {
  for (const first of ['media','auth']) {
    const h=sharedBootstrap(); let splash=h.render(); assert.equal(splash.props.landing.ready,false);
    if(first==='media') splash.props.onComplete(); else h.auth.isInitializing=false;
    splash=h.render(); assert.equal(splash.props.landing.ready,false);
    if(first==='media') h.auth.isInitializing=false; else splash.props.onComplete();
    splash=h.render(); assert.equal(splash.props.landing.ready,true);
    splash.props.landing.onCreateAccount(); splash=h.render();
    assert.equal(h.requested[0].view,'signUp'); assert.equal(h.requested[0].intent.path,'/share/a/c/b/c?page=2');
    assert.equal(splash.props.hidden,true); assert.equal(splash.props.stillOnly,false);
    for(const view of ['signIn','forgotPassword','signUp']) {h.auth.pendingView=view;assert.equal(h.render().props.hidden,true);}
    h.auth.pendingView=null; splash=h.render();
    assert.equal(splash.props.hidden,false); assert.equal(splash.props.landing.ready,true); assert.equal(splash.props.stillOnly,false);
    splash.props.landing.onContinue(); h.render(); assert.equal(h.render(),null);
    h.location.pathname='/share/other'; assert.equal(h.render(),null);
  }
});

test('authenticated visitors, recovery, WEB and callback URLs never hold the landing', () => {
  for(const options of [{authenticated:true},{recovery:true},{presentation:'web'},{search:'?code=private'},{hash:'#type=recovery'},{path:'/messages'}]) {
    const h=sharedBootstrap(options); let splash=h.render(); assert.equal(splash.props.landing,undefined);
    splash.props.onComplete(); h.auth.isInitializing=false; h.render(); assert.equal(h.render(),null);
    h.auth.isAuthenticated=false; h.auth.pendingView=null; assert.equal(h.render(),null);
  }
});

test('sign in or resizing to WEB ends the opening landing permanently', () => {
  for(const action of ['signin','resize']) {
    const h=sharedBootstrap();h.auth.isInitializing=false;h.render().props.onComplete();
    const splash=h.render();
    if(action==='signin'){splash.props.landing.onSignIn();h.auth.isAuthenticated=true;h.auth.pendingView=null;}
    else h.setPresentation('web');
    assert.equal(h.render().props.hidden,true);assert.equal(h.render(),null);
    h.auth.isAuthenticated=false;h.setPresentation('mobile');assert.equal(h.render(),null);
  }
});
