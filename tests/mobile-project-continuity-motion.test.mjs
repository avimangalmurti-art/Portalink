import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));

// Executes the real motion adapter against controlled browser snapshot, frame
// and timer callbacks. Real catalogue restoration remains owned by its hooks.
function runtime({ native = true, active = true, direction = 'open', results = [true], reduce = false } = {}) {
  const root = { dataset: { projectContinuity: direction } }, frames = new Map(), timers = new Map(), transitions = [], animations = [], snapshots = [], notices = [], beginnings = [];
  let nextFrame = 0, nextTimer = 0, attempts = 0, clears = 0, clones = 0, mobile = true, continuity = active;
  let destinationResults = results.slice();
  class Surface {
    dataset = {}; style = {}; isConnected = true; inert = false;
    setAttribute() {}
    append() {}
    getBoundingClientRect() { return { top: 0, left: 0, width: 420, height: 912 }; }
    cloneNode() { clones++; return new Surface(); }
    remove() { this.isConnected = false; const index = snapshots.indexOf(this); if (index !== -1) snapshots.splice(index, 1); }
    animate(keyframes, options) {
      const done = deferred(), animation = { keyframes, options, finished: done.promise, canceled: 0, finish: done.resolve, cancel() { this.canceled++; done.reject(Error('Canceled')); } };
      animations.push(animation); return animation;
    }
  }
  const main = new Surface(), stage = { dataset: { projectContinuityId: 'work' } }, shell = { append: node => snapshots.push(node) };
  const document = { documentElement: root, createElement: () => new Surface(), dispatchEvent: event => notices.push(event.type),
    querySelector: selector => selector === '[data-project-stage][data-project-continuity-id]' ? stage : selector === '.codex-shell' ? shell : selector === '.app-screen-layer.screen-active > main' ? main : null,
    querySelectorAll: () => snapshots.filter(node => 'motionSnapshot' in node.dataset || 'motionPendingReader' in node.dataset) };
  if (native) document.startViewTransition = callback => {
    const ready = deferred(), done = deferred(), finished = deferred();
    const transition = { ready: ready.promise, updateCallbackDone: done.promise, finished: finished.promise, skips: 0, skipTransition() { this.skips++; } };
    const entry = { transition, ready, done, finished, commit() { const result = callback(); void Promise.resolve(result).then(done.resolve, done.reject); return result; } };
    transitions.push(entry); return transition;
  };
  const window = { matchMedia: () => ({ matches: reduce }), setTimeout: (callback, duration) => { timers.set(++nextTimer, { callback, duration }); return nextTimer; }, clearTimeout: id => timers.delete(id) };
  const api = sourceModule('src/presentation/motion/motion.ts', { 'react-dom': { flushSync: callback => callback() }, '../../utils/projectContinuity': {
    beginProjectContinuity(id, mode) { beginnings.push([id, mode]); root.dataset.projectContinuity = mode; },
    isMobileProjectContinuity: () => mobile,
    isProjectContinuityActive: () => continuity,
    markProjectContinuityDestination() { attempts++; return destinationResults.length > 1 ? destinationResults.shift() : destinationResults[0]; },
    finishProjectContinuity() { clears++; mobile = false; continuity = false; delete root.dataset.projectContinuity; },
  } }, { document, window, Event: class { constructor(type) { this.type = type; } },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; }, cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: () => ({ getPropertyValue: name => ({ '--m-fast': '120ms', '--m-base': '180ms', '--m-slow': '260ms', '--m-enter': 'linear', '--m-exit': 'linear' }[name] ?? '') }) });
  return { api, root, document, frames, timers, transitions, animations, snapshots, notices, beginnings,
    get attempts() { return attempts; }, get clears() { return clears; }, get clones() { return clones; },
    runFrame() { const entry = frames.entries().next().value; assert.ok(entry, 'Expected a pending frame'); const [id, callback] = entry; frames.delete(id); callback(); },
    runTimer(duration = 120) { const entry = [...timers.entries()].find(([, timer]) => timer.duration === duration); assert.ok(entry, `Expected ${duration}ms timer`); const [id, timer] = entry; timers.delete(id); timer.callback(); },
    setResults(values) { destinationResults = values.slice(); },
  };
}

