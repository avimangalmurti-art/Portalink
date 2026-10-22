import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { motionFixture } from './helpers/motion-fixture.mjs';

function harness({ reduced = false, onClose = () => undefined, scale } = {}) {
  const slots = [], effects = [], timers = new Map(), appended = [], listeners = new Map();
  const body = { append(element) { appended.push(element); element.host = body; } };
  const document = {
    body,
    addEventListener(name, callback, capture = false) {
      if (!listeners.has(name)) listeners.set(name, new Map());
      listeners.get(name).set(callback, capture);
    },
    removeEventListener(name, callback, capture = false) {
      assert.equal(listeners.get(name)?.get(callback), capture);
      listeners.get(name).delete(callback);
      if (!listeners.get(name).size) listeners.delete(name);
    },
    emit(name, event = {}) { for (const callback of [...(listeners.get(name)?.keys() ?? [])]) if (listeners.get(name)?.has(callback)) callback(event); },
  };
  let cursor = 0, now = 0, timerId = 0, dirty = true, value, flushes = 0;
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
    'react-dom': { flushSync(callback) { flushes++; callback(); } },
    './motion': { motionMs: scale => reduced ? 0 : motionFixture.motionMs(scale) },
  }, {
    document,
    getComputedStyle: element => ({ transform: element.transform ?? 'none', opacity: element.opacity ?? '1' }),
    setTimeout(callback, duration) {
      const id = ++timerId;
      timers.set(id, { callback, due: now + duration });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  const render = () => {
    cursor = 0; dirty = false;
    value = runSheetMotion(onClose, scale);
    effects.splice(0).forEach(effect => effect());
    return value;
  };
  return {
    get value() { return dirty ? render() : value; },
    timers, appended, body, document, listeners,
    get flushes() { return flushes; },
    setOnClose(next) { onClose = next; dirty = true; return render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    remount() { slots.forEach(slot => slot?.cleanup?.()); slots.length = 0; dirty = true; return render(); },
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
  const attributes = () => ({
    style: { setProperty(name, value) { this[name] = value; } }, attrs: { 'aria-modal': 'true' },
    setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; },
  });
  const sheet = attributes(), nestedScrim = attributes(), nestedModal = attributes();
  const sourceSheet = { transform: 'matrix(1, 0, 0, 1, 0, 97.5)' };
  let removals = 0;
  const clone = {
    ...attributes(), inert: false,
    matches(selector) { return selector === '[data-motion-scrim]' ? !themed : false; },
    querySelector(selector) { return selector === '[data-motion-sheet]' ? sheet : selector === '[data-motion-scrim]' ? nestedScrim : null; },
    querySelectorAll(selector) { assert.equal(selector, '[aria-modal]'); return [sheet, nestedModal]; },
    remove() { const index = h.appended.indexOf(this); if (index >= 0) h.appended.splice(index, 1); removals++; },
  };
  let clones = 0;
  const parentElement = hosted ? { append(element) { h.appended.push(element); element.host = parentElement; } } : undefined;
  const scope = { parentElement, cloneNode(deep) { assert.equal(deep, true); clones++; return clone; } };
  const root = {
    ...scope,
    opacity: '0.43',
    closest(selector) { assert.equal(selector, '[data-themed-portal]'); return themed ? scope : null; },
    matches(selector) { assert.ok(['[data-motion-sheet]', '[data-motion-scrim]'].includes(selector)); return selector === '[data-motion-scrim]'; },
    querySelector(selector) { assert.equal(selector, '[data-motion-sheet]'); return sourceSheet; },
  };
  return { root, clone, sheet, nestedModal, sourceSheet, host: parentElement ?? h.body, scrim: themed ? nestedScrim : clone, get clones() { return clones; }, get removals() { return removals; } };
}

function focusScene(h, onEscape = () => undefined) {
  class Element {
    isConnected = true;
    tabIndex = 0;
    children = [];
    matches() { return false; }
    closest() { return null; }
    getClientRects() { return [{}]; }
    contains(element) { return element === this || this.children.includes(element); }
    querySelectorAll() { return this.children; }
    focus(options) { this.focusOptions = options; h.document.activeElement = this; h.document.emit('focusin', { target: this }); }
  }
  const { containModalFocus } = sourceModule('src/hooks/useModalFocus.ts', { react: {} }, {
    document: h.document, HTMLElement: Element, getComputedStyle: () => ({ visibility: 'visible' }),
  });
  // Mirror effect ordering: the motion hook registers before the modal focus hook.
  void h.value;
  const opener = new Element(), dialog = new Element(), underlying = new Element();
  opener.focus();
  const release = containModalFocus(dialog, onEscape, true);
  return { opener, dialog, underlying, release };
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
  h.advance(1); assert.equal(closed, 1); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
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
  disposed.unmount(); assert.equal(disposed.timers.size, 0); assert.equal(disposed.listeners.size, 0);
  disposed.advance(260); assert.deepEqual(callbacks, ['latest']);
});

test('reduced motion dismisses immediately without a closing interval', () => {
  let closed = 0;
  const h = harness({ reduced: true, onClose: () => closed++ });
  h.value.close();
  assert.equal(closed, 1); assert.equal(h.value.closing, false); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
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
    assert.equal(scene.scrim.style['--motion-exit-opacity'], '0.43', 'Mid-entrance dismissal fades from the visible scrim opacity without flashing to full opacity');
    assert.equal(scene.sheet.style.viewTransitionName, 'portalink-sheet-exit');
    assert.equal(scene.sheet.style.transition, 'none');
    assert.equal(scene.sheet.style['--sheet-exit-transform'], scene.sourceSheet.transform, 'Exit retains the exact painted gesture/entrance position');
    for (const element of [scene.clone, scene.sheet, scene.nestedModal]) assert.equal(element.attrs['aria-modal'], undefined);
    assert.equal(h.timers.size, 1);
    assert.equal(h.listeners.get('pointerdown').size, 1); assert.equal(h.listeners.get('keydown').size, 1);
    h.value.close(() => actions++, scene.root); assert.equal(actions, 1); assert.equal(scene.clones, 1);
    h.advance(259); assert.deepEqual(h.appended, [scene.clone]);
    h.advance(1); assert.deepEqual(h.appended, []); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(scene.removals, 1);
    }
  }
});

