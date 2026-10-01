const shareModel = sourceModule('src/features/sharing/shareModel.ts');
import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { matchPath } from 'react-router-dom';

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
test('mobile fallback contains the supplied clip as an infinite animation, not a static poster', () => {
  const asset=readFileSync(new URL('../public/portalink-welcome-loop.webp',import.meta.url));
  assert.equal(asset.toString('ascii',0,4),'RIFF'); assert.equal(asset.toString('ascii',8,12),'WEBP');
  let frames=0,duration=0,loops;
  for(let offset=12;offset+8<=asset.length;) {
    const kind=asset.toString('ascii',offset,offset+4),size=asset.readUInt32LE(offset+4),data=offset+8;
    if(kind==='ANIM') loops=asset.readUInt16LE(data+4);
    if(kind==='ANMF'){frames++;duration+=asset.readUIntLE(data+12,3);}
    offset=data+size+(size%2);
  }
  assert.equal(loops,0); assert.ok(frames>30); assert.ok(duration>=1490&&duration<=1510);
  assert.equal(createHash('sha256').update(asset).digest('hex').slice(0,8),'6dceb1fd');
  const clip=readFileSync(new URL('../public/portalink-splash-mobile.mp4',import.meta.url));
  assert.equal(createHash('sha256').update(clip).digest('hex').slice(0,8),'4d282896');
});
function compile(path, imports, globals) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, URLSearchParams, ...globals, require(name) { assert.ok(name in imports, name); return imports[name]; } });
  return exports;
}
function loader({ reduced = false, stillOnly = false, blocked = false, throws = false, hidden = false, legacy = false, play, presentation = 'web', landing = undefined, timedIntro = false, welcomeMedia = false } = {}) {
  const h = hooks();
  let completed = 0, plays = 0, pauses = 0, exitDuration = 0, renderedPresentation, surfaceHidden = false;
  const listeners = new Map(), docListeners = new Map(), windowListeners = new Map(), frames = new Map(), modalCalls = [];
  h.window.addEventListener=(name,fn)=>windowListeners.set(name,fn);
  h.window.removeEventListener=(name,fn)=>{if(windowListeners.get(name)===fn)windowListeners.delete(name);};
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
    '../../hooks/useModalFocus': { useModalFocus(open) { modalCalls.push(open); } },
  }, { window: h.window, document });
  const onComplete = () => completed++;
  return { ...h,
    render() {
      const tree = h.render(() => PortalinkSplashLoader({ onComplete, stillOnly, landing, timedIntro, welcomeMedia, hidden: surfaceHidden }));
      exitDuration = tree.props.transition.duration;
      renderedPresentation = tree.props['data-presentation'];
      const [poster, media] = tree.props.children[0].props.children.props.children;
      if (media) media.ref.current = video;
      h.flush(); return { poster, media, tree };
    },
    start() { video.paused = false; video.readyState = 2; listeners.get('playing')?.(); },
    paint() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); },
    emit(name) { if (name === 'ended') video.ended = true; if (name === 'pause') video.paused = true; listeners.get(name)?.(); },
    hide() { document.hidden = true; docListeners.get('visibilitychange')?.(); },
    foreground() { document.hidden = false; docListeners.get('visibilitychange')?.(); },
    setHidden(value) { surfaceHidden = value; },
    setLanding(value) { landing = value; },
    timer(delay) { const entry = [...h.timers.entries()].find(([, timer]) => timer.delay === delay); assert.ok(entry, `missing timer ${delay}`); h.timers.delete(entry[0]); entry[1].fn(); },
    listeners, docListeners, windowListeners, frames, modalCalls,
    restore() { windowListeners.get('pageshow')?.(); },
    leave() { windowListeners.get('pagehide')?.(); },
    gesture() { docListeners.get('pointerup')?.(); },
    setViewport(nextPresentation) { presentation = nextPresentation; },
    video,
    get completed() { return completed; }, get plays() { return plays; }, get pauses() { return pauses; },
    get exitDuration() { return exitDuration; },
    get presentation() { return renderedPresentation; },
  };
}

