import {motionFixture} from './helpers/motion-fixture.mjs';
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
  const slots = [], layouts = [], effects = [], timers = new Map();
  let cursor = 0, timerId = 0, now = 0;
  const queueEffect = (queue, effect, deps) => {
    const i = cursor++;
    if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) {
      slots[i]?.cleanup?.(); slots[i] = { deps, effect };
      queue.push(() => { slots[i].cleanup = effect(); });
    }
  };
  return {
    react: { ...React,
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useState(initial) {
        const i = cursor++;
        slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
        return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }];
      },
      useCallback(callback, deps) {
        const i = cursor++;
        if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) slots[i] = { callback, deps };
        return slots[i].callback;
      },
      useMemo(factory, deps) {
        const i = cursor++;
        if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) slots[i] = { value: factory(), deps };
        return slots[i].value;
      },
      useLayoutEffect(effect, deps) { queueEffect(layouts, effect, deps); },
      useEffect(effect, deps) { queueEffect(effects, effect, deps); },
    },
    window: {
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, due: now + delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    timers,
    advance(ms) {
      const end = now + ms;
      let calls = 0;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a,b) => a[1].due-b[1].due)[0];
        if (!next) break;
        assert.ok(calls++ < 100, 'Timers must remain bounded');
        now = next[1].due; timers.delete(next[0]); next[1].fn();
      }
      now = end;
    },
    render(fn) { cursor = 0; return fn(); },
    flush() { layouts.splice(0).forEach(fn => fn()); effects.splice(0).forEach(fn => fn()); },
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
  assert.equal(loops,0); assert.equal(frames,44); assert.ok(duration>=1460&&duration<=1480);
  assert.equal(createHash('sha256').update(asset).digest('hex').slice(0,8),'307bdea0');
  const clip=readFileSync(new URL('../public/portalink-splash-mobile.mp4',import.meta.url));
  assert.equal(createHash('sha256').update(clip).digest('hex').slice(0,8),'9c1a9457');
});
function compile(path, imports, globals) {
  const bootstrap = path.endsWith('/ApplicationBootstrap.tsx');
  if (bootstrap) {
    imports = {
      '../features/install/useMobileInstall': { useMobileInstallCapture() {} },
      '../presentation/mobile/useMobileResumeSession': { useMobileResumeSession: () => ({ resumeTo: null, launchRecord: null }) },
      '../presentation/mobile/MobileResumeContext': { MobileResumeProvider: 'resume-provider' },
      '../presentation/usePresentation': { PresentationContext: { Provider: 'presentation-provider' } },
      '../components/auth/ProfessionalEntry': { ProfessionalEntry: 'professional-entry' }, '../components/auth/CatalogWelcome': { CatalogWelcome: 'catalog-welcome' }, '../components/auth/catalogWelcomeState': { hasEnteredCatalogWelcome: () => true },
      ...imports,
    };
    globals = { Event: class { constructor(type) { this.type = type; } }, document: { getElementById: () => null }, ...globals,
      window: { dispatchEvent() {}, ...globals?.window } };
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, URLSearchParams, ...globals, require(name) {
    if (name.endsWith('/socialRegistration')) return {socialRegistration: () => undefined};
    if (name.endsWith('/EntryChoices')) return {EntryChoices: 'EntryChoices'};
    if (name.endsWith('/EntryAgreements')) return {useEntryAgreements: () => ({request: async () => true})};
    if (name.endsWith('/ConfirmationDialog')) return {ConfirmationDialog: 'ConfirmationDialog'};
 if(name.endsWith('.css'))return {}; if(name.endsWith('/motion/motion'))return motionFixture; assert.ok(name in imports, name); return imports[name]; } });
  if (bootstrap) {
    const original = exports.ApplicationBootstrap;
    exports.ApplicationBootstrap = () => {
      const tree = original();
      return React.cloneElement(tree, { children: tree.props.children.map(child => child?.type === 'resume-provider' ? child.props.children : child) });
    };
  }
  return exports;
}
function loader({ reduced = false, stillOnly = false, blocked = false, throws = false, hidden = false, legacy = false, play, presentation = 'web', landing = undefined, timedIntro = false, welcomeMedia = false, welcomeHandoff = false, bootVideo = undefined, findBootVideo = undefined } = {}) {
  const h = hooks();
  let completed = 0, plays = 0, pauses = 0, exitDuration = 0, renderedPresentation, surfaceHidden = false, renderedMediaRef;
  const listeners = new Map(), docListeners = new Map(), windowListeners = new Map(), frames = new Map(), modalCalls = [], modalDismissals = [], viewportCalls = [], entryViewportCalls = [];
  h.window.addEventListener=(name,fn)=>windowListeners.set(name,fn);
  h.window.removeEventListener=(name,fn)=>{if(windowListeners.get(name)===fn)windowListeners.delete(name);};
  let frameId = 0;
  let bootRemoved = false;
  const boot = { remove() { bootRemoved = true; } };
  const host = {
    children: [],
    appendChild(child) {
      child.parentNode?.removeChild(child);
      this.children.push(child); child.parentNode = this;
      return child;
    },
    removeChild(child) {
      this.children.splice(this.children.indexOf(child), 1); child.parentNode = null;
      return child;
    },
  };
  const document = {
    hidden,
    getElementById(id) {
      if (id === 'portalink-preboot-video') return findBootVideo ? findBootVideo() : bootVideo && video.id === id ? video : null;
      if (id === 'portalink-preboot') return bootRemoved ? null : boot;
      return null;
    },
    addEventListener(name, fn) { docListeners.set(name, fn); },
    removeEventListener(name, fn) { if (docListeners.get(name) === fn) docListeners.delete(name); },
  };
  const video = {
    tagName: 'VIDEO', paused: true, ended: false, readyState: 0, currentTime: 0, duration: 44 / 30,
    dataset: {}, style: {}, parentNode: null,
    buffered: { length: 0, end: () => 44 / 30 },
    setAttribute() {},
    removeAttribute(name) { if (name === 'id') this.id = ''; },
    dispatchEvent(event) { listeners.get(event.type)?.(event); return true; },
    remove() { this.parentNode?.removeChild(this); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    requestVideoFrameCallback: legacy ? undefined : fn => { const id = ++frameId; frames.set(id, fn); return id; },
    cancelVideoFrameCallback(id) { frames.delete(id); },
    play() {
      plays++;
      if (throws) throw Object.assign(Error('playback unavailable'), { name: 'NotSupportedError' });
      if (play) return play(plays);
      return blocked ? Promise.reject(Object.assign(Error('autoplay blocked'), { name: 'NotAllowedError' })) : Promise.resolve();
    },
    pause() { pauses++; this.paused = true; listeners.get('pause')?.(); },
  };
  if (bootVideo) Object.assign(video, { id: 'portalink-preboot-video' }, bootVideo, { dataset: { ...bootVideo.dataset } });
  const { PortalinkSplashLoader } = compile('../src/components/ui/PortalinkSplashLoader.tsx', {
    react: h.react, 'framer-motion': { motion: { div: 'div' }, useReducedMotion: () => reduced },
    '../../presentation/useViewportPresentation': { useViewportPresentation: () => presentation },
    '../../hooks/useModalFocus': { useModalFocus(open, _ref, onDismiss) { modalCalls.push(open); modalDismissals.push(onDismiss); } },
    '../../hooks/useDialogViewport': { useDialogViewport(enabled=true) { const ref=h.react.useRef(null);viewportCalls.push({enabled,ref});return ref; } },
    '../auth/useEntryFieldViewport': { useEntryFieldViewport(ref, enabled) { entryViewportCalls.push({ref,enabled}); } },
    './splashPoster': { SPLASH_POSTER_DATA_URL: 'data:image/webp;base64,inline-poster-fixture' },
  }, { window: h.window, document, Event });
  const onComplete = () => completed++;
  return { ...h,
    render() {
      const tree = h.render(() => PortalinkSplashLoader({ onComplete, stillOnly, landing, timedIntro, welcomeMedia, welcomeHandoff, hidden: surfaceHidden }));
      exitDuration = tree.props.transition.duration;
      renderedPresentation = tree.props['data-presentation'];
      const mediaContainer = tree.props.children[0];
      const [poster, backup, media] = React.isValidElement(mediaContainer) ? mediaContainer.props.children.props.children : [];
      if (renderedMediaRef && renderedMediaRef !== media?.ref) renderedMediaRef.current = null;
      renderedMediaRef = media?.ref;
      if (media) media.ref.current = media.type === 'video' ? video : host;
      h.flush(); return { poster, backup, media, tree };
    },
    decoded() { video.readyState = 2; listeners.get('loadeddata')?.(); },
    buffer() { video.readyState = 4; video.buffered.length = 1; listeners.get('canplaythrough')?.(); },
    start() { video.readyState = 4; video.buffered.length = 1; listeners.get('canplaythrough')?.(); video.paused = false; video.ended = false; listeners.get('playing')?.(); },
    backupLoaded() { const { backup } = this.render(); assert.ok(backup); backup.props.onLoad(); },
    backupFailed() { const { backup } = this.render(); assert.ok(backup); backup.props.onError(); },
    paint() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); },
    emit(name) { if (name === 'ended') video.ended = true; if (name === 'pause') video.paused = true; listeners.get(name)?.(); },
    hide() { document.hidden = true; docListeners.get('visibilitychange')?.(); },
    foreground() { document.hidden = false; docListeners.get('visibilitychange')?.(); },
    setHidden(value) { surfaceHidden = value; },
    setStillOnly(value) { stillOnly = value; },
    setHandoff(value) { welcomeHandoff = value; },
    setLanding(value) { landing = value; },
    timer(delay) { const entry = [...h.timers.entries()].find(([, timer]) => timer.delay === delay); assert.ok(entry, `missing timer ${delay}`); h.timers.delete(entry[0]); entry[1].fn(); },
    listeners, docListeners, windowListeners, frames, modalCalls, modalDismissals, viewportCalls, entryViewportCalls,
    restore() { windowListeners.get('pageshow')?.(); },
    leave() { windowListeners.get('pagehide')?.(); },
    gesture() { docListeners.get('pointerup')?.(); },
    setViewport(nextPresentation) { presentation = nextPresentation; },
    video, host,
    get bootRemoved() { return bootRemoved; },
    get completed() { return completed; }, get plays() { return plays; }, get pauses() { return pauses; },
    get exitDuration() { return exitDuration; },
    get presentation() { return renderedPresentation; },
  };
}

