import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { motionFixture } from './helpers/motion-fixture.mjs';

function harness({ reduced = false, onClose = () => undefined } = {}) {
  const slots = [], effects = [], timers = new Map(), appended = [];
  const body = { append(element) { appended.push(element); element.host = body; } };
  let cursor = 0, now = 0, timerId = 0, dirty = true, value;
  const same = (left, right) => left && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, next => { slots[index].value = next; dirty = true; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const prior = slots[index];
        slots[index] = { deps };
        effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const { useSheetMotion: runSheetMotion } = sourceModule('src/presentation/motion/useSheetMotion.ts', {
    react,
    './motion': { motionMs: scale => reduced ? 0 : motionFixture.motionMs(scale) },
  }, {
    document: { body },
    setTimeout(callback, duration) {
      const id = ++timerId;
      timers.set(id, { callback, due: now + duration });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  const render = () => {
    cursor = 0; dirty = false;
    value = runSheetMotion(onClose);
    effects.splice(0).forEach(effect => effect());
    return value;
  };
  return {
    get value() { return dirty ? render() : value; },
    timers, appended, body,
    setOnClose(next) { onClose = next; dirty = true; return render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    advance(duration) {
      const end = now + duration;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); next[1].callback();
      }
      now = end;
    },
  };
}

function exitScene(h, themed, hosted) {
  const attributes = () => ({ style: {}, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } });
  const sheet = attributes(), nestedScrim = attributes();
  const clone = {
    ...attributes(), inert: false,
    matches(selector) { assert.equal(selector, '[data-motion-scrim]'); return !themed; },
    querySelector(selector) { return selector === '[data-motion-sheet]' ? sheet : selector === '[data-motion-scrim]' ? nestedScrim : null; },
    remove() { h.appended.splice(h.appended.indexOf(this), 1); },
  };
  let clones = 0;
  const parentElement = hosted ? { append(element) { h.appended.push(element); element.host = parentElement; } } : undefined;
  const scope = { parentElement, cloneNode(deep) { assert.equal(deep, true); clones++; return clone; } };
  const root = {
    ...scope,
    closest(selector) { assert.equal(selector, '[data-themed-portal]'); return themed ? scope : null; },
  };
  return { root, clone, sheet, host: parentElement ?? h.body, scrim: themed ? nestedScrim : clone, get clones() { return clones; } };
}

test('ordinary dismissal keeps the sheet closing for the full movement and ignores repeated close requests', () => {
  let closed = 0, action = 0;
  const h = harness({ onClose: () => closed++ });
  assert.equal(h.value.closing, false);
  h.value.close();
  assert.equal(h.value.closing, true);
  assert.equal(h.timers.size, 1);
  h.value.close(() => action++);
  assert.equal(action, 0); assert.equal(h.timers.size, 1);
  h.advance(259); assert.equal(closed, 0); assert.equal(h.value.closing, true);
  h.advance(1); assert.equal(closed, 1); assert.equal(h.timers.size, 0);
  h.value.close(); h.advance(260); assert.equal(closed, 1);
  h.unmount();
});

test('pending dismissal uses the latest callback and unmount cancels ordinary dismissal', () => {
  const callbacks = [];
  const h = harness({ onClose: () => callbacks.push('old') });
  const close = h.value.close;
  close();
  assert.equal(h.setOnClose(() => callbacks.push('latest')).close, close);
  h.advance(260); assert.deepEqual(callbacks, ['latest']); h.unmount();

  const disposed = harness({ onClose: () => callbacks.push('unmounted') });
  disposed.value.close(); assert.equal(disposed.timers.size, 1);
  disposed.unmount(); assert.equal(disposed.timers.size, 0);
  disposed.advance(260); assert.deepEqual(callbacks, ['latest']);
});

test('reduced motion dismisses immediately without a closing interval', () => {
  let closed = 0;
  const h = harness({ reduced: true, onClose: () => closed++ });
  h.value.close();
  assert.equal(closed, 1); assert.equal(h.value.closing, false); assert.equal(h.timers.size, 0);
  h.value.close(); assert.equal(closed, 1); h.unmount();
});

test('native-sensitive actions execute in the same call and leave only an inert exit clone through original unmount', () => {
  for (const themed of [false, true]) {
    for (const hosted of [false, true]) {
    let closed = 0, actions = 0, returned = false;
    const h = harness({ onClose: () => closed++ }), scene = exitScene(h, themed, hosted);
    h.value.close(() => {
      actions++;
      assert.equal(returned, false);
      assert.deepEqual(h.appended, [scene.clone]);
      assert.equal(scene.clone.host, scene.host, 'Exit clone retains stable CSS ancestry, falling back to body only without a parent');
      assert.equal(scene.clone.inert, true); assert.equal(scene.clone.attrs['aria-hidden'], 'true');
      assert.equal(scene.clone.style.pointerEvents, 'none');
      h.unmount();
    }, scene.root);
    returned = true;
    assert.equal(actions, 1); assert.equal(closed, 0); assert.equal(scene.clones, 1);
    assert.equal(scene.scrim.attrs['data-motion-closing'], 'true');
    assert.equal(scene.sheet.attrs['data-motion-closing'], 'true');
    assert.equal(scene.scrim.style.viewTransitionName, 'portalink-scrim-exit');
    assert.equal(scene.sheet.style.viewTransitionName, 'portalink-sheet-exit');
    assert.equal(h.timers.size, 1);
    h.value.close(() => actions++, scene.root); assert.equal(actions, 1); assert.equal(scene.clones, 1);
    h.advance(259); assert.deepEqual(h.appended, [scene.clone]);
    h.advance(1); assert.deepEqual(h.appended, []); assert.equal(h.timers.size, 0);
    }
  }
});

test('reduced-motion actions remain synchronous and never create an exit clone', () => {
  let actions = 0, returned = false;
  const h = harness({ reduced: true }), scene = exitScene(h, true);
  h.value.close(() => { actions++; assert.equal(returned, false); h.unmount(); }, scene.root);
  returned = true;
  assert.equal(actions, 1); assert.equal(scene.clones, 0); assert.deepEqual(h.appended, []); assert.equal(h.timers.size, 0);
});