test('embedded Hello World media uses the looping mobile clip on both platforms without a startup overlay or landing focus', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = loader({ presentation, welcomeMedia: true });
    let { tree, poster, media } = h.render();
    const mediaKey = media.key;
    assert.equal(tree.props.className, 'portalink-welcome-media');
    assert.equal(tree.props['data-portalink-splash'], undefined);
    assert.equal(tree.props['data-share-landing'], undefined);
    assert.equal(tree.props['data-presentation'], presentation);
    assert.equal(tree.props.role, 'img');
    assert.equal(tree.props['aria-label'], 'Hello World — Portalink');
    assert.equal(tree.props['aria-live'], undefined);
    assert.equal(tree.props['aria-modal'], undefined);
    assert.equal(tree.props.tabIndex, undefined);
    assert.equal(tree.props.children[1], undefined);
    assert.equal(poster.props.src, '/portalink-welcome-loop.webp?v=6dceb1fd');
    assert.equal(media.props.src, '/portalink-splash-mobile.mp4?v=4d282896');
    assert.equal(media.props.poster, undefined);
    assert.equal(media.props.loop, true);
    assert.equal(media.props.controls, false);
    assert.equal(media.props.width, 512);
    assert.equal(media.props.height, 720);
    assert.equal(h.modalCalls.some(Boolean), false);
    assert.equal([...h.timers.values()].some(timer => [600, 880, 1500].includes(timer.delay)), false,
      'Embedded media must not schedule first-frame or startup exit budgets');
    h.start(); h.paint();
    assert.equal(h.render().media.props.style.opacity, 1);
    assert.equal(h.timers.size, 0, 'Healthy embedded playback has no deadline');
    // A prolonged interruption can trigger playback recovery, but cannot expire the embedded surface.
    h.emit('waiting'); h.timer(2200); h.timer(800); h.start(); h.paint();
    ({ tree, poster, media } = h.render());
    assert.equal(tree.props.className, 'portalink-welcome-media');
    assert.equal(media.key, mediaKey);
    assert.equal(media.props.loop, true);
    assert.equal(media.props.style.opacity, 1);
    assert.equal(h.timers.size, 0);
    assert.equal(h.modalCalls.some(Boolean), false);
    assert.equal(poster.props.src, '/portalink-welcome-loop.webp?v=6dceb1fd');
    h.unmount();
    assert.equal(h.listeners.size, 0); assert.equal(h.docListeners.size, 0); assert.equal(h.windowListeners.size, 0);
  }
});

test('embedded welcome media keeps an animated fallback after blocked autoplay and bounded retries on MOBILE and WEB', async () => {
  for (const presentation of ['mobile', 'web']) {
    const h = loader({ presentation, welcomeMedia: true, blocked: true });
    h.render(); await Promise.resolve();
    for (let retry = 0; retry < 2; retry++) { h.timer(800); await Promise.resolve(); }
    const { tree, poster, media } = h.render();
    assert.equal(h.plays, 3);
    assert.equal(h.timers.size, 0, 'Repeated policy rejection stops retries without expiring the form media');
    assert.equal(tree.props.className, 'portalink-welcome-media');
    assert.equal(tree.props['data-portalink-splash'], undefined);
    assert.equal(tree.props['aria-live'], undefined);
    assert.equal(media.type, 'video');
    assert.equal(media.props.loop, true);
    assert.equal(media.props.poster, undefined);
    assert.equal(media.props.style.opacity, 0);
    assert.equal(poster.type, 'img');
    assert.equal(poster.props.src, '/portalink-welcome-loop.webp?v=6dceb1fd');
    assert.notEqual(poster.props.style?.visibility, 'hidden');
    assert.equal(h.modalCalls.some(Boolean), false);
    h.unmount(); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  }
});

