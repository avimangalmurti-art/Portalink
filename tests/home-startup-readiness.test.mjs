import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';
import { sourceModule } from './helpers/source-module.mjs';

const file = new URL('../src/components/home/useHomeStartupReadiness.ts', import.meta.url);
const rect = (top = 0, height = 200, width = 180) => ({ top, bottom: top + height, left: 0, right: width, width, height });
function bitmap(extra = {}) {
  return { currentSrc: '/cover.webp', complete: true, naturalWidth: 300, opacity: '1', decode: async () => {}, getAttribute(name) { return name === 'src' ? this.currentSrc : null; }, ...extra };
}
function artwork({ id = 'work', top = 100, images = [], videos = [], pdf = null, canvases = [] } = {}) {
  return { getBoundingClientRect: () => rect(top), getAttribute: name => name === 'data-project-continuity-id' ? id : null,
    querySelectorAll: selector => selector === 'img' ? images : selector === 'video' ? videos : selector === 'canvas' ? canvases : [],
    querySelector: selector => selector === '.pdf-page-viewport' ? pdf : null };
}
function rootFor(artworks) {
  const listeners = new Map();
  return { getBoundingClientRect: () => rect(0, 912, 420), querySelectorAll: () => artworks.map(art => ({ querySelector: () => art })),
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name),
    event(name) { listeners.get(name)?.(); } };
}
function fixture({ artworks = [], settled = true, terminalError = false, projectCount = artworks.length, documentProjects = new Set() } = {}) {
  const reports = [], frames = new Map(), timers = new Map(), observers = [];
  let next = 0;
  const root = rootFor(artworks);
  const options = { enabled: true, attempt: 0, ref: { current: root }, settled, terminalError, projectCount, documentProjects, onReady: ready => reports.push(ready) };
  const h = hookHarness(file, 'useHomeStartupReadiness', {}, {}, options, {}, {}, {
    requestAnimationFrame(callback) { frames.set(++next, callback); return next; }, cancelAnimationFrame(id) { frames.delete(id); },
    getComputedStyle: element => ({ opacity: element.opacity ?? '1' }),
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.closed = true; } },
    window: { innerWidth: 420, innerHeight: 912, addEventListener() {}, removeEventListener() {},
      setTimeout(callback) { timers.set(++next, callback); return next; }, clearTimeout(id) { timers.delete(id); } },
  });
  return { h, root, reports, options,
    async paint(count = 5) { await h.flush(); for (let i = 0; i < count; i++) { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback()); await h.flush(); } },
    mutate() { observers.filter(observer => !observer.closed).forEach(observer => observer.callback()); },
    poll() { const batch = [...timers.values()]; timers.clear(); batch.forEach(callback => callback()); },
    update(change) { Object.assign(options, change); h.options(options); },
  };
}

test('launch waits for data/layout/notes/scroll settlement and all visible cover decodes, keeping offscreen art lazy', async () => {
  const first = deferred(), second = deferred(); let offscreenDecodes = 0;
  const f = fixture({ settled: false, artworks: [artwork({ images: [bitmap({ decode: () => first.promise })] }),
    artwork({ id: 'two', top: 320, images: [bitmap({ decode: () => second.promise })] }),
    artwork({ id: 'offscreen', top: 1200, images: [bitmap({ complete: false, decode: async () => { offscreenDecodes++; } })] })] });
  await f.paint(); assert.deepEqual(f.reports, [false]);
  f.update({ settled: true }); await f.paint(); assert.equal(f.reports.at(-1), false);
  first.resolve(); await f.paint(); assert.equal(f.reports.at(-1), false);
  second.resolve(); await f.paint(); assert.equal(f.reports.at(-1), true);
  assert.equal(offscreenDecodes, 0);
});

test('measured source exposure and ImageMotion paint must complete before the splash handoff', async () => {
  const image = bitmap({ currentSrc: '', naturalWidth: 0, opacity: '0' });
  const f = fixture({ artworks: [artwork({ images: [image] })] });
  await f.paint(); assert.equal(f.reports.at(-1), false, 'An empty measured img is not a finished cover.');
  image.currentSrc = '/measured-cover.webp'; image.naturalWidth = 300; f.mutate();
  await f.paint(); assert.equal(f.reports.at(-1), false, 'Decoded artwork still waits for its opacity reveal.');
  image.opacity = '1'; f.root.event('transitionend'); f.poll();
  await f.paint(); assert.equal(f.reports.at(-1), true);
  const parent = { opacity: '0.4', parentElement: null };
  const art = artwork({ images: [bitmap()] }); art.parentElement = parent;
  const contained = fixture({ artworks: [art] }); await contained.paint();
  assert.equal(contained.reports.at(-1), false, 'The containing section must finish its skeleton-replacement fade.');
  parent.opacity = '1'; contained.root.event('animationend'); await contained.paint();
  assert.equal(contained.reports.at(-1), true);
});

test('a measured grid must mount its complete row set before empty artwork inspection can succeed', async () => {
  const f = fixture({ projectCount: 2 });
  await f.paint(); assert.equal(f.reports.at(-1), false);
  const replacement = rootFor([artwork(), artwork({ id: 'two', top: 320 })]);
  f.options.ref.current = replacement; f.mutate();
  await f.paint(); assert.equal(f.reports.at(-1), true);
});