test('both startup layouts have inline artwork immediately and request only the supplied video', () => {
  for (const presentation of ['mobile','web']) {
    const h=loader({presentation,timedIntro:true}),{poster,backup,media}=h.render();
    assert.match(poster.props.src,/^data:image\/webp;base64,/);
    assert.equal(poster.props.decoding,'sync');assert.equal(poster.props.style,undefined);
    assert.equal(backup,false,'The609KB animated backup is not requested beside the cold video');
    assert.equal(media.props.src,'/portalink-splash-mobile.mp4?v=9c1a9457');
    assert.equal(media.props.width,512);assert.equal(media.props.height,720);
    assert.equal(media.props.loop,false);assert.equal(media.props.autoPlay,true);
    assert.equal(media.props.controls,false);assert.equal(media.props.preload,'auto');
    assert.equal(media.props.style.opacity,0);assert.equal(h.plays,1,'Playback starts before decoded or buffered readiness events');
    assert.equal([...h.timers.values()].some(timer=>timer.delay===100 || timer.delay===600),false);
    assert.equal(h.completed,0);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('partial buffering starts immediately and completes only after the painted clip naturally ends',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation});h.render();
    assert.equal(h.video.readyState,0);assert.equal(h.plays,1);
    h.decoded();h.video.buffered.length=1;h.video.buffered.end=()=>.2;
    h.video.paused=false;h.emit('playing');h.paint();
    assert.equal(h.render().media.props.style.opacity,1);assert.equal(h.plays,1);
    assert.equal([...h.timers.values()].some(timer=>timer.delay===100),false);
    h.advance(100);assert.equal(h.completed,0,'A buffer grace timer cannot shorten natural playback');
    h.emit('ended');assert.equal(h.completed,1);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('React adopts the exact already-playing startup element without pausing, rewinding or replaying on BOTH',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,bootVideo:{paused:false,readyState:2,currentTime:.63,dataset:{portalinkPainted:'true'}}});
    const first=h.render();
    assert.equal(first.media.type,'div');assert.equal(first.media.ref.current,h.host);
    assert.equal(h.host.children.length,1);assert.equal(h.host.children[0],h.video);
    assert.equal(h.video.parentNode,h.host);assert.equal(h.bootRemoved,true);
    assert.equal(h.video.currentTime,.63);assert.equal(h.plays,0);assert.equal(h.pauses,0);
    assert.equal(h.video.style.opacity,'1');assert.equal(h.video.loop,false);
    assert.equal(h.completed,0);assert.equal(first.tree.props['data-startup-playing'],'true');
    h.render();h.paint();assert.equal(h.host.children[0],h.video);assert.equal(h.plays,0);
    h.emit('ended');assert.equal(h.completed,1);assert.equal(h.video.currentTime,.63);
    h.unmount();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
  }
});

test('a paused painted startup resumes at its current position and can finish without a second decoder',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,bootVideo:{paused:true,readyState:2,currentTime:.75,dataset:{portalinkPainted:'true'}}});
    h.render();assert.equal(h.plays,1);assert.equal(h.pauses,0);assert.equal(h.video.currentTime,.75);
    assert.equal(h.host.children[0],h.video);assert.equal(h.video.style.opacity,'1');
    h.start();h.paint();assert.equal(h.completed,0);h.emit('ended');assert.equal(h.completed,1);
    h.unmount();assert.equal(h.timers.size,0);
  }
});

test('a later loader cannot reclaim the native video already owned by the active splash',()=>{
  const first=loader({bootVideo:{paused:false,readyState:2,currentTime:.63,dataset:{portalinkPainted:'true'}}});
  first.render();assert.equal(first.video.id,'');assert.equal(first.video.dataset.portalinkAdopted,'true');
  const later=loader({findBootVideo:()=>first.video.id==='portalink-preboot-video'?first.video:null});
  assert.equal(later.render().media.type,'video');assert.equal(later.host.children.length,0);
  assert.equal(first.video.parentNode,first.host);assert.equal(first.video.currentTime,.63);
  assert.equal(first.plays,0);assert.equal(first.pauses,0);assert.equal(later.plays,1);
  first.unmount();later.unmount();
  const marked=loader({bootVideo:{dataset:{portalinkAdopted:'true'}}});
  assert.equal(marked.render().media.type,'video','The ownership marker also protects a retained or restored startup id');
  assert.equal(marked.host.children.length,0);marked.unmount();
});

test('a fully painted startup that ended before React completes once and never replays',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,bootVideo:{paused:true,ended:true,readyState:4,currentTime:44/30,dataset:{portalinkPainted:'true'}}});
    h.render();assert.equal(h.completed,1);assert.equal(h.plays,0);assert.equal(h.video.currentTime,44/30);
    assert.equal(h.host.children[0],h.video);assert.equal(h.video.style.opacity,'1');assert.equal(h.timers.size,0);
    h.render();h.emit('ended');h.restore();assert.equal(h.completed,1);assert.equal(h.plays,0);
    h.unmount();assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
  }
});

test('an ended native video without a painted frame cannot count as a seen complete intro',()=>{
  const h=loader({bootVideo:{paused:true,ended:true,readyState:2,currentTime:44/30}});
  h.render();assert.equal(h.completed,0);assert.equal(h.plays,1);assert.equal(h.video.currentTime,0);
  assert.equal(h.video.style.opacity,'0');assert.equal(h.render().tree.props['data-startup-playing'],'true');
  h.start();h.paint();assert.equal(h.completed,0);h.emit('ended');assert.equal(h.completed,1);h.unmount();
});

test('background adoption pauses the same startup element and resumes it without losing its position',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,hidden:true,bootVideo:{paused:false,readyState:2,currentTime:.5,dataset:{portalinkPainted:'true'}}});
    h.render();assert.equal(h.video.parentNode,h.host);assert.equal(h.video.paused,true);
    assert.equal(h.video.currentTime,.5);assert.equal(h.plays,0);assert.equal(h.completed,0);assert.equal(h.timers.size,0);
    h.advance(20000);h.foreground();assert.equal(h.plays,1);assert.equal(h.video.currentTime,.5);
    h.start();h.paint();h.emit('ended');assert.equal(h.completed,1);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('a blocked adopted video keeps artwork visible and gives the loaded backup one complete cycle',async()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,blocked:true,bootVideo:{paused:true,readyState:0}});
    h.render();await Promise.resolve();const pending=h.render();
    assert.equal(h.host.children[0],h.video);assert.equal(h.video.style.opacity,'0');
    assert.equal(pending.media.props.style.background,'transparent','The adoption host cannot cover the backup underneath');
    assert.match(pending.poster.props.src,/^data:/);assert.ok(pending.backup);
    assert.equal(pending.backup.props.style.opacity,0);assert.equal(h.completed,0);
    h.backupLoaded();assert.equal(h.render().backup.props.style.opacity,1);
    h.advance(1499);assert.equal(h.completed,0);h.advance(1);assert.equal(h.completed,1);
    h.unmount();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
  }
});

test('guest readiness during an adopted intro preserves the startup scene until natural end, then opens welcome',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,bootVideo:{paused:false,readyState:2,currentTime:.4,dataset:{portalinkPainted:'true'}}});
    const first=h.render();h.setLanding(welcome);const pending=h.render();
    assert.equal(pending.tree.props.role,'status');assert.equal(pending.tree.props['data-share-landing'],undefined);
    assert.equal(pending.tree.props.children[1],undefined,'Welcome actions cannot resize the playing intro');
    assert.equal(pending.tree.props['data-startup-playing'],'true');assert.equal(h.video.loop,false);
    assert.equal(pending.media.ref.current,first.media.ref.current);assert.equal(h.video.currentTime,.4);
    assert.equal(h.plays,0);assert.equal(h.pauses,0);assert.equal(h.modalCalls.some(Boolean),false);
    h.paint();h.emit('ended');assert.equal(h.completed,1);const ready=h.render();
    assert.equal(ready.tree.props.role,'dialog');assert.equal(ready.tree.props['data-share-landing'],'true');
    assert.equal(ready.tree.props['data-startup-playing'],undefined);assert.ok(ready.tree.props.children[1]);
    assert.equal(h.video.loop,true);assert.equal(h.plays,1,'Welcome looping begins only after the real intro end');
    assert.equal(h.host.children[0],h.video);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('a late first painted frame shows the complete clip on BOTH and natural ended owns completion',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,timedIntro:true});h.render();
    assert.equal([...h.timers.values()].some(timer=>timer.delay===1500 || timer.delay===600),false);
    h.start();assert.equal(h.render().media.props.style.opacity,0);
    h.paint();assert.equal(h.render().media.props.style.opacity,1);assert.equal(h.completed,0);
    assert.equal(h.render().backup,false);assert.match(h.render().poster.props.src,/^data:/);
    h.emit('ended');h.emit('ended');assert.equal(h.completed,1);
    assert.equal(h.render().media.props.style.opacity,1,'The final painted frame remains during handoff');
    assert.equal(h.timers.size,0);h.unmount();
  }
});

