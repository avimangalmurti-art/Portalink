import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class Element {
  constructor(scope = 'content') { this.scope = scope; }
  closest(selector) { return selector.split(',').map(value => value.trim()).includes(this.scope) ? this : null; }
  focus() { assert.fail('Outside dismissal must not move focus'); }
  blur() { assert.fail('Outside dismissal must not blur content'); }
  setPointerCapture() { assert.fail('Outside dismissal must not capture the content pointer'); }
  releasePointerCapture() { assert.fail('Outside dismissal must not alter content pointer capture'); }
}
function harness() {
  const listeners = new Map(), refs = [], exports = {};
  let cursor = 0, deps, pending, cleanup, closed = 0, inert = false;
  const layer = { current: Object.assign(new Element('navigation'), { contains: target => target.scope === 'navigation', closest: () => inert }) };
  const document = { activeElement: new Element() };
  const window = {
    addEventListener(type, fn, options) { listeners.set(type, { fn, options }); },
    removeEventListener(type, fn, options) {
      assert.equal(listeners.get(type).fn, fn);
      const capture = options => Boolean(typeof options === 'object' ? options.capture : options);
      assert.equal(capture(listeners.get(type).options), capture(options));
      listeners.delete(type);
    },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useNavigationOutsideTap.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Element, document, window,
    require: () => ({
      useRef(value) { return refs[cursor++] ??= { current: value }; },
      useEffect(fn, next) { if (!deps || next.some((v, i) => v !== deps[i])) { pending = fn; deps = next; } },
    }),
  });
  return {
    listeners, layer, document, window,
    get closed() { return closed; },
    inert(value) { inert = value; },
    render(open = true, close = () => closed++) {
      cursor = 0; exports.useNavigationOutsideTap(open, layer, close);
      if (pending) { cleanup?.(); cleanup = pending(); pending = null; }
    },
    emit(type, target = new Element(), extra = {}, bubble) {
      const event = { type, target, currentTarget: target, pointerId: 1, button: 0, isPrimary: true, detail: 1, clientX: 200, clientY: 300,
        prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stopped = true; }, ...extra };
      listeners.get(type)?.fn(event);
      if (!event.stopped) bubble?.(event);
      return event;
    },
    unmount() { cleanup?.(); cleanup = null; },
  };
}
const assertPassive = (event, message = event.type) => {
  assert.equal(event.prevented, false, `${message}: native behavior must remain available`);
  assert.equal(event.stopped, false, `${message}: content must receive the original event`);
};

test('content pointerdown closes immediately once and preserves the original down, move, up and click flow', () => {
  const h = harness(); h.render();
  const content = new Element(), received = [];
  const down = h.emit('pointerdown', content, {}, event => {
    assert.equal(h.closed, 1, 'Navigation closes before the content press starts its own interaction');
    received.push(event);
  });
  assertPassive(down);
  assert.equal(received[0], down, 'Content receives the original pointerdown, not a replay');
  for (const [type, extra] of [['pointermove', { clientY: 360 }], ['pointerup', { clientY: 360 }], ['click', {}]]) {
    const event = h.emit(type, content, extra, value => received.push(value));
    assertPassive(event);
    assert.equal(received.at(-1), event);
  }
  assert.deepEqual(received.map(event => event.type), ['pointerdown', 'pointermove', 'pointerup', 'click']);
  assert.equal(h.closed, 1, 'A gesture may emit several events before React removes the open listeners');
  h.unmount();
});

test('keyboard and assistive content activation close once without consuming the action', () => {
  const h = harness(); h.render();
  let activated = 0;
  const event = h.emit('click', new Element(), { detail: 0 }, () => activated++);
  assertPassive(event);
  assert.equal(activated, 1);
  assert.equal(h.closed, 1);
  assertPassive(h.emit('click', new Element(), { detail: 0 }));
  assert.equal(h.closed, 1);
  h.unmount();
});

test('an inside-origin gesture ending over content does not turn its trailing click into outside dismissal', () => {
  const h = harness(); h.render();
  assertPassive(h.emit('click', new Element(), { detail: 1 }));
  assert.equal(h.closed, 0, 'Ordinary clicks rely on their original primary pointerdown');
  assertPassive(h.emit('pointerdown', new Element('navigation')));
  assertPassive(h.emit('pointermove', new Element(), { clientY: 450 }));
  assertPassive(h.emit('pointerup', new Element(), { clientY: 450 }));
  let activated = 0;
  assertPassive(h.emit('click', new Element(), { detail: 1 }, () => activated++));
  assert.equal(activated, 1);
  assert.equal(h.closed, 0);
  h.unmount();
});

