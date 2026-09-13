import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function harness(t, enabled = true) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const listeners = new Map(), cleanups = [];
  let previews = 0, selections = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/hooks/useLongPressPreview.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, setTimeout, clearTimeout,
    document: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: name => listeners.delete(name),
    },
    require: () => ({ useRef: value => ({ current: value }), useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } }),
  });
  const events = exports.useLongPressPreview(enabled, 'project-a', () => previews++, () => selections++);
  return { events, listeners, get previews() { return previews; }, get selections() { return selections; }, cleanup: () => cleanups.forEach(fn => fn()) };
}
function event(extra = {}) {
  return { isPrimary: true, button: 0, pointerId: 1, clientX: 50, clientY: 50,
    prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
}

test('short taps open the project; a 450ms hold previews and consumes its release click', t => {
  const h = harness(t), e = h.events;
  e.onPointerDown(event()); t.mock.timers.tick(100); e.onPointerUp(event()); e.onClick(event());
  t.mock.timers.tick(500);
  assert.equal(h.selections, 1); assert.equal(h.previews, 0);
  e.onPointerDown(event()); t.mock.timers.tick(449); assert.equal(h.previews, 0);
  t.mock.timers.tick(1); assert.equal(h.previews, 1);
  e.onContextMenu(event()); assert.equal(h.previews, 1, 'Native touch callout cannot open the completed hold twice');
  e.onPointerUp(event()); const release = event(); e.onClick(release);
  assert.equal(release.prevented, true); assert.equal(release.stopped, true); assert.equal(h.selections, 1);
  e.onPointerDown(event()); e.onPointerUp(event()); e.onClick(event());
  assert.equal(h.selections, 2);
  h.cleanup();
});

test('movement, native scrolling, a second finger, cancellation and unmount cancel pending previews', t => {
  const h = harness(t), e = h.events;
  const cancelActions = [
    () => e.onPointerMove(event({ clientY: 59 })),
    () => h.listeners.get('scroll')(),
    () => h.listeners.get('pointerdown')(event({ isPrimary: false, pointerId: 2 })),
    () => e.onPointerCancel(event()), () => e.onPointerLeave(event()), () => e.onLostPointerCapture(event()),
  ];
  for (const cancel of cancelActions) {
    const down = event(); e.onPointerDown(down); cancel(); t.mock.timers.tick(500);
    e.onContextMenu(event());
    assert.equal(down.prevented, false); assert.equal(h.previews, 0);
  }
  e.onPointerDown(event()); h.cleanup(); t.mock.timers.tick(500);
  assert.equal(h.previews, 0); assert.equal(h.listeners.size, 0);
});

test('movement also consumes a synthetic click after cancellation', t => {
  const h = harness(t), e = h.events;
  e.onPointerDown(event()); e.onPointerMove(event({ clientY: 65 }));
  e.onPointerUp(event()); e.onClick(event());
  assert.equal(h.selections, 0); h.cleanup();
});

test('keyboard context menu previews; Enter still opens normally; disabled presentation adds no handlers', t => {
  const h = harness(t), e = h.events;
  const key = event({ shiftKey: true, key: 'F10' }); e.onKeyDown(key);
  assert.equal(key.prevented, true); assert.equal(h.previews, 1);
  e.onKeyDown(event({ key: 'Enter' })); e.onClick(event()); assert.equal(h.selections, 1);
  h.cleanup();
});

test('disabled preview leaves the existing button untouched', t => {
  const h = harness(t, false);
  assert.equal(Object.keys(h.events).length, 0); assert.equal(h.listeners.size, 0);
});