test('decoded playback progress can reveal the first frame when a video frame callback never arrives',()=>{
  for(const presentation of ['mobile','web']) for(const bootVideo of [undefined,{}]) {
    const h=loader({presentation,bootVideo});h.render();h.start();
    assert.equal(h.frames.size,1);assert.equal(h.completed,0);
    h.video.currentTime=.05;h.emit('timeupdate');const view=h.render();
    assert.equal(bootVideo?h.video.style.opacity:view.media.props.style.opacity,bootVideo?'1':1);
    assert.equal(h.frames.size,0,'Real decoded playback cancels the unavailable frame callback');
    assert.equal(view.backup,false);assert.equal(h.completed,0);
    h.emit('ended');assert.equal(h.completed,1);assert.equal(h.timers.size,0);h.unmount();
  }
});

test('zero-time, paused, hidden, unready or failed video cannot reveal through a progress event',()=>{
  for(const presentation of ['mobile','web']) for(const condition of ['zero-time','paused','hidden','unready','error']) {
    const h=loader({presentation});h.render();h.start();
    h.video.currentTime=condition==='zero-time'?0:.05;
    if(condition==='paused')h.video.paused=true;
    if(condition==='hidden'){h.hide();h.video.paused=false;}
    if(condition==='unready')h.video.readyState=0;
    if(condition==='error')h.video.error={code:3};
    h.emit('timeupdate');h.emit('timeupdate');
    const view=h.render();assert.equal(view.media.props.style.opacity,0,condition);
    assert.equal(h.completed,0,condition);assert.equal(view.backup,false,condition);
    h.unmount();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
  }
});

test('a delayed native ended event cannot turn an already-finished painted intro into a stall or replay',()=>{
  for(const presentation of ['mobile','web']) for(const bootVideo of [undefined,{}]) {
    const h=loader({presentation,bootVideo});h.render();h.start();h.paint();
    h.video.currentTime=h.video.duration;h.video.paused=true;h.video.ended=true;
    const plays=h.plays;assert.equal(h.completed,0);
    h.timer(2200);const view=h.render();
    assert.equal(h.completed,1);assert.equal(view.backup,false,'A real native end cannot request a backup animation');
    assert.equal(h.video.currentTime,h.video.duration);assert.equal(h.plays,plays);
    assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
    h.emit('ended');h.emit('ended');h.restore();h.gesture();
    assert.equal(h.completed,1);assert.equal(h.plays,plays);assert.equal(h.timers.size,0);
    h.unmount();
  }
});

test('brief waiting and stalled events retain the painted frame without requesting backup or completing',()=>{
  for(const presentation of ['mobile','web']) for(const event of ['waiting','stalled']) {
    const h=loader({presentation});h.render();h.start();h.paint();h.video.readyState=2;
    h.emit(event);
    const view=h.render();assert.equal(view.media.props.style.opacity,1);assert.equal(view.backup,false);
    assert.equal(h.completed,0);h.start();h.paint();h.emit('ended');assert.equal(h.completed,1);
    h.unmount();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
  }
});

test('a preplay watchdog is recoverable and late healthy playback replaces a pending backup',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,play:()=>new Promise(()=>{})});h.render();h.timer(2200);
    assert.ok(h.render().media);assert.equal(h.render().backup.props.style.opacity,0);assert.equal(h.completed,0);
    h.start();h.paint();
    assert.equal(h.render().media.props.style.opacity,1);assert.equal(h.completed,0);
    assert.equal([...h.timers.values()].some(timer=>timer.delay===1500),false);
    h.emit('ended');assert.equal(h.completed,1);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('a five-second cold primary load cannot be skipped by the shorter pending-backup timeout on BOTH',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,play:()=>new Promise(()=>{})});h.render();
    h.advance(2200);h.backupLoaded();
    assert.equal(h.render().backup.props.style.opacity,0,'A cached backup cannot take over a cold healthy primary');
    h.advance(2800);
    assert.equal(h.completed,0,'Static artwork cannot replace the full splash during a legitimate cold media load');
    assert.equal(h.render().backup.props.style.opacity,0);assert.ok(h.render().media);
    h.start();h.paint();assert.equal(h.render().media.props.style.opacity,1);assert.equal(h.completed,0);
    h.advance(1467);assert.equal(h.completed,0,'Healthy playback completes at ended, not an old load timer');
    h.emit('ended');assert.equal(h.completed,1);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('pending primary and backup downloads remain bounded by one initial loading window that retries cannot extend',()=>{
  const h=loader({play:()=>new Promise(()=>{})});h.render();h.advance(9999);
  assert.equal(h.completed,0);h.advance(1);assert.equal(h.completed,1);
  h.unmount();assert.equal(h.timers.size,0);
});

test('primary loading pauses in background and a loaded backup still receives a full cycle across the loading deadline',()=>{
  const hidden=loader({play:()=>new Promise(()=>{})});hidden.render();hidden.hide();hidden.advance(20000);
  assert.equal(hidden.completed,0);assert.equal(hidden.timers.size,0);hidden.foreground();hidden.advance(5000);
  assert.equal(hidden.completed,0);hidden.start();hidden.paint();hidden.emit('ended');assert.equal(hidden.completed,1);hidden.unmount();
  const backup=loader({play:()=>new Promise(()=>{})});backup.render();backup.advance(2200);backup.backupLoaded();
  backup.advance(7800);assert.equal(backup.completed,0,'The deadline gives a cached fallback its complete visible cycle');
  assert.equal(backup.render().backup.props.style.opacity,1);
  backup.advance(1499);assert.equal(backup.completed,0);backup.advance(1);assert.equal(backup.completed,1);
  backup.unmount();assert.equal(backup.timers.size,0);
});

test('newly decoded data recovers after all automatic retries without spinning on identical readiness events',async()=>{
  const h=loader({play:n=>n<5?Promise.reject(Error('blocked')):Promise.resolve()});
  h.render();await Promise.resolve();
  for(let retry=0;retry<2;retry++){h.timer(800);await Promise.resolve();}
  assert.equal(h.plays,3);
  h.buffer();await Promise.resolve();assert.equal(h.plays,4);
  // This failed attempt had the same decoded/buffered state. Repeating the
  // cached event cannot silently create unlimited autoplay attempts.
  h.buffer();await Promise.resolve();assert.equal(h.plays,4);
  h.video.currentTime=.01;h.buffer();assert.equal(h.plays,5);
  h.start();h.paint();h.emit('ended');assert.equal(h.completed,1);
  h.unmount();assert.equal(h.timers.size,0);
});

test('unchanged timeupdate events cannot postpone a stalled startup forever',()=>{
  const h=loader();h.render();h.start();h.paint();h.video.currentTime=.5;h.emit('timeupdate');
  const timer=[...h.timers.entries()].find(([,timer])=>timer.delay===2200)[0];
  h.emit('timeupdate');h.emit('timeupdate');assert.ok(h.timers.has(timer));
  h.timer(2200);assert.ok(h.render().backup);h.unmount();assert.equal(h.timers.size,0);
});

test('repeated waiting or stalled events without media progress retain one bounded deadline',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation});h.render();h.start();h.paint();h.video.readyState=2;
    const timer=[...h.timers.entries()].find(([,timer])=>timer.delay===2200)[0];
    for(let event=0;event<6;event++){h.emit('waiting');h.emit('stalled');}
    assert.ok(h.timers.has(timer),'Only actual playback progress can refresh the deadline');
    h.timer(2200);assert.ok(h.render().backup);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('an actual gesture attempts playback within user activation even if preload has not advanced',()=>{
  const h=loader();h.render();assert.equal(h.plays,1);h.gesture();assert.equal(h.plays,2);
  h.unmount();assert.equal(h.timers.size,0);
});

test('blocked or unavailable playback keeps inline artwork while backup downloads, then shows one full cycle',async()=>{
  for(const presentation of ['mobile','web']) for(const options of [{blocked:true},{throws:true}]) {
    const h=loader({presentation,...options});h.render();h.start();await Promise.resolve();
    let view=h.render();assert.ok(view.media);assert.ok(view.backup);
    assert.match(view.poster.props.src,/^data:/);assert.equal(view.backup.props.style.opacity,0);
    assert.equal([...h.timers.values()].some(timer=>timer.delay===1500),false);
    h.backupLoaded();view=h.render();assert.equal(view.backup.props.style.opacity,1);assert.equal(view.media.props.style.opacity,0);
    assert.equal(h.completed,0);h.timer(1500);assert.equal(h.completed,1);
    h.unmount();assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);assert.equal(h.windowListeners.size,0);
  }
});

test('a foreground policy retry cannot restart the loaded backup animation completion cycle',async()=>{
  const h=loader({blocked:true});h.render();h.start();await Promise.resolve();h.backupLoaded();
  h.advance(800);await Promise.resolve();assert.equal(h.completed,0);
  h.advance(699);assert.equal(h.completed,0);h.advance(1);assert.equal(h.completed,1);
  assert.equal(h.render().backup.props.style.opacity,1);h.unmount();assert.equal(h.timers.size,0);
});