test('reduced-motion actions remain synchronous and never create an exit clone', () => {
  let actions = 0, returned = false;
  const h = harness({ reduced: true }), scene = exitScene(h, true);
  h.value.close(() => { actions++; assert.equal(returned, false); h.unmount(); }, scene.root);
  returned = true;
  assert.equal(actions, 1); assert.equal(scene.clones, 0); assert.deepEqual(h.appended, []); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('the next pointer or key cancels a decorative exit after original unmount without consuming input', () => {
  for (const event of ['pointerdown', 'keydown']) {
    const h = harness(), scene = exitScene(h, true, true);
    h.value.close(() => h.unmount(), scene.root);
    assert.equal(h.timers.size, 1); assert.equal(h.listeners.size, 2);
    const input = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    h.document.emit(event, input);
    assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined);
    assert.deepEqual(h.appended, []); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
    h.advance(260); assert.equal(scene.removals, 1, 'Cancellation also clears natural-completion work');
  }
});

test('opening another sheet releases a prior decorative exit without duplicate transition names or listeners', () => {
  const h = harness(), first = exitScene(h, true, true);
  h.value.close(() => h.unmount(), first.root);
  h.advance(40); assert.equal(h.appended.length, 1);
  h.remount();
  assert.equal(first.removals, 1); assert.equal(h.listeners.size, 2); assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.get('pointerdown').size, 1); assert.equal(h.listeners.get('keydown').size, 1, 'Only the new real sheet owns interruption listeners');
  const second = exitScene(h, true, true);
  h.value.close(() => h.unmount(), second.root);
  assert.deepEqual(h.appended, [second.clone]); assert.equal(h.timers.size, 1);
  h.document.emit('pointerdown');
  assert.equal(second.removals, 1); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
});