test('MOBILE an invalid source or unsupported native API commits navigation synchronously without alternate visual feedback', async () => {
  for (const options of [{ active: false }, { native: false, active: false }, { native: false, active: true }]) {
    const r = runtime(options); let updates = 0;
    r.api.motionUpdate(() => { updates++; }, 'push');
    assert.equal(updates, 1); assert.equal(r.transitions.length, 0); assert.equal(r.clones, 0); assert.equal(r.animations.length, 0); assert.equal(r.snapshots.length, 0); assert.equal(r.frames.size, 0);
    await settle(); assert.equal(r.root.dataset.motionUpdating, undefined); assert.equal(r.root.dataset.motionNavigation, undefined); assert.equal(r.clears, 1);
  }
});

test('MOBILE an invalid source suppresses alternate layer motion during its synchronous route commit and releases immediately', () => {
  const r = runtime({ active: false }); let updates = 0;
  r.api.motionUpdate(() => {
    updates++;
    assert.equal(r.root.dataset.motionUpdating, 'true', 'The route render must see that its motion decision is already owned.');
    assert.equal(r.root.dataset.motionNavigation, undefined, 'No alternate push/back visual is requested.');
  }, 'push');
  assert.equal(updates, 1); assert.equal(r.root.dataset.motionUpdating, undefined); assert.equal(r.clears, 1);
  assert.equal(r.transitions.length, 0); assert.equal(r.animations.length, 0); assert.equal(r.clones, 0); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0);
});

test('MOBILE an invalid asynchronous return keeps layer motion suppressed through POP and stale completion cannot clear newer flags', async () => {
  for (const superseded of [false, true]) {
    const r = runtime({ active: false, direction: 'return' }), pop = deferred(), current = deferred(), updates = [];
    r.api.motionUpdate(() => {
      assert.equal(r.root.dataset.motionUpdating, 'true'); updates.push('return POP'); return pop.promise;
    }, 'back');
    assert.deepEqual(updates, ['return POP']); assert.equal(r.root.dataset.motionUpdating, 'true'); assert.equal(r.clears, 0); assert.equal(r.transitions.length, 0);
    await settle(); assert.equal(r.root.dataset.motionUpdating, 'true', 'History work remains immediate while its asynchronous POP completion is pending.');
    if (superseded) r.api.motionUpdate(() => {
      assert.equal(r.root.dataset.motionUpdating, 'true'); updates.push('new route'); return current.promise;
    }, 'push');
    pop.resolve(); await settle();
    if (superseded) {
      assert.deepEqual(updates, ['return POP', 'new route']); assert.equal(r.root.dataset.motionUpdating, 'true'); assert.equal(r.clears, 0); assert.deepEqual(r.notices, []);
      current.resolve(); await settle();
    }
    assert.equal(r.root.dataset.motionUpdating, undefined); assert.equal(r.root.dataset.motionNavigation, undefined); assert.equal(r.clears, 1); assert.deepEqual(r.notices, ['portalink-motion-finished']);
    assert.equal(r.transitions.length, 0); assert.equal(r.animations.length, 0); assert.equal(r.clones, 0); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0);
  }
});

test('MOBILE reduced motion commits navigation immediately without native snapshots, clone or layout delay', () => {
  const r = runtime({ reduce: true }); let updates = 0;
  r.api.motionUpdate(() => { updates++; }, 'push');
  assert.equal(updates, 1); assert.equal(r.transitions.length, 0); assert.equal(r.clones, 0); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0); assert.equal(r.animations.length, 0); assert.equal(r.clears, 1);
});

test('MOBILE a valid opening with an unavailable destination skips the snapshot without a fallback entrance', async () => {
  const r = runtime({ results: [false] }); let updates = 0;
  r.api.motionUpdate(() => { updates++; }, 'push'); const transition = r.transitions[0];
  await transition.commit(); assert.equal(updates, 1); assert.equal(r.attempts, 1); assert.equal(transition.transition.skips, 1); assert.equal(r.frames.size, 0);
  transition.ready.reject(Error('Skipped invalid artwork pair')); await settle();
  assert.equal(r.clones, 0); assert.equal(r.animations.length, 0); assert.equal(r.snapshots.length, 0); assert.equal(r.clears, 1); assert.equal(r.root.dataset.motionUpdating, undefined);
  transition.finished.resolve(); await settle(); assert.equal(updates, 1); assert.equal(r.clears, 1);
});

test('MOBILE return can pair a catalogue card restored on its first layout frame', async () => {
  const r = runtime({ direction: 'return', results: [false, true] }); let updates = 0, completed = false;
  r.api.motionUpdate(() => { updates++; }, 'back'); const transition = r.transitions[0], completion = transition.commit();
  void Promise.resolve(completion).then(() => { completed = true; }); await settle();
  assert.equal(updates, 1); assert.equal(completed, false); assert.equal(r.attempts, 1); assert.equal(r.frames.size, 1); assert.equal(r.timers.size, 1);
  r.runFrame(); await completion;
  assert.equal(r.attempts, 2); assert.equal(transition.transition.skips, 0); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0); assert.deepEqual(r.beginnings, [['work', 'return']]);
  transition.ready.resolve(); transition.finished.resolve(); await settle(); assert.equal(r.clears, 1); assert.equal(r.animations.length, 0);
});