test('both platforms keep their fallback visible until a real video frame is ready', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = loader({ presentation }), { poster, media } = h.render(), mobile = presentation === 'mobile';
    assert.equal(poster.type, 'img');
    assert.equal(media.type, 'video');
    assert.equal(h.presentation, presentation);
    assert.equal(media.props.src, mobile ? '/portalink-splash-mobile.mp4?v=4d282896' : '/portalink-splash.mp4');
    assert.equal(media.props.poster, mobile ? undefined : '/portalink-splash-poster.png');
    assert.equal(media.props.width, mobile ? 512 : 576);
    assert.equal(media.props.height, mobile ? 720 : 576);
    assert.equal(media.props.muted, true); assert.equal(media.props.playsInline, true);
    assert.equal(media.props.autoPlay, true); assert.equal(media.props['aria-hidden'], 'true');
    assert.equal(media.props.loop, mobile || undefined); assert.equal(media.props.controls, false);
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

test('returning MOBILE intro is video-only with one 1500ms budget and no extra exit fade', () => {
  const h=loader({presentation:'mobile',timedIntro:true});
  let {tree,media}=h.render();
  assert.equal(tree.props.children[1],undefined);
  assert.equal(media.props.controls,false); assert.equal(media.props.loop,true);
  assert.equal(h.exitDuration,0);
  assert.ok([...h.timers.values()].some(timer=>timer.delay===1500));
  const timerId=[...h.timers.keys()][0];
  h.start(); h.paint(); ({tree,media}=h.render());
  assert.equal(media.props.style.opacity,1); assert.equal(h.completed,0);
  h.emit('ended'); h.render();
  assert.equal(h.completed,0,'early media completion cannot shorten the intro');
  assert.ok(h.timers.has(timerId),'playback and rerenders cannot restart the budget');
  h.timer(1500); assert.equal(h.completed,1);
  h.unmount(); assert.equal(h.timers.size,0); assert.equal(h.listeners.size,0);
});

test('returning MOBILE fallback stays bounded without native play controls or timing retries', async () => {
  for (const options of [{blocked:true},{throws:true},{reduced:true},{play:()=>new Promise(()=>{})}]) {
    const h=loader({presentation:'mobile',timedIntro:true,...options});
    h.render(); await Promise.resolve(); h.render();
    assert.equal(h.completed,0);
    assert.ok([...h.timers.values()].some(timer=>timer.delay===1500));
    h.timer(1500); assert.equal(h.completed,1);
    assert.equal(h.exitDuration,0); h.unmount(); assert.equal(h.timers.size,0);
  }
});

test('a verified guest switches pending MOBILE playback to the continuous welcome without a deadline', () => {
  const h=loader({presentation:'mobile',timedIntro:true});
  h.render(); h.start();
  assert.ok([...h.timers.values()].some(timer=>timer.delay===1500));
  h.setLanding(welcome); h.render(); h.start(); h.paint();
  assert.equal(h.render().media.props.loop,true);
  assert.equal(h.render().tree.props.children[1].props['aria-busy'],false);
  assert.equal(h.timers.size,0); h.unmount();
});

test('temporary buffering or backgrounding during restoration cannot poison a later guest welcome', () => {
  for (const event of ['waiting','stalled','pause','hidden']) {
    const h=loader({presentation:'mobile',timedIntro:true}); h.render(); h.start(); h.paint();
    if(event==='hidden') h.hide(); else h.emit(event);
    assert.ok(h.render().media); assert.equal(h.completed,0);
    h.setLanding(welcome); h.render(); if(event==='hidden') h.foreground(); h.start(); h.paint();
    assert.equal(h.render().media.props.loop,true); assert.equal(h.render().media.props.style.opacity,1);
    assert.equal(h.completed,1); assert.equal(h.timers.size,0); h.unmount();
  }
});

test('backgrounding invalidates an aborted timed play promise before the guest welcome resumes', async () => {
  let rejectPending;
  const h=loader({presentation:'mobile',timedIntro:true,play:n=>n===1?new Promise((_,reject)=>{rejectPending=reject;}):Promise.resolve()});
  h.render(); h.hide(); rejectPending(Error('play interrupted by pause')); await Promise.resolve();
  assert.ok(h.render().media); assert.equal(h.completed,0);
  h.setLanding(welcome); h.render(); h.foreground(); h.start(); h.paint();
  assert.equal(h.render().media.props.style.opacity,1); assert.equal(h.render().media.props.loop,true);
  h.unmount(); assert.equal(h.timers.size,0);
});

test('MOBILE interruptions retain a looping video and animated fallback', () => {
  for (const event of ['pause','error','waiting','stalled']) {
    const h=loader({presentation:'mobile'}); h.render(); h.start(); h.paint();
    h.emit(event); const {poster,media}=h.render();
    assert.ok(media); assert.equal(media.props.loop,true);
    assert.equal(poster.props.src,'/portalink-welcome-loop.webp?v=6dceb1fd');
    h.unmount(); assert.equal(h.timers.size,0);
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

test('WEB errors, rejected autoplay and playback failures retain its still fallback', async () => {
  for (const presentation of ['web']) {
    for (const failure of ['error', 'blocked', 'throws']) {
      const h = loader({ presentation, blocked: failure === 'blocked', throws: failure === 'throws' }); h.render();
      if (failure === 'error') h.emit('error');
      await Promise.resolve();
      assert.equal(h.completed, 1);
      const { poster, media } = h.render();
      assert.equal(media, false); assert.equal(poster.type, 'img');
      assert.equal(poster.props.src, presentation === 'mobile' ? '/portalink-welcome-loop.webp?v=6dceb1fd' : '/portalink-splash-poster.png');
      assert.equal(h.timers.size, 0);
      h.emit('error'); h.emit('ended'); assert.equal(h.completed, 1);
      h.unmount();
    }
  }
});

test('WEB interruptions retain its existing immediate still fallback', () => {
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

test('WEB reduced motion and later session retries retain its still fallback', () => {
  for (const presentation of ['web']) {
    for (const options of [{ reduced: true }, { stillOnly: true }]) {
      const h = loader({ presentation, ...options }), { poster, media } = h.render(), mobile = presentation === 'mobile';
      assert.equal(media, false); assert.equal(poster.type, 'img');
      assert.equal(poster.props.src, mobile ? '/portalink-welcome-loop.webp?v=6dceb1fd' : '/portalink-splash-poster.png');
      assert.equal(poster.props.width, mobile ? 512 : 576); assert.equal(poster.props.height, mobile ? 720 : 576);
      assert.equal(h.plays, 0); assert.equal(h.completed, 1); assert.equal(h.timers.size, 0);
      if (options.reduced) assert.equal(h.exitDuration, 0);
      h.unmount();
    }
  }
});

test('preboot removes the obsolete MOBILE poster at the canonical boundary and preserves WEB', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const { MOBILE_PRESENTATION_QUERY } = compile('../src/presentation/useViewportPresentation.ts', { react: React });
  const preboot = html.match(/<div id="portalink-preboot"[\s\S]*?<\/div>/)?.[0];
  assert.ok(preboot);
  const source = preboot.match(/<source\s[^>]*>/)?.[0];
  assert.ok(source);
  assert.equal(source.match(/media="([^"]+)"/)?.[1], MOBILE_PRESENTATION_QUERY);
  assert.match(source, /srcset="\/portalink-welcome-loop\.webp\?v=6dceb1fd"/);
  assert.doesNotMatch(preboot, /portalink-splash-mobile-poster/);
  assert.doesNotMatch(preboot, /mobile-startup-status/);
  assert.match(preboot, /<img src="\/portalink-splash-poster\.png"[^>]*width="576" height="576"/);
  assert.ok(html.includes(`@media ${MOBILE_PRESENTATION_QUERY}`));
  assert.doesNotMatch(html, /(?:^|\n)\s*#portalink-preboot picture\s*\{\s*display:\s*none;/,
    'normal startup retains its picture; shared entry may hide it with a scoped rule');
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
    '../components/ui/StateViews': { LoadingState: 'loading' },
    '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes: { controlCenter: {path:'/settings'}, sharedCollaboration: {}, sharedProject: {}, sharedProfileCategory: {}, sharedProfile: {} }, buildPath: (_, p) => `/share/${p.profileId}` },
    './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exited' },
    '../features/sharing/shareModel': shareModel,
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

function sharedBootstrap({ presentation = 'mobile', path = '/share/a/c/b/c', search = '?page=2', hash = '', recovery = false, authenticated = false, storedProfileId } = {}) {
  const h = hooks(), requested = [], redirects = [], location = {pathname:path,search,hash}, storage = new Map();
  if (storedProfileId) storage.set('portalink.sharedViewerProfileId', storedProfileId);
  let rendered;
  const auth = {isInitializing:true,isAuthenticated:authenticated,pendingView:recovery?'resetPassword':null,
    requestAuthenticatedDestination(intent,view) { requested.push({intent,view}); auth.pendingView=view; },
    requestAuth(view) { requested.push({view}); auth.pendingView=view; }};
  const { ApplicationBootstrap } = compile('../src/app/ApplicationBootstrap.tsx', {
    react:h.react, 'framer-motion':{AnimatePresence:'presence'},
    'react-router-dom':{Navigate:'redirect',matchPath,useLocation:()=>location},
    '../App':{App:'app'}, '../components/ui/PortalinkSplashLoader':{PortalinkSplashLoader:'splash'},
    '../components/ui/StateViews':{LoadingState:'loading'},
    '../contexts/AuthContext':{useAuth:()=>auth},
    './routes':{routes:{controlCenter:{path:'/settings'},sharedCollaboration:{path:'/share/:profileId/collaboration'},sharedProject:{path:'/share/:profileId/c/:categoryId/:projectId'},sharedProfileCategory:{path:'/share/:profileId/c/:categoryId'},sharedProfile:{path:'/share/:profileId'}},buildPath:(_,p)=>`/share/${p.profileId}`},
    './splashLifecycle':{PORTALINK_SPLASH_EXIT_EVENT:'splash-exited'},
    '../features/sharing/shareModel': shareModel,
    '../presentation/useViewportPresentation':{useViewportPresentation:()=>presentation},
    '../features/auth/registration':{readSharedReturnPath:path=>path.startsWith('/share/')?path:undefined},
    }, {window:{...h.window,location:{replace:path=>redirects.push(path)},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}}});
  return {auth,requested,redirects,location,storage,get app(){return rendered.props.children[0];},get waiting(){return rendered.props.children[2];},setPresentation(value){presentation=value;},render(){rendered=h.render(ApplicationBootstrap);h.flush();return rendered.props.children[1].props.children;}};
}

test('shared entry bypasses every intro on both platforms while respecting session readiness', () => {
  for (const presentation of ['mobile','web']) for (const authenticated of [false,true]) {
    const h=sharedBootstrap({presentation,authenticated});
    assert.equal(h.render(),null);
    assert.equal(h.app,null,'shared entry still waits for real session restoration');
    assert.equal(h.waiting.props.children.type,'loading');
    assert.equal(h.waiting.props.children.props.label,'Opening shared content…');
    h.auth.isInitializing=false;
    assert.equal(h.render(),null);
    assert.equal(h.app?.type ?? null,presentation === 'mobile' ? null : 'app');
    assert.deepEqual(h.redirects,presentation === 'mobile' ? ['/share/a/c/b/c?page=2'] : []);
    assert.equal(h.waiting,false);
    assert.equal(h.requested.length,0,'opening a public link never opens authentication');
    h.setPresentation(presentation==='mobile'?'web':'mobile');
    assert.equal(h.render(),null,'rotation cannot introduce a skipped intro');
    h.auth.isInitializing=true;
    assert.equal(h.render(),null,'a session refresh keeps shared entry free of branded media');
    assert.equal(h.waiting.props.children.type,'loading');
    h.auth.isInitializing=false;
    assert.equal(h.render(),null); assert.equal(h.app?.type ?? null,presentation === 'mobile' ? 'app' : null);
  }
});

test('shared profiles, categories and project fragments open directly without changing their destination', () => {
  for (const path of ['/share/a','/share/a/c/b','/share/a/c/b/c','/share/a/collaboration']) for (const hash of ['', '#projects', '#page-2', '#type=recovery']) {
    const h=sharedBootstrap({path,search:'?view=projects&page=2&media=image-a',hash,storedProfileId:'older'});
    h.auth.isInitializing=false;
    assert.equal(h.render(),null);
    assert.equal(h.app,null);
    assert.deepEqual(h.redirects,[path+'?view=projects&page=2&media=image-a'+hash]);
    assert.equal(h.location.pathname,path); assert.equal(h.location.search,'?view=projects&page=2&media=image-a'); assert.equal(h.location.hash,hash);
    assert.equal(h.storage.get('portalink.sharedViewerProfileId'),'a');
    assert.equal(h.requested.length,0);
  }
});

test('direct shared entry retains public Settings access and the existing guest route boundary', () => {
  const h=sharedBootstrap({path:'/share/creator',search:'?view=portals',storedProfileId:'older'});
  h.auth.isInitializing=false;
  assert.equal(h.render(),null); assert.equal(h.app,null);
  for (const path of ['/settings','/appearance']) {
    h.location.pathname=path; h.location.search='';
    assert.equal(h.render(),null); assert.equal(h.app.type,'app');
  }
  h.location.pathname='/messages'; h.render();
  assert.equal(h.app.type,'redirect'); assert.equal(h.app.props.to,'/share/creator');
  assert.equal(h.requested.length,0);
});

test('invites open root welcome without a previous shared-profile redirect or account destination', () => {
  const h=sharedBootstrap({path:'/',search:'?welcome=1',storedProfileId:'previous-creator'});
  h.render(); h.auth.isInitializing=false;
  let splash=h.render(); assert.equal(h.app.type,'app');
  assert.equal(h.storage.has('portalink.sharedViewerProfileId'),false);
  assert.equal(splash.props.landing.continueLabel,'Continue as guest');
  for (const [action,view] of [['onCreateAccount','signUp'],['onSignIn','signIn'],['onForgotPassword','forgotPassword']]) {
    splash.props.landing[action](); assert.deepEqual(h.requested.at(-1),{view});
    assert.equal(h.render().props.hidden,true);
    h.auth.pendingView=null; splash=h.render(); assert.equal(splash.props.hidden,false);
  }
  splash.props.landing.onContinue(); assert.equal(h.render(),null);
  assert.equal(h.render(),null,'the welcome marker cannot reopen a dismissed landing');
  const reopened=sharedBootstrap({path:'/',search:'?welcome=1'}); reopened.auth.isInitializing=false;
  assert.equal(reopened.render().props.landing.ready,true,'opening a new invitation shows welcome again');
});

test('invitation marker does not override signed-in, WEB, recovery or authentication callback flows', () => {
  for (const options of [{authenticated:true},{presentation:'web'},{recovery:true},{search:'?welcome=1&code=private'},{hash:'#type=recovery'}]) {
    const h=sharedBootstrap({path:'/',search:'?welcome=1',storedProfileId:'previous-creator',...options});
    h.render(); h.auth.isInitializing=false;
    assert.equal(h.render().props.landing,undefined);
    if (options.recovery || options.hash || options.search) assert.equal(h.storage.get('portalink.sharedViewerProfileId'),'previous-creator');
  }
  const ordinary=sharedBootstrap({path:'/',search:'',storedProfileId:'previous-creator'}); ordinary.auth.isInitializing=false;
  ordinary.render(); assert.equal(ordinary.app.type,'redirect','ordinary guest navigation keeps its existing shared-profile boundary');
});

test('restored MOBILE sessions keep a visible video-only intro until its timed completion', () => {
  const h=sharedBootstrap({path:'/',search:''}); let splash=h.render();
  assert.equal(splash.props.landing,undefined); assert.equal(splash.props.hidden,false);
  assert.equal(splash.props.timedIntro,true); assert.equal(h.app,null);
  h.auth.isInitializing=false; h.auth.isAuthenticated=true;
  splash=h.render(); splash=h.render();
  assert.equal(splash.props.landing,undefined); assert.equal(splash.props.hidden,false);
  assert.equal(splash.props.timedIntro,true); assert.equal(h.app.type,'app');
  splash.props.onComplete(); assert.equal(h.render(),null);
  assert.equal(h.app.type,'app'); assert.equal(h.waiting,false);
  h.render(); h.location.pathname='/messages'; assert.equal(h.render(),null);
});

test('a slow MOBILE session shows loading after the intro without extending video or revealing protected content', () => {
  const h=sharedBootstrap({path:'/',search:''}); h.render().props.onComplete();
  assert.equal(h.render(),null); assert.equal(h.app,null);
  assert.equal(h.waiting.props.children.type,'loading');
  h.auth.isInitializing=false; h.auth.isAuthenticated=true;
  assert.equal(h.render(),null); assert.equal(h.app.type,'app'); assert.equal(h.waiting,false);
});

test('rotation does not cancel or hide the initial returning MOBILE intro', () => {
  const h=sharedBootstrap({path:'/',search:''}); h.render(); h.setPresentation('web');
  let splash=h.render(); assert.equal(splash.props.timedIntro,true); assert.equal(splash.props.hidden,false);
  h.auth.isInitializing=false; h.auth.isAuthenticated=true; splash=h.render();
  assert.equal(splash.props.timedIntro,true); assert.equal(splash.props.hidden,false);
  splash.props.onComplete(); assert.equal(h.render(),null);
});

test('root mobile landing waits for verified guest status, then stays behind account forms', () => {
  for (const first of ['media','auth']) {
    const h=sharedBootstrap({path:'/',search:''}); let splash=h.render(); assert.equal(splash.props.landing,undefined);
    assert.equal(splash.props.timedIntro,true); assert.equal(splash.props.hidden,false);
    if(first==='media') splash.props.onComplete(); else h.auth.isInitializing=false;
    splash=h.render();
    if(first==='media') assert.equal(splash,null,'a slow session cannot extend the intro');
    else assert.equal(splash.props.landing.ready,true);
    if(first==='media') h.auth.isInitializing=false; else splash.props.onComplete();
    splash=h.render(); assert.equal(splash.props.landing.ready,true);
    splash.props.landing.onCreateAccount(); splash=h.render();
    assert.deepEqual(h.requested[0],{view:'signUp'});
    assert.equal(splash.props.hidden,true); assert.equal(splash.props.stillOnly,false);
    for(const view of ['signIn','forgotPassword','signUp']) {h.auth.pendingView=view;assert.equal(h.render().props.hidden,true);}
    h.auth.pendingView=null; splash=h.render();
    assert.equal(splash.props.hidden,false); assert.equal(splash.props.landing.ready,true); assert.equal(splash.props.stillOnly,false);
    splash.props.landing.onContinue(); h.render(); assert.equal(h.render(),null);
    h.location.pathname='/share/other'; assert.equal(h.render(),null);
  }
});

test('authenticated visitors, recovery, WEB and callback URLs never hold the landing', () => {
  for(const options of [{authenticated:true},{recovery:true},{presentation:'web'},{search:'?auth=signIn'},{search:'?code=private'},{hash:'#type=recovery'},{path:'/messages'}]) {
    const h=sharedBootstrap({path:'/',search:'',...options}); let splash=h.render(); assert.equal(splash.props.landing,undefined);
    splash.props.onComplete(); h.auth.isInitializing=false; h.render(); assert.equal(h.render(),null);
    h.auth.isAuthenticated=false; h.auth.pendingView=null; assert.equal(h.render(),null);
  }
});

test('all root mobile welcome actions open the intended form without adding a shared destination', () => {
  for (const [action, view] of [['onSignIn','signIn'],['onCreateAccount','signUp'],['onForgotPassword','forgotPassword']]) {
    const h=sharedBootstrap({path:'/',search:''}); h.auth.isInitializing=false;
    const splash=h.render(); assert.equal(splash.props.landing.ready,true, 'buttons do not wait for video playback');
    splash.props.landing[action]();
    assert.equal(h.requested[0].view,view);
    assert.equal(h.requested[0].intent,undefined);
    assert.equal(h.render().props.hidden,true);
    h.auth.pendingView=null; assert.equal(h.render().props.hidden,false);
  }
});

test('ordinary root fragments keep welcome while authentication fragments bypass it', () => {
  for(const hash of ['#projects','#page-2']) {
    const h=sharedBootstrap({path:'/',search:'',hash}); h.auth.isInitializing=false;
    assert.equal(h.render().props.landing.ready,true);
  }
  for(const hash of ['#access_token=private','#refresh_token=private','#type=recovery','#error_description=expired','#code=private']) {
    const h=sharedBootstrap({path:'/',search:'',hash}); h.auth.isInitializing=false;
    assert.equal(h.render().props.landing,undefined);
  }
});

const welcome = {ready:true,onCreateAccount(){},onSignIn(){},onForgotPassword(){},onContinue(){},continueLabel:'View shared content'};

test('mobile welcome loops without the splash deadline and keeps all entry actions available', () => {
  const h=loader({presentation:'mobile',landing:welcome});
  const {media,tree}=h.render(); assert.equal(media.props.loop,true);
  const actions=tree.props.children[1];
  assert.equal(actions.props['aria-busy'],false);
  assert.equal(actions.props.children[0].props.disabled,false);
  assert.equal(actions.props.children[0].props.children,'Create account');
  assert.equal(actions.props.children[1].props.children[0].props.children,'Sign in');
  assert.equal(actions.props.children[1].props.children[1].props.children,'Forgot password?');
  h.start(); h.paint(); assert.equal(h.completed,1);
  assert.equal(h.timers.size,0,'no 2200ms deadline interrupts healthy playback');
  for(let cycle=0;cycle<5;cycle++) {
    h.emit('waiting'); h.start(); h.paint();
    assert.equal(h.render().media.props.style.opacity,1);
    assert.equal(h.timers.size,0); assert.equal(h.plays,1); assert.equal(h.pauses,0);
  }
  h.unmount(); assert.equal(h.listeners.size,0); assert.equal(h.frames.size,0);
});

test('welcome pauses for account forms and background tabs, then resumes the same video', () => {
  const h=loader({presentation:'mobile',landing:welcome}); h.render(); h.start(); h.paint();
  h.video.currentTime=0.75;
  h.setHidden(true); assert.equal(h.render().media.props.autoPlay,false);
  assert.equal(h.video.paused,true); assert.equal(h.plays,1); assert.equal(h.timers.size,0);
  h.setHidden(false); h.render(); assert.equal(h.plays,2); assert.equal(h.video.currentTime,0.75);
  h.start(); h.paint(); h.hide();
  assert.equal(h.video.paused,true); assert.equal(h.timers.size,0); assert.ok(h.render().media);
  h.foreground(); assert.equal(h.plays,3); h.start(); h.paint();
  assert.equal(h.completed,1); assert.equal(h.render().media.props.style.opacity,1);
  h.unmount(); assert.equal(h.docListeners.size,0);
});

test('welcome ignores stale playback failures after hide/resume and keeps reduced-motion and failure fallbacks usable', async () => {
  let rejectOld;
  const h=loader({presentation:'mobile',landing:welcome,play:n=>n===1?new Promise((_,reject)=>{rejectOld=reject;}):Promise.resolve()});
  h.render(); h.setHidden(true); h.render(); h.setHidden(false); h.render();
  rejectOld(Error('old attempt aborted')); await Promise.resolve();
  h.start(); h.paint(); assert.ok(h.render().media); assert.equal(h.completed,1); h.unmount();
  for(const options of [{blocked:true},{reduced:true}]) {
    const fallback=loader({presentation:'mobile',landing:welcome,...options}); fallback.render();
    await Promise.resolve();
    const {media,tree,poster}=fallback.render(); assert.ok(media); assert.equal(poster.props.src,'/portalink-welcome-loop.webp?v=6dceb1fd');
    if(options.reduced) { fallback.start(); fallback.paint(); }
    assert.equal(fallback.completed,1);
    assert.equal(tree.props.children[1].props['aria-busy'],false); fallback.unmount();
  }
});

test('cold mobile playback retries without replacing its animation or leaving pending callbacks', () => {
  const h=loader({presentation:'mobile',landing:welcome,play:()=>new Promise(()=>{})});
  h.render(); h.timer(2200);
  assert.equal(h.completed,1); assert.ok(h.render().media);
  h.timer(800); assert.equal(h.plays,2);
  h.start(); h.paint(); assert.equal(h.render().media.props.style.opacity,1);
  h.unmount(); assert.equal(h.timers.size,0); assert.equal(h.frames.size,0);
});

test('mobile playback recovers after a policy rejection, a gesture and home-screen page restore', async () => {
  let rejected=true;
  const h=loader({presentation:'mobile',timedIntro:true,play:()=>rejected?Promise.reject(Error('autoplay blocked')):Promise.resolve()});
  h.render(); await Promise.resolve(); assert.ok(h.render().media);
  h.setLanding(welcome); h.render(); await Promise.resolve();
  assert.ok(h.render().media); rejected=false;
  h.gesture(); h.start(); h.paint(); assert.equal(h.render().media.props.style.opacity,1);
  h.leave(); assert.equal(h.video.paused,true); assert.equal(h.timers.size,0);
  h.restore(); h.start(); h.paint(); assert.equal(h.render().media.props.style.opacity,1);
  h.emit('pause'); assert.equal(h.render().media.props.style.opacity,0);
  h.timer(800); h.start(); h.paint(); assert.equal(h.render().media.props.style.opacity,1);
  h.unmount(); assert.equal(h.windowListeners.size,0); assert.equal(h.docListeners.size,0);
});

test('mobile retries are bounded while its fallback remains animated', async () => {
  const h=loader({presentation:'mobile',landing:welcome,blocked:true}); h.render(); await Promise.resolve();
  for(let retry=0;retry<2;retry++){h.timer(800);await Promise.resolve();}
  assert.equal(h.plays,3); assert.equal(h.timers.size,0); assert.ok(h.render().media);
  h.hide(); h.foreground(); await Promise.resolve(); assert.equal(h.plays,4);
  h.unmount(); assert.equal(h.timers.size,0);
});

test('mobile welcome can disable its actions until its caller marks them ready', () => {
  const pending={...welcome,ready:false};
  const h=loader({presentation:'mobile',landing:pending});
  const controls=tree=>React.Children.toArray(tree.props.children[1].props.children).flatMap(node=>node.type==='button'?[node]:React.Children.toArray(node.props.children).filter(child=>child.type==='button'));
  let {tree}=h.render();
  assert.equal(tree.props.children[1].props.style,undefined,'do not hide the action row and look like an old splash');
  assert.equal(tree.props.children[1].props['aria-busy'],true);
  assert.equal(controls(tree).length,4); controls(tree).forEach(button=>assert.equal(button.props.disabled,true));
  pending.ready=true; tree=h.render().tree;
  assert.equal(tree.props.children[1].props['aria-busy'],false);
  controls(tree).forEach(button=>assert.equal(button.props.disabled,false));
  h.unmount();
});

test('sign in or resizing to WEB ends the opening landing permanently', () => {
  for(const action of ['signin','resize']) {
    const h=sharedBootstrap({path:'/',search:''});h.auth.isInitializing=false;h.render().props.onComplete();
    const splash=h.render();
    if(action==='signin'){splash.props.landing.onSignIn();h.auth.isAuthenticated=true;h.auth.pendingView=null;}
    else h.setPresentation('web');
    assert.equal(h.render().props.hidden,true);assert.equal(h.render(),null);
    h.auth.isAuthenticated=false;h.setPresentation('mobile');assert.equal(h.render(),null);
  }
});


test('shared visitors can open Settings while the public-view boundary remains intact elsewhere', () => {
  for (const path of ['/settings','/settings/','/appearance','/appearance/']) {
    const h=sharedBootstrap({path,search:'',storedProfileId:'creator'});
    h.auth.isInitializing=false; h.render();
    assert.equal(h.app.type,'app');
    assert.equal(h.storage.get('portalink.sharedViewerProfileId'),'creator');
  }
  const h=sharedBootstrap({path:'/',search:'',storedProfileId:'creator'});
  h.auth.isInitializing=false;h.render();
  assert.equal(h.app.type,'redirect');
  assert.equal(h.app.props.to,'/share/creator');
});