test('content wheel and scroll close passively without waiting for a completed tap', () => {
  for (const type of ['wheel', 'scroll']) {
    for (const surface of ['element', 'document', 'window']) {
      const h = harness(); h.render();
      assert.equal(h.listeners.get(type).options.passive, true);
      let scrolled = 0;
      assertPassive(h.emit(type, surface === 'element' ? new Element() : h[surface], {}, () => scrolled++));
      assert.equal(h.closed, 1, `${type} on ${surface} must dismiss navigation`);
      assert.equal(scrolled, 1);
      assertPassive(h.emit(type));
      assert.equal(h.closed, 1);
      h.unmount();
    }
  }
});

test('navigation controls and portaled menus, dialogs and scrims retain their own gestures and scrolling', () => {
  for (const scope of ['navigation', '[role="menu"]', '[role="dialog"]', '[role="alertdialog"]', '.modal-scrim']) {
    const h = harness(); h.render();
    const target = new Element(scope), received = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'wheel', 'scroll']) {
      assertPassive(h.emit(type, target, {}, event => received.push(event.type)), `${scope} ${type}`);
    }
    assert.equal(received.length, 6);
    assert.equal(h.closed, 0, `${scope} must not dismiss the navigation underneath it`);
    h.unmount();
  }
});

test('multi-pointer gestures, cancellations and non-primary buttons are never intercepted', () => {
  const h = harness(); h.render();
  for (const extra of [{ isPrimary: false, pointerId: 2 }, { button: 2 }, { button: 1 }]) {
    assertPassive(h.emit('pointerdown', new Element(), extra));
  }
  assert.equal(h.closed, 0, 'Only the primary content press dismisses navigation');
  const delivered = [];
  for (const [type, extra] of [
    ['pointerdown', {}], ['pointerdown', { isPrimary: false, pointerId: 2 }],
    ['pointermove', { pointerId: 1, clientX: 160 }], ['pointermove', { pointerId: 2, clientX: 240 }],
    ['pointercancel', { pointerId: 1 }], ['pointerup', { pointerId: 2 }], ['click', { detail: 0 }],
  ]) assertPassive(h.emit(type, new Element(), extra, event => delivered.push(event)));
  assert.equal(delivered.length, 7, 'Pinch/drag recognizers retain every original contact and cancellation');
  assert.equal(h.closed, 1);
  h.unmount();
});

test('inert or missing navigation and non-element events do not dismiss or alter content', () => {
  const h = harness(); h.render();
  h.inert(true);
  for (const type of ['pointerdown', 'click', 'wheel', 'scroll']) assertPassive(h.emit(type));
  for (const target of [h.document, h.window]) assertPassive(h.emit('scroll', target));
  assert.equal(h.closed, 0, 'A modal owning inert navigation remains in charge');
  h.inert(false);
  for (const type of ['pointerdown', 'click', 'wheel', 'scroll']) assertPassive(h.emit(type, null));
  assert.equal(h.closed, 0);
  h.layer.current = null;
  for (const type of ['pointerdown', 'click', 'wheel', 'scroll']) assertPassive(h.emit(type));
  assert.equal(h.closed, 0);
  h.unmount();
});

test('closed navigation has no listeners; cleanup is complete and new openings use the latest close callback', () => {
  const h = harness(); h.render(false); assert.equal(h.listeners.size, 0);
  h.render();
  for (const type of ['pointerdown', 'click', 'wheel', 'scroll']) assert.ok(h.listeners.has(type));
  assert.equal(h.listeners.size, 4);
  for (const { options } of h.listeners.values()) {
    assert.equal(options.capture, true);
    assert.equal(options.passive, true);
  }
  for (const type of ['focus', 'focusin', 'blur']) assert.equal(h.listeners.has(type), false, 'Dismissal must not manage content focus');
  let next = 0;
  h.render(true, () => next++);
  assertPassive(h.emit('pointerdown'));
  assert.equal(next, 1); assert.equal(h.closed, 0);
  h.render(true, () => next += 10);
  assertPassive(h.emit('click', new Element(), { detail: 0 }));
  assert.equal(next, 1, 'Rerendering an already-dismissed opening does not re-arm it');
  h.render(false); assert.equal(h.listeners.size, 0);
  let contentReceived = false;
  assertPassive(h.emit('pointerdown', new Element(), {}, () => { contentReceived = true; }));
  assert.equal(contentReceived, true);
  h.render(true, () => next += 10);
  assertPassive(h.emit('click', new Element(), { detail: 0 }));
  assert.equal(next, 11, 'A genuinely reopened navigation can dismiss again');
  h.unmount(); assert.equal(h.listeners.size, 0);
});
