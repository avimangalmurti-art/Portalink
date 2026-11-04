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

test('WeeklyReadNote reports settlement and dismisses smoothly once per login', async () => {
  let cursor = 0, effects = [], retries = 0, loginSession = {}, presentation = 'web';
  const slots = [], reports = [];
  const query = { loading: true, data: undefined, error: undefined, retry: () => retries++ };
  const react = { ...React, useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; }, useCallback: callback => callback, useEffect: callback => effects.push(callback) };
  const { WeeklyReadNote } = sourceModule('src/features/reads/WeeklyReadNote.tsx', {
    react, 'react-router-dom': { useNavigate: () => () => {} }, '../../contexts/ServicesContext': { useServices: () => ({ reads: {} }) },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'account' }, loginSession }) }, '../library/useAccountQuery': { useAccountQuery: () => query },
    '../../presentation/motion/motion': { motionMs: () => 200, motionEase: () => 'ease-out' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    './readSignal': { currentWeek: () => 'week' }, '../../components/ui/Button': { Button: 'button' }, './reads.css': {},
  }, { localStorage: { getItem: () => 'yes', setItem: () => assert.fail('Dismissal must not persist across logins') } });
  const render = attempt => { cursor = 0; effects = []; const tree = WeeklyReadNote({ startupPending: true, startupAttempt: attempt, onStartupSettled: value => reports.push(value) }); effects.forEach(effect => effect()); return tree; };
  render(0); assert.equal(reports.at(-1), false); assert.equal(retries, 0);
  query.loading = false; query.error = 'Reads unavailable'; render(0); assert.equal(reports.at(-1), true);
  render(1); assert.equal(retries, 1); render(1); assert.equal(retries, 1);
  query.error = undefined;
  query.data = [{ projectId: 'work', weekly: { opened: 48, finished: 6 } }];
  assert.ok(render(1), 'Old weekly localStorage dismissal is ignored');
  const walk = node => !React.isValidElement(node) ? [] : [node, ...React.Children.toArray(node.props.children).flatMap(walk)];
  const webCard=walk(render(1));
  assert.ok(webCard.some(node=>node.type==='h2'));
  assert.ok(webCard.some(node=>node.type==='p'&&node.props.children.startsWith('Your work is being read.')));
  presentation='mobile';
  const mobileCard=walk(render(1));
  assert.equal(mobileCard.filter(node=>node.type==='li').length,2);
  assert.deepEqual(mobileCard.filter(node=>node.type==='li').map(node=>React.Children.toArray(node.props.children).join('')),['48 project opens.','6 reads reached the end.']);
  assert.equal(mobileCard.some(node=>node.type==='p'||node.type==='h2'),false);
  query.data = [];
  assert.equal(render(1), null, 'A new mobile account has no weekly card');
  assert.equal(reports.at(-1), true, 'No activity still settles startup');
  query.data = [{ projectId: 'older-work', weekly: { opened: 0, finished: 0 }, allTime: { opened: 48, finished: 6 } }];
  assert.equal(render(1), null, 'Past activity alone does not show a zero week');
  query.data = [{ projectId: 'work', weekly: { opened: 1, finished: 0 } }];
  assert.ok(render(1), 'Current activity can appear before the first completed read');
  presentation='web';
  walk(render(1)).find(node => node.type === 'button' && node.props.children === 'Dismiss').props.onClick();
  query.loading = true; assert.equal(render(1), null); assert.equal(reports.at(-1), true);
  slots.length = 0; assert.equal(render(1), null, 'Navigation remount keeps this login dismissed');
  loginSession = {}; query.loading = false;
  assert.ok(render(1), 'A new login shows the same week again');
  query.data = []; assert.ok(render(1), 'A successfully loaded zero-activity week still greets the user');
  let finish; const animations=[];
  const animation={finished:new Promise(resolve=>{finish=resolve;}),cancel(){}};
  const card=render(1);
  card.ref.current={style:{},closest:()=>({}),getBoundingClientRect:()=>({height:280}),animate:(frames,options)=>{animations.push({frames,options});return animation;}};
  const dismiss=walk(card).find(node=>node.type==='button'&&node.props.children==='Dismiss').props.onClick;
  dismiss();dismiss();
  assert.equal(animations.length,1,'Repeated taps cannot restart dismissal');
  assert.ok(render(1),'Card stays mounted while its exit collapses the layout');
  assert.equal(animations[0].frames.at(-1).height,'0px');
  assert.equal(animations[0].options.duration,200);
  finish();await Promise.resolve();
  assert.equal(render(1),null,'Card is removed when its exit finishes');
});