test('Actions dismissal restores the real focus trap immediately while only inert artwork exits', () => {
  const h = harness(), scene = exitScene(h, true, true);
  const { opener, dialog, underlying, release } = focusScene(h);
  assert.equal(h.document.activeElement, dialog);
  let returned = false;
  h.value.close(() => {
    release(); h.unmount();
    assert.equal(returned, false); assert.equal(h.document.activeElement, opener);
    assert.equal(opener.focusOptions.preventScroll, true);
  }, scene.root);
  returned = true;
  assert.equal(h.value.closing, false);
  underlying.focus(); assert.equal(h.document.activeElement, underlying, 'Decorative exit retains no focus containment');
  assert.equal(h.listeners.has('focusin'), false); assert.equal(h.listeners.get('keydown').size, 1, 'Only non-consuming decorative cancellation remains');
  h.document.emit('keydown', { key: 'Tab' });
  assert.equal(h.document.activeElement, underlying); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
});

test('ordinary settling can finish on the next input once using the latest callback, with no remaining timer or listeners', () => {
  for (const name of ['pointerdown', 'keydown']) {
    const calls = [], h = harness({ onClose: () => calls.push('old') });
    h.value.close(); h.advance(40);
    h.setOnClose(() => calls.push('latest'));
    const input = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    h.document.emit(name, input);
    assert.deepEqual(calls, ['latest']); assert.equal(h.flushes, 1);
    assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined);
    assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
    h.document.emit(name, input); h.value.close(); h.advance(260);
    assert.deepEqual(calls, ['latest']); assert.equal(h.flushes, 1); h.unmount();
  }
});

test('the initiating Escape keeps ordinary settle, and the next Tab releases focus before the old trap can consume it', () => {
  let closed = 0;
  const h = harness(), focus = focusScene(h, () => h.value.close());
  h.setOnClose(() => { closed++; focus.release(); h.unmount(); });
  const key = value => ({ key: value, target: focus.dialog, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } });
  const escape = key('Escape');
  h.document.emit('keydown', escape);
  assert.equal(escape.defaultPrevented, true); assert.equal(closed, 0); assert.equal(h.flushes, 0);
  assert.equal(h.timers.size, 1); assert.equal(h.document.activeElement, focus.dialog);
  h.advance(40);
  const tab = key('Tab');
  h.document.emit('keydown', tab);
  assert.equal(tab.defaultPrevented, undefined, 'The old trap does not prevent the input that interrupts settling');
  assert.equal(closed, 1); assert.equal(h.flushes, 1); assert.equal(h.document.activeElement, focus.opener);
  assert.equal(focus.opener.focusOptions.preventScroll, true);
  assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  h.advance(260); assert.equal(closed, 1);
});

test('an explicitly base-timed sheet closes after180ms while ordinary sheets retain the260ms default', () => {
  for (const [scale, duration] of [['base', 180], [undefined, 260]]) {
    let closed = 0; const h = harness({ scale, onClose: () => closed++ });
    h.value.close(); assert.equal(h.value.closing, true); h.advance(duration - 1); assert.equal(closed, 0);
    h.advance(1); assert.equal(closed, 1); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); h.unmount();
  }
});

test('explicit finish releases either an idle or a settling sheet exactly once without waiting or replaying its timer', () => {
  for (const pending of [false, true]) {
    let closed = 0; const h = harness({ scale: 'base', onClose: () => closed++ });
    if (pending) h.value.close();
    const stale = [...h.timers.values()][0]?.callback;
    h.value.finish(); assert.equal(closed, 1); assert.equal(h.flushes, 1); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
    h.value.finish(); h.value.close(); stale?.(); h.advance(260); assert.equal(closed, 1); h.unmount();
  }
});

test('finish after a synchronous action never invokes the ordinary onClose callback or repeats the action', () => {
  let closed = 0, actions = 0; const h = harness({ scale: 'base', onClose: () => closed++ });
  h.value.close(() => actions++); h.value.finish(); h.value.close(() => actions++);
  assert.equal(actions, 1); assert.equal(closed, 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); h.unmount();
});

test('a queued ordinary completion from an unmounted sheet cannot close a reopened sheet', () => {
  let closed = 0; const h = harness({ scale: 'base', onClose: () => closed++ });
  h.value.close(); const stale = [...h.timers.values()][0].callback; h.unmount(); h.remount();
  stale(); assert.equal(closed, 0); assert.equal(h.value.closing, false);
  h.value.close(); stale(); assert.equal(closed, 0); assert.equal(h.timers.size, 1);
  h.advance(180); assert.equal(closed, 1); assert.equal(h.listeners.size, 0); h.unmount();
});