test('MOBILE return allows a second restoration frame and does not skip a valid late pair', async () => {
  const r = runtime({ direction: 'return', results: [false, false, true] }); let updates = 0;
  r.api.motionUpdate(() => { updates++; }, 'back'); const transition = r.transitions[0], completion = transition.commit();
  r.runFrame(); assert.equal(r.attempts, 2); assert.equal(r.frames.size, 1); assert.equal(transition.transition.skips, 0);
  r.runFrame(); await completion;
  assert.equal(updates, 1); assert.equal(r.attempts, 3); assert.equal(transition.transition.skips, 0); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0);
  transition.ready.resolve(); transition.finished.resolve(); await settle(); assert.equal(r.root.dataset.motionUpdating, undefined); assert.equal(r.clones, 0);
});

test('MOBILE return skips a card still missing after two layout frames and never creates an entrance fade', async () => {
  const r = runtime({ direction: 'return', results: [false] }); let updates = 0;
  r.api.motionUpdate(() => { updates++; }, 'back'); const transition = r.transitions[0], completion = transition.commit();
  r.runFrame(); r.runFrame(); await completion;
  assert.equal(updates, 1); assert.equal(r.attempts, 3); assert.equal(transition.transition.skips, 1); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0);
  transition.ready.reject(Error('Return artwork unavailable')); await settle();
  assert.equal(r.animations.length, 0); assert.equal(r.clones, 0); assert.equal(r.root.dataset.motionUpdating, undefined); assert.equal(r.clears, 1);
});

test('MOBILE a stalled requestAnimationFrame cannot hold the return snapshot beyond the 120ms bound', async () => {
  const r = runtime({ direction: 'return', results: [false] }); let updates = 0;
  r.api.motionUpdate(() => { updates++; }, 'back'); const transition = r.transitions[0], completion = transition.commit();
  assert.deepEqual([...r.timers.values()].map(timer => timer.duration), [120]); r.runTimer(); await completion;
  assert.equal(updates, 1); assert.equal(r.attempts, 1); assert.equal(transition.transition.skips, 1); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0);
  transition.ready.reject(Error('Bounded return wait elapsed')); await settle(); assert.equal(r.clears, 1); assert.equal(r.animations.length, 0);
});

test('MOBILE direct input before the next return frame settles its callback without marking a later destination', async () => {
  const r = runtime({ direction: 'return', results: [false] }); let updates = 0;
  r.api.motionUpdate(() => { updates++; }, 'back'); const transition = r.transitions[0], completion = transition.commit();
  r.api.interruptNavigationMotion(); const attempts = r.attempts; r.setResults([true]);
  r.runFrame(); await completion; transition.finished.resolve(); await settle();
  assert.equal(updates, 1); assert.equal(r.attempts, attempts); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0); assert.equal(r.root.dataset.motionUpdating, undefined); assert.equal(r.animations.length, 0); assert.equal(r.clones, 0);
  assert.equal(r.clears, 1); assert.deepEqual(r.notices, ['portalink-motion-finished']);
});

test('MOBILE interruption with stalled RAF still settles on its bound without changing a new navigation', async () => {
  const r = runtime({ direction: 'return', results: [false] }), updates = [];
  r.api.motionUpdate(() => { updates.push('old return'); }, 'back'); const old = r.transitions[0], oldCompletion = old.commit();
  r.api.interruptNavigationMotion(); r.setResults([true]);
  r.api.motionUpdate(() => { updates.push('new route'); }, 'dock'); const current = r.transitions[1]; current.commit();
  const attempts = r.attempts, clears = r.clears; assert.equal(r.root.dataset.motionNavigation, 'dock');
  r.runTimer(); await oldCompletion; old.finished.resolve(); await settle();
  assert.deepEqual(updates, ['old return', 'new route']); assert.equal(r.attempts, attempts); assert.equal(r.clears, clears); assert.equal(r.root.dataset.motionNavigation, 'dock'); assert.equal(r.frames.size, 0); assert.equal(r.timers.size, 0);
  current.ready.resolve(); current.finished.resolve(); await settle(); assert.equal(r.root.dataset.motionNavigation, undefined); assert.equal(r.clears, clears + 1);
});