test('ordinary startup fallback completion cancels retries and stays terminal while Home is still waiting',async()=>{
  for(const presentation of ['mobile','web']) for(const bootVideo of [undefined,{}]) {
    const h=loader({presentation,bootVideo,blocked:true});h.render();await Promise.resolve();h.backupLoaded();
    h.advance(800);await Promise.resolve();assert.equal(h.plays,2);assert.equal(h.completed,0);
    const queuedRetry=[...h.timers.values()].find(timer=>timer.delay===800);assert.ok(queuedRetry);
    h.advance(699);assert.equal(h.completed,0);h.advance(1);
    assert.equal(h.completed,1);assert.equal(h.render().backup.props.style.opacity,1);assert.equal(h.timers.size,0);
    h.advance(100);queuedRetry.fn();await Promise.resolve();h.gesture();h.restore();h.buffer();h.paint();
    assert.equal(h.completed,1);assert.equal(h.plays,2,'A completed startup cannot restart media while the next screen waits');
    assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);h.unmount();
  }
});

test('a guest welcome fallback can still recover to its looping video after the complete backup cycle',async()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,landing:welcome,play:n=>n<=2
      ?Promise.reject(Object.assign(Error('autoplay blocked'),{name:'NotAllowedError'})):Promise.resolve()});
    h.render();await Promise.resolve();h.backupLoaded();h.advance(800);await Promise.resolve();
    h.advance(700);assert.equal(h.completed,1);assert.equal(h.render().backup.props.style.opacity,1);
    h.gesture();assert.equal(h.plays,3);h.start();h.paint();const recovered=h.render();
    assert.equal(recovered.media.props.loop,true);assert.equal(recovered.media.props.style.opacity,1);
    assert.equal(recovered.backup.props.style.opacity,0);assert.equal(h.completed,1);assert.equal(h.timers.size,0);
    h.hide();h.foreground();h.start();h.paint();assert.equal(h.render().media.props.loop,true);
    assert.equal(h.completed,1);assert.equal(h.timers.size,0);h.unmount();
  }
});

test('failed or stalled backup downloads release truthfully on inline artwork without deadlock',async()=>{
  for(const failBackup of [true,false]) {
    const h=loader({blocked:true});h.render();h.start();await Promise.resolve();
    if(failBackup)h.backupFailed();else h.timer(2200);
    assert.equal(h.completed,1);assert.match(h.render().poster.props.src,/^data:/);
    assert.equal(h.render().backup.props.style.opacity,0);
    h.unmount();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
  }
});

test('a prolonged decoded-video stall adopts only a loaded backup, and missing ended stays bounded',()=>{
  const h=loader();h.render();h.start();h.paint();h.emit('waiting');h.timer(2200);
  assert.equal(h.render().media.props.style.opacity,1,'Pending backup never erases a real frame');
  h.backupLoaded();assert.equal(h.render().backup.props.style.opacity,1);
  h.timer(1500);assert.equal(h.completed,1);h.unmount();
  const missingEnd=loader();missingEnd.render();missingEnd.start();missingEnd.paint();missingEnd.timer(2200);
  missingEnd.timer(2200);assert.equal(missingEnd.completed,1);missingEnd.unmount();assert.equal(missingEnd.timers.size,0);
});

test('backgrounding pauses startup and backup completion; foreground resumes the same video or a whole backup cycle',async()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation});h.render();h.start();h.paint();h.video.currentTime=.75;
    h.hide();assert.equal(h.video.paused,true);assert.equal(h.timers.size,0);assert.equal(h.completed,0);
    h.foreground();h.start();h.paint();assert.equal(h.video.currentTime,.75);
    h.emit('ended');assert.equal(h.completed,1);h.unmount();
  }
  const backup=loader({blocked:true});backup.render();backup.start();await Promise.resolve();backup.backupLoaded();
  backup.hide();assert.equal(backup.timers.size,0);assert.equal(backup.completed,0);
  backup.foreground();await Promise.resolve();backup.timer(1500);assert.equal(backup.completed,1);
  backup.unmount();assert.equal(backup.timers.size,0);
});

test('explicit stillOnly never restarts media on either layout; WEB reduced motion remains still',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,stillOnly:true}),view=h.render();
    assert.equal(view.media,false);assert.equal(view.backup,false);assert.match(view.poster.props.src,/^data:/);
    assert.equal(h.plays,0);assert.equal(h.completed,1);assert.equal(h.timers.size,0);h.unmount();
  }
  const web=loader({reduced:true});assert.equal(web.render().media,false);assert.equal(web.completed,1);web.unmount();
  const mobile=loader({presentation:'mobile',reduced:true});assert.ok(mobile.render().media);mobile.start();mobile.paint();mobile.emit('ended');
  assert.equal(mobile.completed,1);assert.equal(mobile.exitDuration,0);mobile.unmount();
});

test('queued promises and frame callbacks from StrictMode, hidden surfaces and unmount cannot corrupt the current attempt',async()=>{
  let rejectOld;
  const h=loader({play:n=>n===1?new Promise((_,reject)=>{rejectOld=reject;}):Promise.resolve()});
  h.render();h.buffer();h.restartEffects();assert.equal(h.plays,2);
  rejectOld(Error('old aborted attempt'));await Promise.resolve();assert.equal(h.completed,0);assert.equal(h.render().backup,false);
  h.start();const stale=[...h.frames.values()][0];h.setHidden(true);h.render();stale();
  assert.equal(h.completed,0);assert.equal(h.timers.size,0);assert.equal(h.video.paused,true);
  h.setHidden(false);h.render();h.start();h.paint();assert.equal(h.render().media.props.style.opacity,1);
  h.unmount();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);assert.equal(h.docListeners.size,0);
});

test('legacy browsers reveal only decoded playing frames and rotation cannot remount the selected clip',()=>{
  const legacy=loader({legacy:true});legacy.render();legacy.decoded();
  assert.equal(legacy.render().media.props.style.opacity,0);legacy.start();assert.equal(legacy.render().media.props.style.opacity,1);
  legacy.emit('ended');assert.equal(legacy.completed,1);legacy.unmount();
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation}),{media}=h.render();const timer=[...h.timers.values()][0];
    h.setViewport(presentation==='mobile'?'web':'mobile');const next=h.render().media;
    assert.equal(h.presentation,presentation);assert.equal(next.key,media.key);assert.equal(next.props.src,media.props.src);
    assert.equal([...h.timers.values()][0],timer);h.unmount();
  }
});

test('embedded Hello World stays looping on BOTH with immediate inline art and no cold animatedbackup request',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,welcomeMedia:true}),view=h.render();
    assert.equal(view.tree.props.className,'portalink-welcome-media');assert.equal(view.tree.props.role,'img');
    assert.equal(view.tree.props['data-portalink-splash'],undefined);assert.equal(view.tree.props['aria-label'],'Hello World — Portalink');
    assert.equal(view.media.props.loop,true);assert.equal(view.backup,false);assert.equal(h.modalCalls.some(Boolean),false);
    h.start();h.paint();assert.equal(h.completed,1);assert.equal(h.timers.size,0);
    h.emit('waiting');assert.equal(h.render().media.props.style.opacity,1);h.start();h.paint();assert.equal(h.timers.size,0);
    h.unmount();assert.equal(h.listeners.size,0);
  }
});

test('a completed intro stillOnly prop cannot freeze active guest or embedded welcome loops',()=>{
  for(const presentation of ['mobile','web']) for(const props of [{landing:welcome},{welcomeMedia:true}]) {
    const h=loader({presentation,...props});h.render();h.start();h.paint();h.setStillOnly(true);
    const view=h.render();assert.ok(view.media);assert.equal(view.media.props.loop,true);
    assert.equal(view.media.props.style.opacity,1);h.emit('waiting');h.start();h.paint();
    assert.equal(h.render().media.props.style.opacity,1);h.unmount();assert.equal(h.timers.size,0);
  }
});

test('authenticated handoff preserves the remembered looping scene while Home waits and welcome fades',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,landing:welcome});const first=h.render();h.start();h.paint();
    h.setLanding(undefined);h.setHandoff(true);h.setStillOnly(true);const handoff=h.render();
    assert.equal(handoff.media.key,first.media.key);assert.equal(handoff.media.props.loop,true);
    assert.equal(handoff.media.props.style.opacity,1);assert.equal(handoff.tree.props['data-share-landing'],'true');
    assert.equal(h.plays,1,'The handoff does not pause or restart the welcome');
    assert.equal(h.timers.size,0);h.unmount();
  }
});

