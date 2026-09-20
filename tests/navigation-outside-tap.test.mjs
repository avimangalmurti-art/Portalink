import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class Element {
  constructor(scope = 'content') { this.scope = scope; }
  closest(selector) { return selector.split(', ').includes(this.scope) ? this : null; }
}
function harness() {
  const listeners = new Map(), refs = [], exports = {};
  let cursor = 0, deps, pending, cleanup, closed = 0, inert = false;
  const layer = { current: { contains: target => target.scope === 'navigation', closest: () => inert } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useNavigationOutsideTap.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Element,
    window: {
      addEventListener(type, fn, options) { listeners.set(type, { fn, options }); },
      removeEventListener(type, fn, options) {
        assert.equal(listeners.get(type).fn, fn);
        const capture = options => Boolean(typeof options === 'object' ? options.capture : options);
        assert.equal(capture(listeners.get(type).options), capture(options));
        listeners.delete(type);
      },
    },
    require: () => ({
      useRef(value) { return refs[cursor++] ??= { current: value }; },
      useEffect(fn, next) { if (!deps || next.some((v, i) => v !== deps[i])) { pending = fn; deps = next; } },
    }),
  });
  return {
    listeners, layer,
    get closed() { return closed; },
    inert(value) { inert = value; },
    render(open = true, close = () => closed++) {
      cursor = 0; exports.useNavigationOutsideTap(open, layer, close);
      if (pending) { cleanup?.(); cleanup = pending(); pending = null; }
    },
    emit(type, target = new Element(), extra = {}, bubble) {
      const event = { target, pointerId: 1, button: 0, isPrimary: true, clientX: 200, clientY: 300,
        prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
      listeners.get(type)?.fn(event);
      if (!event.stopped) bubble?.(event);
      return event;
    },
    unmount() { cleanup?.(); cleanup = null; },
  };
}
const tap = (h, target) => {
  h.emit('pointerdown', target);
  const release = h.emit('pointerup', target);
  const click = h.emit('click', target);
  return { release, click };
};

test('an outside tap dismisses once and is consumed before page pointer-up and click handlers', () => {
  const h = harness(); h.render();
  const content = new Element();
  const down = h.emit('pointerdown', content, {}, () => assert.fail('Dismissal must not start a background drag or long-press'));
  assert.equal(down.prevented, false, 'Native panning remains available');
  assert.equal(down.stopped, true);
  assert.equal(h.emit('pointermove', content, { clientY: 304 }).stopped, false);
  const release = h.emit('pointerup', content, {}, () => assert.fail('Dismissal entered artwork double-tap or reading-mode handling'));
  assert.equal(release.stopped, true);
  assert.equal(release.prevented, false, 'Keep the following browser click');
  const click = h.emit('click', content, {}, () => assert.fail('Content activated behind sidebar'));
  assert.equal(click.prevented, true); assert.equal(click.stopped, true); assert.equal(h.closed, 1);
  assert.equal(h.emit('click', content).prevented, false, 'No stale dismissal');
  h.unmount();
});

test('panning, native scroll, wheel and pointer cancellation pass through and keep the rail open', () => {
  for (const [type, extra] of [['pointermove', { clientY: 360 }], ['pointercancel', {}], ['scroll', {}], ['wheel', {}], ['blur', {}]]) {
    const h = harness(); h.render();
    const down = h.emit('pointerdown'); assert.equal(down.prevented, false);
    const movement = h.emit(type, undefined, extra); assert.equal(movement.prevented || movement.stopped, false, type);
    const release = h.emit('pointerup'); assert.equal(release.prevented || release.stopped, false, type);
    assert.equal(h.emit('click').prevented, false); assert.equal(h.closed, 0);
    h.unmount();
  }
});

test('rail actions and portaled settings, menus and dialogs keep their gestures', () => {
  const h = harness(); h.render();
  for (const scope of ['navigation', '[role="menu"]', '[role="dialog"]', '[role="alertdialog"]', '.modal-scrim']) {
    const { release, click } = tap(h, new Element(scope));
    assert.equal(release.stopped || click.prevented || click.stopped, false, scope);
  }
  assert.equal(h.closed, 0); h.unmount();
});

test('inside-origin drags, large release movement, pinch and non-primary buttons are not outside taps', () => {
  const h = harness(); h.render();
  h.emit('pointerdown', new Element('navigation')); h.emit('pointerup'); h.emit('click');
  h.emit('pointerdown'); h.emit('pointerup', undefined, { clientY: 450 }); h.emit('click');
  h.emit('pointerdown'); h.emit('pointerdown', undefined, { isPrimary: false, pointerId: 2 }); h.emit('pointerup'); h.emit('click');
  h.emit('pointerdown', undefined, { button: 2 }); h.emit('pointerup'); h.emit('click');
  h.emit('pointerdown'); h.emit('pointerup', new Element('[role="dialog"]')); h.emit('click');
  assert.equal(h.closed, 0); h.unmount();
});

test('a fresh completed tap is required; inert navigation and keyboard activation are left alone', () => {
  const h = harness(); h.render();
  assert.equal(h.emit('click', undefined, { detail: 0 }).prevented, false);
  h.emit('pointerdown'); assert.equal(h.emit('click').prevented, false);
  h.emit('pointerdown'); assert.equal(h.emit('pointerup', undefined, { pointerId: 2 }).stopped, false);
  assert.equal(h.emit('click').prevented, false);
  h.inert(true); assert.equal(tap(h).click.prevented, false); h.inert(false);
  h.layer.current = null; assert.equal(tap(h).click.prevented, false);
  assert.equal(h.closed, 0); h.unmount();
});

test('only the open rail listens and cleanup removes all listeners; rerenders use the latest close callback', () => {
  const h = harness(); h.render(false); assert.equal(h.listeners.size, 0);
  h.render(); assert.equal(h.listeners.size, 8);
  assert.equal(h.listeners.get('pointerup').options, true, 'Window capture precedes document reading and React artwork handlers');
  for (const type of ['scroll', 'wheel']) assert.equal(h.listeners.get(type).options.passive, true);
  let next = 0; h.render(true, () => next++); tap(h); assert.equal(next, 1); assert.equal(h.closed, 0);
  h.render(false); assert.equal(h.listeners.size, 0);
  h.render(); h.unmount(); assert.equal(h.listeners.size, 0);
});
