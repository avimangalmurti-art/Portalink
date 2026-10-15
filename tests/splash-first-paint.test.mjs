import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const poster = readFileSync(new URL('../src/components/ui/splashPoster.ts', import.meta.url), 'utf8').match(/SPLASH_POSTER_DATA_URL = '([^']+)'/)[1];

test('first artwork is identical and embedded in HTML and React without waiting for an image request', () => {
  const preboot = html.slice(html.indexOf('id="portalink-preboot"'), html.indexOf('<script type="module" src="/src/index.tsx"'));
  assert.ok(preboot.includes(`src="${poster}"`));
  assert.doesNotMatch(preboot, /<source/);
  assert.match(preboot, /<video id="portalink-preboot-video" src="\/portalink-splash-mobile\.mp4\?v=9c1a9457"[^>]*autoplay muted playsinline/);
  assert.ok(html.indexOf('id="portalink-preboot-video"') < html.indexOf('id="root"'), 'React cannot replace the already-playing video while mounting');
  assert.match(preboot, /width="512" height="720" decoding="sync" fetchpriority="high"/);
  const bytes = Buffer.from(poster.split(',')[1], 'base64');
  assert.deepEqual(bytes, readFileSync(new URL('../public/portalink-splash-first-frame.webp', import.meta.url)));
  assert.ok(bytes.length < 24000, 'critical artwork stays small enough to arrive with the HTML');
  assert.match(readFileSync(new URL('../src/components/ui/PortalinkSplashLoader.tsx', import.meta.url), 'utf8'), /SPLASH_POSTER_DATA_URL/);
});

function earlyVideoFixture({ shared = false, reduced = false, legacy = false, hidden = false, blocked = false } = {}) {
  const videoEvents = new Map(), documentEvents = new Map(), windowEvents = new Map(), frames = new Map();
  let plays = 0, pauses = 0, frameId = 0;
  const video = {
    dataset: {}, style: { opacity: '0' }, paused: true, readyState: 0, ended: false,
    removeAttribute(name) { this.removedAttribute = name; },
    addEventListener: (name, callback) => videoEvents.set(name, callback),
    removeEventListener: name => videoEvents.delete(name),
    play() { plays++; return blocked ? Promise.reject(Error('autoplay blocked')) : Promise.resolve(); },
    pause() { pauses++; this.paused = true; },
    requestVideoFrameCallback: legacy ? undefined : callback => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelVideoFrameCallback: id => frames.delete(id),
  };
  const document = { hidden, documentElement: { hasAttribute: () => shared }, getElementById: () => video,
    addEventListener: (name, callback) => documentEvents.set(name, callback), removeEventListener: name => documentEvents.delete(name) };
  const window = { matchMedia: () => ({ matches: reduced }),
    addEventListener: (name, callback) => windowEvents.set(name, callback), removeEventListener: name => windowEvents.delete(name) };
  const script = html.match(/<script data-portalink-early-video>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { document, window });
  return { video, videoEvents, documentEvents, windowEvents, frames, document,
    get plays() { return plays; }, get pauses() { return pauses; },
    playing() { video.paused = false; video.readyState = 2; videoEvents.get('playing')?.(); },
    paint() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); } };
}

test('the HTML starts muted playback before app code, without waiting for decoded or fully buffered data', () => {
  const f = earlyVideoFixture();
  assert.equal(f.plays, 1); assert.equal(f.video.readyState, 0);
  assert.equal(f.video.muted, true); assert.equal(f.video.defaultMuted, true); assert.equal(f.video.playsInline, true);
  assert.equal(f.video.style.opacity, '0'); f.playing();
  assert.equal(f.video.style.opacity, '0', 'Keep the embedded artwork until a real frame is painted');
  f.paint(); assert.equal(f.video.style.opacity, '1'); assert.equal(f.video.dataset.portalinkPainted, 'true');
});

test('adoption removes early listeners and frame callbacks without pausing or replaying the same video', () => {
  const f = earlyVideoFixture(); f.playing();
  const video = f.video, plays = f.plays;
  f.videoEvents.get('portalink:splash-adopt')();
  assert.equal(f.video, video); assert.equal(f.plays, plays); assert.equal(f.pauses, 0);
  assert.equal(f.frames.size, 0); assert.equal(f.videoEvents.size, 0);
  assert.equal(f.documentEvents.size, 0); assert.equal(f.windowEvents.size, 0);
});