test('preboot matches the supplied clip ratio and canvas on MOBILE and WEB', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const { MOBILE_PRESENTATION_QUERY } = compile('../src/presentation/useViewportPresentation.ts', { react: React });
  const preboot = html.match(/<div id="portalink-preboot"[\s\S]*?<\/div>/)?.[0];
  assert.ok(preboot);
  const inline = preboot.match(/<img src="(data:image\/webp;base64,[^"]+)"/)?.[1];
  const { SPLASH_POSTER_DATA_URL } = sourceModule('src/components/ui/splashPoster.ts');
  assert.equal(inline, SPLASH_POSTER_DATA_URL);
  const bytes = Buffer.from(inline.split(',')[1], 'base64');
  assert.deepEqual(bytes, readFileSync(new URL('../public/portalink-splash-first-frame.webp', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0,8),'e2c3390a');
  assert.match(preboot, /data-portalink-inline-splash/);
  assert.doesNotMatch(preboot, /<source|\/portalink-welcome-loop|\/portalink-splash-poster/);
  assert.doesNotMatch(preboot, /portalink-splash-mobile-poster/);
  assert.doesNotMatch(preboot, /mobile-startup-status/);
  assert.match(preboot, /<img src="data:image\/webp;base64,[^"]+"[^>]*width="512" height="720"[^>]*decoding="sync"/);
  assert.ok(html.includes(`@media ${MOBILE_PRESENTATION_QUERY}`));
  assert.doesNotMatch(html, /(?:^|\n)\s*#portalink-preboot picture\s*\{\s*display:\s*none;/,
    'normal startup retains its picture; shared entry may hide it with a scoped rule');
  assert.match(html, /#portalink-preboot\s*\{[^}]*background-color:\s*#fdffff/);
  assert.match(html, /#portalink-preboot\s*\{[^}]*--portalink-media-ratio:\s*0\.7111111111/);
  assert.match(preboot, /<video id="portalink-preboot-video"[^>]*src="\/portalink-splash-mobile\.mp4\?v=9c1a9457"/);
  assert.match(preboot, /<video[^>]*autoplay muted playsinline[^>]*preload="auto"/);
});

test('ready content enters after restoration without requiring an intro; navigation and auth retries remain bounded', () => {
  for (const first of ['auth', 'media']) {
  // Screen warming overlaps session restoration. Restored accounts can enter
  // directly; the immediate guest choices are covered separately below.
  const h = hooks(), auth = { isInitializing: true, isAuthenticated: true }, location = { pathname: '/' };
  const storage = new Map(), warmed = [];
  const { ApplicationBootstrap } = compile('../src/app/ApplicationBootstrap.tsx', {
    react: h.react, 'framer-motion': { AnimatePresence: 'presence' },
    'react-router-dom': { Navigate: 'redirect', matchPath: () => null, useLocation: () => location },
    '../App': { App: 'app' }, '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' },
    '../components/ui/StateViews': { LoadingState: 'loading' },
    '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes: { controlCenter: {path:'/settings'}, sharedCollaboration: {}, sharedProject: {}, sharedProfileCategory: {}, sharedProfile: {} }, buildPath: (_, p) => `/share/${p.profileId}` },
    './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exited' },
    './screenModules': { warmScreenForPath: path => { warmed.push(path); return Promise.resolve([]); } },
    './homeStartup': { HOME_STARTUP_TIMEOUT_MS: 12000 },
    '../features/sharing/shareModel': shareModel,
    '../presentation/useViewportPresentation': { useViewportPresentation: () => 'web' },
    '../features/auth/registration': { readSharedReturnPath: () => undefined },
  }, { window: { ...h.window, sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } } });
  const render = () => { const tree = h.render(ApplicationBootstrap); h.flush(); const app = tree.props.children[0]; if (app?.type === 'app') { app.props.onHomeStartupReady(true); app.props.onHomeStartupShellReady(true); } return tree.props.children; };
  let [app, presence] = render();
  assert.equal(app, null); assert.equal(presence.props.children.props.stillOnly, false);
  assert.deepEqual(warmed, ['/'], 'requested screen code starts while authentication is still initializing');
  if (first === 'media') {
    presence.props.children.props.onComplete(); [app, presence] = render();
    assert.equal(app, null, 'completed intro cannot bypass session restoration');
    assert.equal(presence.props.children.type, 'splash');
  }
  auth.isInitializing = false;
  [app, presence] = render();
  assert.equal(app.type, 'app', 'data starts loading before the intro completes');
  assert.equal(presence.props.children, null);
  if (first === 'auth') {
    [app, presence] = render();
    assert.equal(app.type, 'app');
    assert.equal(presence.props.children, null, 'a restored account does not wait for decorative playback');
  }
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

function sharedBootstrap({ presentation = 'mobile', path = '/share/a/c/b/c', search = '?page=2', hash = '', recovery = false, authenticated = false, storedProfileId, homeReady = true } = {}) {
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
    '../components/ui/StateViews':{LoadingState:'loading',ErrorState:'home-error'},
    '../contexts/AuthContext':{useAuth:()=>auth},
    './routes':{routes:{controlCenter:{path:'/settings'},sharedCollaboration:{path:'/share/:profileId/collaboration'},sharedProject:{path:'/share/:profileId/c/:categoryId/:projectId'},sharedProfileCategory:{path:'/share/:profileId/c/:categoryId'},sharedProfile:{path:'/share/:profileId'}},buildPath:(_,p)=>`/share/${p.profileId}`},
    './splashLifecycle':{PORTALINK_SPLASH_EXIT_EVENT:'splash-exited'},
    './screenModules':{warmScreenForPath:()=>Promise.resolve([])},
    './homeStartup':{HOME_STARTUP_TIMEOUT_MS:12000},
    '../features/sharing/shareModel': shareModel,
    '../presentation/useViewportPresentation':{useViewportPresentation:()=>presentation},
    '../features/auth/registration':{readSharedReturnPath:path=>path.startsWith('/share/')?path:undefined},
    }, {window:{...h.window,location:{replace:path=>redirects.push(path)},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}}});
  return {auth,requested,redirects,location,storage,authenticate(){auth.isAuthenticated=true;auth.pendingView=null;auth.phase='authenticated';auth.user={id:'account'};auth.session={user:auth.user};},get app(){return rendered.props.children[0];},get waiting(){return rendered.props.children[2];},get homeError(){return rendered.props.children[3];},get homeTimerCount(){return [...h.timers.values()].filter(timer=>timer.delay===12000).length;},timer(){const entry=[...h.timers.values()].find(timer=>timer.delay===12000);assert.ok(entry);entry.fn();},setPresentation(value){presentation=value;},render(){rendered=h.render(ApplicationBootstrap);h.flush();const app=rendered.props.children[0];if(homeReady&&app?.type==='app'){app.props.onHomeStartupReady(true);app.props.onHomeStartupShellReady(true);}return rendered.props.children[1].props.children;}};
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

test('account-only landing exposes professional entry immediately and wires account actions to the existing flow', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = sharedBootstrap({ path: '/', search: '?welcome=1', presentation });
    h.render(); h.auth.isInitializing = false;
    const landing = h.render().props.landing;
    assert.equal(landing.hideMedia, true);
    assert.equal(landing.content.type, 'presentation-provider');
    assert.equal(landing.content.props.value, presentation, 'The pre-shell entry receives the existing presentation choice');
    assert.equal(landing.content.props.children.type, 'professional-entry');
    assert.equal(landing.content.props.children.props.ready, true);
    assert.equal(landing.content.props.children.props.onGuest, undefined);
    assert.equal(landing.onContinue, undefined); assert.equal(landing.continueLabel, undefined); assert.equal(landing.onDismiss, undefined);
    landing.content.props.children.props.onCreate(); assert.deepEqual(h.requested.at(-1), { view: 'signUp' });
    assert.equal(h.render().props.hidden, true);
    h.auth.pendingView = null;
    h.render().props.landing.content.props.children.props.onSignIn(); assert.deepEqual(h.requested.at(-1), { view: 'signIn' });
    h.auth.pendingView = null;
    assert.equal(h.render().props.hidden, false, 'Cancel returns to the account-only entry');
    h.authenticate(); h.render(); h.render(); assert.equal(h.render(), null);
  }
});

test('invites open root welcome without a previous shared-profile redirect or account destination', () => {
  const h=sharedBootstrap({path:'/',search:'?welcome=1',storedProfileId:'previous-creator'});
  h.render(); h.auth.isInitializing=false;
  let splash=h.render(); assert.equal(h.app.type,'app');
  assert.equal(h.storage.has('portalink.sharedViewerProfileId'),false);
  assert.equal(splash.props.landing.continueLabel,undefined); assert.equal(splash.props.landing.onContinue,undefined); assert.equal(splash.props.landing.onDismiss,undefined);
  for (const [action,view] of [['onCreateAccount','signUp'],['onSignIn','signIn'],['onForgotPassword','forgotPassword']]) {
    splash.props.landing[action](); assert.deepEqual(h.requested.at(-1),{view});
    assert.equal(h.render().props.hidden,true);
    h.auth.pendingView=null; splash=h.render(); assert.equal(splash.props.hidden,false);
  }
  h.authenticate(); h.render(); h.render(); assert.equal(h.render(),null);
  assert.equal(h.render(),null,'the welcome marker cannot reopen entry after successful authentication');
  const desktop=sharedBootstrap({path:'/',search:'?welcome=1',presentation:'web'}); desktop.auth.isInitializing=false;
  assert.equal(desktop.render().props.landing.ready,true);
  const reopened=sharedBootstrap({path:'/',search:'?welcome=1'}); reopened.auth.isInitializing=false;
  assert.equal(reopened.render().props.landing.ready,true,'opening a new invitation shows welcome again');
});

test('MOBILE visitor readiness hands off once to account entry, retaining it through cancellation until authentication', () => {
  for(const entry of [{search:''},{search:'?welcome=1'},{search:'?entry=oauth',hash:'#error=access_denied'}]) {
    const h=sharedBootstrap({path:'/',homeReady:false,...entry});
    const initial=h.render();assert.equal(initial.type,'splash');assert.equal(initial.key,'portalink-splash');
    assert.equal(initial.props.landing,undefined);assert.equal(h.app,null);
    initial.props.onComplete();
    for(let render=0;render<2;render++) {
      const pending=h.render();assert.equal(pending.type,initial.type);assert.equal(pending.key,initial.key);
      assert.equal(pending.props.onComplete,initial.props.onComplete);assert.equal(pending.props.landing,undefined);
      assert.equal(h.waiting,false,'pending welcome must not flash neutral loading or remount its completed video');
      assert.equal(h.app,null);assert.equal(h.homeTimerCount,0);
    }
    h.auth.isInitializing=false;
    const welcome=h.render();assert.equal(welcome.type,initial.type);assert.equal(welcome.key,'portalink-account-entry');
    assert.equal(welcome.props.landing.ready,true);assert.equal(h.app.type,'app');assert.equal(h.waiting,false);
    welcome.props.landing.onSignIn();
    assert.deepEqual(h.requested.at(-1),{view:'signIn'});
    const account=h.render();assert.equal(account.key,welcome.key);assert.equal(account.props.hidden,true);
    h.auth.pendingView=null;
    const returned=h.render();assert.equal(returned.key,welcome.key);assert.equal(returned.props.hidden,false);
    assert.equal(returned.props.landing.onDismiss,undefined); assert.equal(returned.props.landing.onContinue,undefined);
    h.authenticate();h.render();assert.equal(h.render(),null);assert.equal(h.app.type,'app');
    assert.equal(h.homeError,false);assert.equal(h.homeTimerCount,0);
  }
});