test('legacy PDF module placeholders wait for rendered or failed PDF state; video waits for its first frame', async () => {
  const art = artwork();
  const f = fixture({ artworks: [art], documentProjects: new Set(['work']) });
  await f.paint(); assert.equal(f.reports.at(-1), false);
  let busy = true;
  const canvas = { width: 300, height: 500, opacity: '0' };
  art.querySelector = selector => selector === '.pdf-page-viewport' ? { getAttribute: () => busy ? 'true' : 'false' } : null;
  art.querySelectorAll = selector => selector === 'canvas' ? [canvas] : [];
  f.mutate(); await f.paint(); assert.equal(f.reports.at(-1), false);
  busy = false; canvas.opacity = '1'; f.mutate(); await f.paint(); assert.equal(f.reports.at(-1), true);
  const video = { readyState: 0, error: null };
  const v = fixture({ artworks: [artwork({ videos: [video] })] });
  await v.paint(); assert.equal(v.reports.at(-1), false);
  video.readyState = 2; v.root.event('loadeddata'); await v.paint(); assert.equal(v.reports.at(-1), true);
});

test('empty Home, terminal load failures, and unavailable artwork finish without trapping startup', async () => {
  for (const setup of [{}, { settled: false, terminalError: true }, { artworks: [artwork({ images: [bitmap({ naturalWidth: 0 })] })] },
    { artworks: [artwork({ images: [bitmap({ decode: async () => { throw Error('Decode unavailable'); } })] })] }]) {
    const f = fixture(setup); await f.paint(); assert.equal(f.reports.at(-1), true);
  }
});

test('completion cleanup preserves readiness; retry resets it and ignores old late decodes', async () => {
  const old = deferred(), fresh = deferred();
  const image = bitmap({ decode: () => old.promise });
  const f = fixture({ artworks: [artwork({ images: [image] })] });
  await f.paint();
  image.currentSrc = '/fresh-cover.webp'; image.decode = () => fresh.promise;
  f.update({ attempt: 1 }); await f.paint();
  old.resolve(); await f.paint(); assert.equal(f.reports.at(-1), false);
  fresh.resolve(); await f.paint(); assert.equal(f.reports.at(-1), true);
  const accepted = [...f.reports];
  f.update({ enabled: false }); await f.paint();
  assert.deepEqual(f.reports, accepted, 'Turning off the launch observer must not revoke accepted readiness.');
  f.h.dispose(); assert.deepEqual(f.reports, accepted);
});

test('a late decode between scope render and passive cleanup keeps the old readiness callback', async () => {
  const decode = deferred(), oldReports = [], nextReports = [], effects = [], frames = new Map();
  const root = rootFor([artwork({ images: [bitmap({ decode: () => decode.promise })] })]);
  let serial = 0;
  const retainedRef = {};
  const react = { useRef: initial => { retainedRef.current ??= initial; return retainedRef; }, useEffect: effect => effects.push(effect) };
  const { useHomeStartupReadiness } = sourceModule('src/components/home/useHomeStartupReadiness.ts', { react }, {
    requestAnimationFrame: callback => { frames.set(++serial, callback); return serial; }, cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: () => ({ opacity: '1' }),
    window: { innerWidth: 420, innerHeight: 912, addEventListener() {}, removeEventListener() {}, setTimeout() {}, clearTimeout() {} },
  });
  const options = { enabled: true, attempt: 0, settled: true, terminalError: false, ref: { current: root }, projectCount: 1, documentProjects: new Set() };
  const paint = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback()); };
  useHomeStartupReadiness({ ...options, onReady: ready => oldReports.push(ready) });
  const cleanup = effects.shift()();
  await paint(); // The old scope is waiting for its image decode.
  useHomeStartupReadiness({ ...options, attempt: 1, onReady: ready => nextReports.push(ready) });
  // React has rendered the next scope, but has not cleaned up passive effects.
  decode.resolve(); await paint(); await paint(); await paint();
  assert.deepEqual(nextReports, [], 'An old decode must never report into the next scope.');
  assert.deepEqual(oldReports, [false, true]);
  cleanup();
});

test('WeeklyReadNote reports terminal data settlement, skips a dismissed note, and retries only a new startup attempt', () => {
  let cursor = 0, effects = [], dismissed = false, retries = 0;
  const slots = [], reports = [];
  const query = { loading: true, data: undefined, error: undefined, retry: () => retries++ };
  const react = { ...React, useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; }, useCallback: callback => callback, useEffect: callback => effects.push(callback) };
  const { WeeklyReadNote } = sourceModule('src/features/reads/WeeklyReadNote.tsx', {
    react, 'react-router-dom': { useNavigate: () => () => {} }, '../../contexts/ServicesContext': { useServices: () => ({ reads: {} }) },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'account' } }) }, '../library/useAccountQuery': { useAccountQuery: () => query },
    './readSignal': { currentWeek: () => 'week' }, '../../components/ui/Button': { Button: 'button' }, './reads.css': {},
  }, { localStorage: { getItem: () => dismissed ? 'yes' : null } });
  const render = attempt => { cursor = 0; effects = []; WeeklyReadNote({ startupPending: true, startupAttempt: attempt, onStartupSettled: value => reports.push(value) }); effects.forEach(effect => effect()); };
  render(0); assert.equal(reports.at(-1), false); assert.equal(retries, 0);
  query.loading = false; query.error = 'Reads unavailable'; render(0); assert.equal(reports.at(-1), true);
  render(1); assert.equal(retries, 1); render(1); assert.equal(retries, 1);
  query.loading = true; dismissed = true; render(1); assert.equal(reports.at(-1), true);
});