test('HTML playback respects background suspension, completed clips, shared entry and WEB reduced motion', () => {
  const f = earlyVideoFixture({ hidden: true }); assert.equal(f.plays, 0);
  f.document.hidden = false; f.documentEvents.get('visibilitychange')(); assert.equal(f.plays, 1);
  f.playing(); f.paint(); f.video.ended = true; f.windowEvents.get('pageshow')(); assert.equal(f.plays, 1, 'A finished intro is never restarted during handoff');
  f.document.hidden = true; f.documentEvents.get('visibilitychange')(); assert.equal(f.pauses, 1);
  for (const options of [{ shared: true }, { reduced: true }]) {
    const skipped = earlyVideoFixture(options); assert.equal(skipped.plays, 0); assert.equal(skipped.pauses, 1);
    assert.equal(skipped.video.removedAttribute, 'autoplay'); assert.equal(skipped.videoEvents.size, 0);
  }
  const legacy = earlyVideoFixture({ legacy: true }); legacy.playing(); assert.equal(legacy.video.style.opacity, '1');
});

test('autoplay rejection preserves the embedded artwork for the app recovery path', async () => {
  const f = earlyVideoFixture({ blocked: true }); await Promise.resolve();
  assert.equal(f.video.style.opacity, '0'); assert.equal(f.video.dataset.portalinkPainted, undefined);
  f.videoEvents.get('canplay')(); await Promise.resolve(); assert.equal(f.plays, 2);
});

test('a native decode failure before React reveals the embedded artwork again', () => {
  const f = earlyVideoFixture(); f.playing(); f.paint(); assert.equal(f.video.style.opacity, '1');
  f.videoEvents.get('error')();
  assert.equal(f.video.style.opacity, '0'); assert.equal(f.video.dataset.portalinkPainted, undefined);
  f.videoEvents.get('portalink:splash-adopt')(); assert.equal(f.videoEvents.size, 0);
});

function bootFixture({ shared = false } = {}) {
  const windowEvents = new Map(), documentEvents = new Map(), timers = new Map();
  let reloads = 0;
  const node = tag => ({ tagName: tag.toUpperCase(), children: [], attributes: new Map(), append(...children) { this.children.push(...children); children.forEach(child => { child.parent = this; }); }, setAttribute(name, value) { this.attributes.set(name, value); }, remove() { this.parent.children = this.parent.children.filter(child => child !== this); } });
  const preboot = node('div'), art = node('img'); preboot.id = 'portalink-preboot'; preboot.append(art);
  const document = {
    documentElement: { dataset: {}, hasAttribute: () => shared },
    getElementById: id => id === preboot.id ? preboot : preboot.children.find(child => child.id === id),
    createElement: node, querySelector: () => preboot.children.find(child => child.attributes.has('data-portalink-boot-status')),
    addEventListener: (name, callback) => documentEvents.set(name, callback), removeEventListener: name => documentEvents.delete(name),
  };
  const window = { location: { href: 'https://portalink.example/', origin: 'https://portalink.example', reload: () => reloads++ },
    addEventListener: (name, callback) => windowEvents.set(name, callback), removeEventListener: name => windowEvents.delete(name),
    setTimeout: (callback, delay) => { timers.set(1, { callback, delay }); return 1; }, clearTimeout: id => timers.delete(id) };
  const script = html.match(/<script data-portalink-boot-watchdog>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { document, window, URL });
  return { art, preboot, document, timers, windowEvents, get status() { return document.getElementById('portalink-preboot-status'); }, get reloads() { return reloads; } };
}

test('entry-module failure or a never-settling request retains artwork and offers recovery before app code runs', () => {
  for (const timeout of [false, true]) {
    const f = bootFixture();
    if (timeout) { assert.equal(f.timers.get(1).delay, 12000); f.timers.get(1).callback(); }
    else f.windowEvents.get('error')({ target: { tagName: 'SCRIPT', type: 'module', src: '/assets/main.js' } });
    assert.equal(f.preboot.children[0], f.art);
    assert.equal(f.status.attributes.get('role'), 'alert');
    f.status.children[1].onclick(); assert.equal(f.reloads, 1);
  }
});

test('real entry readiness hands recovery ownership to CSS without changing public-link behavior', () => {
  const f = bootFixture(); f.timers.get(1).callback(); assert.ok(f.status);
  f.document.documentElement.dataset.portalinkEntryReady = 'true';
  f.windowEvents.get('portalink:main-entry-ready')();
  assert.equal(f.status, undefined); assert.equal(f.preboot.children[0], f.art); assert.equal(f.timers.size, 0); assert.equal(f.windowEvents.size, 0);
  const publicEntry = bootFixture({ shared: true }); publicEntry.timers.get(1).callback(); assert.equal(publicEntry.status, undefined);
  const external = bootFixture(); external.windowEvents.get('error')({ target: { tagName: 'SCRIPT', type: 'module', src: 'https://external.example/script.js' } }); assert.equal(external.status, undefined);
});