test('invitation marker does not override signed-in, recovery or authentication callback flows', () => {
  for (const options of [{authenticated:true},{recovery:true},{search:'?welcome=1&code=private'},{hash:'#type=recovery'}]) {
    const h=sharedBootstrap({path:'/',search:'?welcome=1',storedProfileId:'previous-creator',...options});
    h.render(); h.auth.isInitializing=false;
    assert.equal(h.render().props.landing,undefined);
    if (options.recovery || options.hash || options.search) assert.equal(h.storage.get('portalink.sharedViewerProfileId'),'previous-creator');
  }
  const ordinary=sharedBootstrap({path:'/',search:'',storedProfileId:'previous-creator'}); ordinary.auth.isInitializing=false;
  assert.equal(ordinary.render().props.landing,undefined,'retained public context cannot open the ordinary welcome');
  assert.equal(ordinary.app.type,'redirect','ordinary guest navigation keeps its existing shared-profile boundary');
  assert.equal(ordinary.app.props.to,'/share/previous-creator');
  assert.equal(ordinary.storage.get('portalink.sharedViewerProfileId'),'previous-creator');
  assert.equal(ordinary.requested.length,0);
});

test('restored MOBILE and WEB sessions bypass the intro and retain ready-screen handoff', () => {
 for (const presentation of ['mobile','web']) {
  const h=sharedBootstrap({path:'/',search:'',presentation}); let splash=h.render();
  assert.equal(splash.props.landing,undefined); assert.equal(splash.props.hidden,false);
  assert.equal(splash.props.timedIntro,presentation==='mobile'); assert.equal(h.app,null);
  h.auth.isInitializing=false; h.auth.isAuthenticated=true;
  splash=h.render(); splash=h.render();
  assert.equal(h.app.type,'app');
  assert.equal(splash,null); h.render(); assert.equal(h.render(),null); assert.equal(h.app.props.homeStartupPending,false);
  assert.equal(h.app.type,'app'); assert.equal(h.waiting,false);
  h.render(); h.location.pathname='/messages'; assert.equal(h.render(),null);
 }
});

test('late MOBILE session restoration keeps the completed intro host then enters signed-in Home without welcome or replay', () => {
  const h=sharedBootstrap({path:'/',search:'',homeReady:false});
  const initial=h.render();initial.props.onComplete();
  const pending=h.render();assert.equal(pending.type,initial.type);assert.equal(pending.key,initial.key);
  assert.equal(pending.props.onComplete,initial.props.onComplete);assert.equal(pending.props.landing,undefined);
  assert.equal(h.app,null);assert.equal(h.waiting,false);assert.equal(h.homeTimerCount,0);
  h.auth.isInitializing=false;h.auth.isAuthenticated=true;
  const restored=h.render();assert.equal(restored?.props.landing,undefined);
  assert.equal(h.app.type,'app');assert.equal(h.app.props.homeStartupPending,false);
  assert.equal(h.render(),null);assert.equal(h.waiting,false);
  assert.equal(h.requested.length,0);assert.equal(h.homeError,false);assert.equal(h.homeTimerCount,0);
  h.auth.isInitializing=true;assert.equal(h.render(),null);assert.equal(h.app,null);
  assert.equal(h.waiting.props.children.props.label,'Opening Portalink…');
  h.auth.isInitializing=false;assert.equal(h.render(),null);assert.equal(h.app.type,'app');
});

test('an opening MOBILE visit keeps its one-shot handoff after rotation even while Home remains unready', () => {
  const h=sharedBootstrap({path:'/',search:'',homeReady:false}); h.render(); h.setPresentation('web');
  let splash=h.render(); assert.equal(splash.props.timedIntro,true); assert.equal(splash.props.hidden,false);
  h.auth.isInitializing=false; h.auth.isAuthenticated=true; splash=h.render();
  splash=h.render(); assert.equal(splash,null); assert.equal(h.app.type,'app');
  assert.equal(h.app.props.homeStartupPending,false,'restored MOBILE launch no longer waits for decorative media after rotation'); assert.equal(h.homeTimerCount,0);
  h.render(); assert.equal(h.render(),null);
  assert.equal(h.app.props.homeStartupPending,false);
  h.setPresentation('mobile');assert.equal(h.render(),null);assert.equal(h.homeError,false);
});

test('ordinary MOBILE visitors see Hello World and account entry before successful authentication releases Home', () => {
  for (const first of ['media','auth']) {
    const h=sharedBootstrap({path:'/',search:'',homeReady:false}); const initial=h.render();let splash=initial;
    assert.equal(splash.props.landing,undefined);
    assert.equal(splash.props.timedIntro,true); assert.equal(splash.props.hidden,false);
    if(first==='media') splash.props.onComplete(); else h.auth.isInitializing=false;
    splash=h.render();
    assert.equal(splash.type,initial.type);assert.equal(splash.key,first==='media'?initial.key:'portalink-account-entry');
    assert.equal(splash.props.onComplete,initial.props.onComplete);
    if(first==='media') {
      assert.equal(splash.props.landing,undefined);assert.equal(h.app,null);assert.equal(h.waiting,false);
    } else {
      assert.equal(splash.props.landing.ready,true);assert.equal(splash.props.timedIntro,true);
      assert.equal(h.app.type,'app');assert.equal(h.app.props.homeStartupPending,true,'the intro alone defers speculative screen warming');
    }
    if(first==='media') h.auth.isInitializing=false; else splash.props.onComplete();
    splash=h.render();assert.equal(splash.key,'portalink-account-entry');assert.equal(splash.props.landing.ready,true);
    assert.equal(h.app.type,'app');assert.equal(h.app.props.homeStartupPending,false);assert.equal(h.waiting,false);assert.equal(h.homeError,false);assert.equal(h.homeTimerCount,0);
    assert.equal(h.requested.length,0,'Hello World precedes any requested signup or sign-in form');
    assert.equal(splash.props.landing.onDismiss,undefined);assert.equal(splash.props.landing.onContinue,undefined);
    h.authenticate();h.render();assert.equal(h.render(),null);h.render();assert.equal(h.render(),null);
    h.location.pathname='/messages';assert.equal(h.render(),null);
    h.auth.isInitializing=true;assert.equal(h.render(),null);assert.equal(h.app,null);
    assert.equal(h.waiting.props.children.props.label,'Opening Portalink…');
    h.auth.isInitializing=false;assert.equal(h.render(),null);assert.equal(h.app.type,'app');
    h.location.pathname='/';assert.equal(h.render(),null);assert.equal(h.homeTimerCount,0);
  }
});

test('authenticated visitors, recovery and callback URLs never hold the landing', () => {
  for(const options of [{authenticated:true},{recovery:true},{search:'?auth=signIn'},{search:'?code=private'},{hash:'#type=recovery'},{path:'/messages'}]) {
    const h=sharedBootstrap({path:'/',search:'',...options}); let splash=h.render(); assert.equal(splash.props.landing,undefined);
    splash.props.onComplete(); h.auth.isInitializing=false; h.render(); h.render(); assert.equal(h.render(),null);
    h.auth.isAuthenticated=false; h.auth.pendingView=null; assert.equal(h.render(),null);
  }
});

test('WEB opening Home retains decoded-content and shell readiness without requiring a film', () => {
 const h=sharedBootstrap({path:'/',search:'',authenticated:true,presentation:'web',homeReady:false});h.auth.isInitializing=false;
 assert.equal(h.render(),null);assert.equal(h.app.type,'app');assert.equal(h.app.props.homeStartupPending,true);
 h.app.props.onHomeStartupShellReady(true);assert.equal(h.render(),null);assert.equal(h.app.props.homeStartupPending,true);
 h.app.props.onHomeStartupReady(false);assert.equal(h.render(),null);assert.equal(h.app.props.homeStartupPending,true);
 h.app.props.onHomeStartupReady(true);h.render();assert.equal(h.render(),null);assert.equal(h.app.props.homeStartupPending,false);
 h.location.pathname='/messages';assert.equal(h.render(),null);
});

test('returning MOBILE sessions enter unready Home immediately without a startup timeout or later replay', () => {
  const h=sharedBootstrap({path:'/',search:'',authenticated:true,homeReady:false});h.auth.isInitializing=false;
  assert.equal(h.render(),null);
  assert.equal(h.app.type,'app');assert.equal(h.app.props.homeStartupPending,false);assert.equal(h.homeTimerCount,0);
  assert.equal(h.render(),null);h.render();
  assert.equal(h.app.type,'app');assert.equal(h.app.props.homeStartupPending,false);assert.equal(h.homeError,false);assert.equal(h.homeTimerCount,0);
  h.app.props.onHomeStartupReady(false);h.app.props.onHomeStartupShellReady(false);
  h.auth.session={user:{id:'restored-account'}};h.auth.user={id:'restored-account'};
  assert.equal(h.render(),null);assert.equal(h.homeError,false);assert.equal(h.homeTimerCount,0);
  h.setPresentation('web');assert.equal(h.render(),null);h.setPresentation('mobile');assert.equal(h.render(),null);
  h.auth.isInitializing=true;assert.equal(h.render(),null);assert.equal(h.app,null);
  assert.equal(h.waiting.props.children.props.label,'Opening Portalink…');
  h.auth.isInitializing=false;assert.equal(h.render(),null);assert.equal(h.app.type,'app');
});

test('an opening WEB visit retains Home readiness and retry ownership after rotation to MOBILE', () => {
  const h=sharedBootstrap({path:'/',search:'',presentation:'web',authenticated:true,homeReady:false});
  h.render();h.setPresentation('mobile');h.auth.isInitializing=false;
  assert.equal(h.render(),null);assert.equal(h.app.props.homeStartupPending,true);assert.equal(h.homeTimerCount,1);
  h.app.props.onHomeStartupReady(true);h.app.props.onHomeStartupShellReady(true);h.render();assert.equal(h.render(),null);
});

test('ready Home enters directly on both WEB and MOBILE', () => {
 for(const presentation of ['mobile','web']) {
  const h=sharedBootstrap({path:'/',search:'',authenticated:true,presentation,homeReady:false});h.auth.isInitializing=false;
  h.render(); h.app.props.onHomeStartupReady(true);h.app.props.onHomeStartupShellReady(true);
  const splash=h.render();
  assert.equal(splash,null);h.render();assert.equal(h.render(),null);
 }
});

test('WEB Home timeout retains Retry and rejects stale account or startup-attempt completions', () => {
 const h=sharedBootstrap({path:'/',search:'',authenticated:true,presentation:'web',homeReady:false});h.auth.isInitializing=false;
 h.render(); h.render();
 const old=h.app.props;
 h.timer();assert.equal(h.render(),null);assert.equal(h.homeError.props.children.type,'home-error');
 h.homeError.props.children.props.onRetry();assert.equal(h.render(),null);assert.equal(h.app.props.homeStartupAttempt,1);
 old.onHomeStartupReady(true);old.onHomeStartupShellReady(true);assert.equal(h.render(),null);
 const retry=h.app.props;h.auth.user={id:'different'};h.auth.session={user:h.auth.user};h.render();
 retry.onHomeStartupReady(true);retry.onHomeStartupShellReady(true);assert.equal(h.render(),null);
 h.app.props.onHomeStartupReady(true);h.app.props.onHomeStartupShellReady(true);h.render();assert.equal(h.render(),null);
});

test('successful WEB welcome authentication retains the Home readiness handoff without reopening entry actions', () => {
 const h=sharedBootstrap({path:'/',search:'?welcome=1',presentation:'web',homeReady:false});h.auth.isInitializing=false;
 const splash=h.render();assert.equal(splash.props.landing.onDismiss,undefined);h.authenticate();
 const waiting=h.render();assert.equal(waiting.type,'splash');assert.equal(waiting.props.landing,undefined);assert.equal(waiting.props.welcomeHandoff,true);
 h.app.props.onHomeStartupReady(true);h.app.props.onHomeStartupShellReady(true);h.render();assert.equal(h.render(),null);
});

test('successful MOBILE welcome authentication enters immediately even while Home remains unready', () => {
 const h=sharedBootstrap({path:'/',search:'?welcome=1',homeReady:false});h.auth.isInitializing=false;
 const splash=h.render();assert.equal(splash.props.landing.ready,true);h.authenticate();
 h.render();assert.equal(h.render(),null);assert.equal(h.app.type,'app');assert.equal(h.app.props.homeStartupPending,false);
 assert.equal(h.homeTimerCount,0);assert.equal(h.homeError,false);
});

test('ordinary and invited root mobile welcome actions open the intended form and return without adding a shared destination', () => {
  for (const search of ['', '?welcome=1']) for (const [action, view] of [['onSignIn','signIn'],['onCreateAccount','signUp'],['onForgotPassword','forgotPassword']]) {
    const h=sharedBootstrap({path:'/',search}); h.auth.isInitializing=false;
    const splash=h.render(); assert.equal(splash.props.landing.ready,true, 'buttons do not wait for video playback');
    splash.props.landing[action]();
    assert.equal(h.requested[0].view,view);
    assert.equal(h.requested[0].intent,undefined);
    assert.equal(h.render().props.hidden,true);
    h.auth.pendingView=null;const returned=h.render();assert.equal(returned.key,splash.key);
    assert.equal(returned.props.hidden,false);assert.equal(returned.props.landing.ready,true);
    assert.equal(h.requested.length,1,'closing an account form cannot request another one');
  }
});

test('ordinary root and invitation fragments retain welcome unless authentication fragments bypass it', () => {
  for(const hash of ['#projects','#page-2']) {
    const h=sharedBootstrap({path:'/',search:'',hash}); h.auth.isInitializing=false;
    const splash=h.render();assert.equal(splash.props.landing.ready,true);assert.equal(splash.props.timedIntro,true);
    splash.props.onComplete();assert.equal(h.render().props.landing.ready,true);
    assert.equal(splash.props.landing.onContinue,undefined);assert.equal(splash.props.landing.onDismiss,undefined);
    h.authenticate();h.render();assert.equal(h.render(),null);assert.equal(h.app.type,'app');
    const invite=sharedBootstrap({path:'/',search:'?welcome=1',hash});invite.auth.isInitializing=false;
    assert.equal(invite.render().props.landing.ready,true);
  }
  for(const search of ['', '?welcome=1']) for(const hash of ['#access_token=private','#refresh_token=private','#type=recovery','#error_description=expired','#code=private']) {
    const h=sharedBootstrap({path:'/',search,hash}); h.auth.isInitializing=false;
    assert.equal(h.render().props.landing,undefined);
  }
});

const welcome = {ready:true,onCreateAccount(){},onSignIn(){},onForgotPassword(){},onDismiss(){}};

test('Escape and system Back cannot dismiss main account entry but still cancel a dismissible auth landing', async () => {
  for (const presentation of ['mobile', 'web']) for (const dismissible of [false, true]) {
    const startup = sharedBootstrap({ path: '/', search: '', presentation }); startup.auth.isInitializing = false;
    const mainLanding = startup.render().props.landing;
    let cancellations = 0;
    const h = loader({ presentation, landing: dismissible ? { ...mainLanding, onDismiss: () => cancellations++ } : mainLanding });
    h.render(); assert.equal(h.modalCalls.at(-1), true); const completedBeforeDismissal = h.completed;
    const listeners = new Map();
    const document = { activeElement: null, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
    class Element {
      isConnected = true;
      getClientRects() { return [{}]; }
      closest() { return null; }
      contains(target) { return target === this; }
      querySelectorAll() { return []; }
      matches() { return false; }
      focus() { document.activeElement = this; }
    }
    const focus = sourceModule('src/hooks/useModalFocus.ts', { react: React }, { document, HTMLElement: Element, getComputedStyle: () => ({ visibility: 'visible' }) });
    const dialog = new Element();
    const cleanup = focus.containModalFocus(dialog, h.modalDismissals.at(-1), true);
    let prevented = false;
    listeners.get('keydown')({ key: 'Escape', target: dialog, defaultPrevented: false, preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    await focus.dismissTopModal();
    assert.equal(cancellations, dismissible ? 2 : 0);
    assert.equal(h.completed, completedBeforeDismissal, 'Neither dismissal path can advance startup completion');
    assert.equal(startup.render().props.landing.ready, true); assert.equal(startup.requested.length, 0);
    cleanup(); assert.equal(focus.dismissTopModal(), false); h.unmount();
  }
});

test('fallback entry choices expose account actions without a guest callback on both presentations', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = loader({ presentation, landing: welcome });
    const choices = h.render().tree.props.children[1].props.children[0];
    assert.equal(choices.type, 'EntryChoices'); assert.equal(choices.props.onGuest, undefined);
    assert.equal(choices.props.onEmail, welcome.onCreateAccount); assert.equal(choices.props.onSignIn, welcome.onSignIn); h.unmount();
  }
});

test('only the visible MOBILE inline account form enables the field viewport hook',()=>{
 for(const presentation of ['mobile','web']){
  const h=loader({presentation,landing:welcome});h.render();assert.equal(h.entryViewportCalls.at(-1).enabled,false);
  h.setLanding({...welcome,hideMedia:true});h.render();assert.equal(h.entryViewportCalls.at(-1).enabled,presentation==='mobile');
  assert.equal(h.entryViewportCalls.at(-1).ref,h.viewportCalls.at(-1).ref);
  h.setHidden(true);h.render();assert.equal(h.entryViewportCalls.at(-1).enabled,false);
  h.setHidden(false);h.setLanding(welcome);h.render();assert.equal(h.entryViewportCalls.at(-1).enabled,false);h.unmount();
 }
 const noScene=loader({presentation:'mobile'});noScene.render();assert.equal(noScene.entryViewportCalls.at(-1).enabled,false);noScene.unmount();
});

test('the account form omits welcome media, pauses playback and restores it when returning to choices on BOTH',()=>{
 for(const presentation of ['mobile','web'])for(const adopted of [false,true]){
  const bootVideo=adopted?{paused:false,readyState:4,currentTime:.7,dataset:{portalinkPainted:'true'}}:undefined;
  const h=loader({presentation,landing:welcome,bootVideo});
  assert.ok(h.render().media);h.start();h.paint();
  if(adopted){h.emit('ended');h.render();h.start();h.paint();}
  h.video.currentTime=.7;
  h.setLanding({...welcome,hideMedia:true});const form=h.render();
  assert.equal(form.media,undefined);assert.equal(form.poster,undefined);
  assert.equal(form.tree.props['data-entry-form'],true);assert.equal(form.tree.props.children[0],false);
  assert.equal(h.video.paused,true);assert.ok(h.pauses>0);
  assert.equal(h.frames.size,0);assert.equal(h.timers.size,0,'The hidden form leaves no playback work queued');
  if(!adopted){assert.equal(h.listeners.size,0);assert.equal(h.docListeners.size,0);assert.equal(h.windowListeners.size,0);}
  const plays=h.plays;h.gesture();h.foreground();h.restore();assert.equal(h.plays,plays,'Background recovery cannot resume omitted media');
  h.setLanding(welcome);const choices=h.render();assert.ok(choices.media);assert.equal(choices.tree.props['data-entry-form'],undefined);
  assert.ok(h.plays>plays,'Returning choices reinitializes playback');h.start();h.paint();
  const restored=h.render();assert.equal(restored.media.props.style.opacity,adopted?undefined:1);
  if(adopted){assert.equal(h.video.style.opacity,'1');assert.equal(h.video.currentTime,.7);assert.equal(h.host.children.filter(child=>child===h.video).length,1);}
  h.unmount();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);assert.equal(h.docListeners.size,0);assert.equal(h.windowListeners.size,0);
 }
});

test('an initially media-free account form can return to playing welcome choices on BOTH',()=>{
 for(const presentation of ['mobile','web']){
  const h=loader({presentation,landing:{...welcome,hideMedia:true}}),form=h.render();
  assert.equal(form.media,undefined);assert.equal(form.tree.props['data-entry-form'],true);assert.equal(h.plays,0);
  assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);
  h.setLanding(welcome);assert.ok(h.render().media);assert.ok(h.plays>0);
  h.start();h.paint();assert.equal(h.render().media.props.style.opacity,1);
  h.unmount();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);
 }
});

test('only a visible MOBILE welcome subscribes its own stable frame to the dialog viewport',()=>{
 const mobile=loader({presentation:'mobile',landing:welcome});
 const first=mobile.render(),ref=mobile.viewportCalls.at(-1).ref;
 assert.equal(mobile.viewportCalls.at(-1).enabled,true);assert.equal(first.tree.ref,ref);
 mobile.setHidden(true);mobile.render();assert.equal(mobile.viewportCalls.at(-1).enabled,false);
 mobile.setHidden(false);mobile.render();assert.equal(mobile.viewportCalls.at(-1).enabled,true);
 assert.ok(mobile.viewportCalls.every(call=>call.ref===ref),'Hiding an account form does not replace the scene frame');
 mobile.setLanding({...welcome,ready:false});mobile.render();assert.equal(mobile.viewportCalls.at(-1).enabled,true,'Loading entry actions still need the correct visible frame');
 mobile.setLanding(undefined);mobile.setHandoff(true);mobile.render();assert.equal(mobile.viewportCalls.at(-1).enabled,true,'The retained welcome keeps its measured frame through handoff');
 mobile.unmount();
 for(const options of [{presentation:'web',landing:welcome},{presentation:'mobile',timedIntro:true},{presentation:'mobile',welcomeMedia:true},{presentation:'mobile',stillOnly:true}]){
  const h=loader(options);h.render();assert.equal(h.viewportCalls.at(-1).enabled,false);h.unmount();
 }
});

test('a guest arriving during the fixed intro enables viewport measurement only after its natural end',()=>{
 const h=loader({presentation:'mobile',timedIntro:true});h.render();assert.equal(h.viewportCalls.at(-1).enabled,false);
 h.setLanding(welcome);h.render();assert.equal(h.viewportCalls.at(-1).enabled,false);
 h.start();h.paint();h.emit('ended');const completed=h.render();
 assert.equal(completed.tree.props['data-share-landing'],'true');assert.equal(h.viewportCalls.at(-1).enabled,true);
 assert.equal(h.completed,1);assert.equal(h.video.loop,true);h.unmount();
});

test('welcome loops without an exit deadline and keeps all entry actions available on BOTH',()=>{
  for(const presentation of ['mobile','web']) {
    const h=loader({presentation,landing:welcome}),{media,tree}=h.render();assert.equal(media.props.loop,true);
    assert.equal(tree.props.children[1].props['aria-busy'],false);
    assert.equal(tree.props.children[1].props.children[0].type,'EntryChoices');
    assert.equal(tree.props.children[1].props.children[0].props.presentation,presentation,'Bootstrap entry choices must receive the loader presentation before the app provider exists');
    assert.equal(tree.props.children[1].props.children[0].props.onEmail,welcome.onCreateAccount);
    h.start();h.paint();assert.equal(h.completed,1);assert.equal(h.timers.size,0);
    for(let cycle=0;cycle<3;cycle++){h.emit('waiting');assert.equal(h.render().media.props.style.opacity,1);h.start();h.paint();assert.equal(h.timers.size,0);}
    h.unmount();assert.equal(h.frames.size,0);
  }
});

test('welcome pauses behind account forms and in background, then resumes without replacing video',()=>{
  const h=loader({presentation:'mobile',landing:welcome});h.render();h.start();h.paint();h.video.currentTime=.75;
  h.setHidden(true);h.render();assert.equal(h.video.paused,true);assert.equal(h.timers.size,0);
  h.setHidden(false);h.render();h.start();h.paint();assert.equal(h.video.currentTime,.75);
  h.hide();assert.equal(h.timers.size,0);h.foreground();h.start();h.paint();assert.equal(h.render().media.props.style.opacity,1);
  h.unmount();assert.equal(h.docListeners.size,0);
});

test('welcome backup and automatic retries remain bounded while gestures and home-screen restoration can recover',async()=>{
  const h=loader({presentation:'mobile',landing:welcome,blocked:true});h.render();h.start();await Promise.resolve();
  for(let retry=0;retry<2;retry++){h.timer(800);await Promise.resolve();}
  assert.equal(h.plays,3);assert.ok(h.render().media);h.backupLoaded();h.timer(1500);
  assert.equal(h.completed,1);assert.equal(h.timers.size,0);
  h.hide();h.foreground();await Promise.resolve();assert.equal(h.plays,4);
  h.unmount();assert.equal(h.timers.size,0);assert.equal(h.windowListeners.size,0);
});

test('a verified guest waits for the remaining intro before switching to welcome looping',()=>{
  const h=loader({presentation:'mobile',timedIntro:true});h.render();h.start();h.paint();assert.equal(h.completed,0);
  h.setLanding(welcome);assert.equal(h.render().media.props.loop,false);
  h.start();h.paint();assert.equal(h.completed,0);assert.equal(h.render().tree.props.role,'status');
  h.emit('ended');assert.equal(h.completed,1);assert.equal(h.render().media.props.loop,true);
  h.start();h.paint();assert.equal(h.timers.size,0);h.unmount();
});

test('mobile welcome delegates readiness to the shared entry controls',()=>{
  const h=loader({presentation:'mobile',landing:{...welcome,ready:false}});
  const {tree}=h.render();
  assert.equal(tree.props.children[1].props['aria-busy'],true);
  assert.equal(tree.props.children[1].props.children[0].props.ready,false);
  h.unmount();
});

test('successful sign in or registration ends an explicit welcome permanently across presentation changes', () => {
  for(const action of ['onSignIn','onCreateAccount']) {
    const h=sharedBootstrap({path:'/',search:'?welcome=1'});h.auth.isInitializing=false;h.render().props.onComplete();
    const splash=h.render();
    splash.props.landing[action]();h.authenticate();
    const handoff=h.render();assert.equal(handoff.props.welcomeHandoff,true);
    assert.equal(h.render(),null);
    h.auth.isAuthenticated=false;h.setPresentation('web');assert.equal(h.render(),null);
    h.setPresentation('mobile');assert.equal(h.render(),null);
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

test('splash and Hello World exit fades stay within the base token on both layouts without changing fixed mobile handoff',()=>{
 const welcome={ready:true,onCreateAccount(){},onSignIn(){},onForgotPassword(){},onDismiss(){}};
 for(const presentation of ['mobile','web']){
  for(const state of [{},{landing:welcome},{welcomeHandoff:true}]){
   const h=loader({presentation,...state}),view=h.render();
   assert.equal(view.tree.props.transition.duration,.18);
   assert.equal(view.tree.props.exit.opacity,0);h.unmount();
   const reduce=loader({presentation,...state,reduced:true});reduce.render();assert.equal(reduce.exitDuration,0);reduce.unmount();
  }
 }
 const fixed=loader({presentation:'mobile',timedIntro:true});fixed.render();assert.equal(fixed.exitDuration,0);fixed.unmount();
});


test('a failed OAuth callback reopens welcome on both presentations without interrupting recovery',()=>{
 for(const presentation of ['mobile','web']) {
  const h=sharedBootstrap({presentation,path:'/',search:'?entry=oauth',hash:'#error=access_denied'});
  h.auth.isInitializing=false;
  assert.equal(h.render().props.landing.ready,true);
  const recovery=sharedBootstrap({presentation,path:'/',search:'?entry=oauth',hash:'#error=access_denied',recovery:true});
  recovery.auth.isInitializing=false;assert.equal(recovery.render()?.props.landing,undefined);
 }
});
