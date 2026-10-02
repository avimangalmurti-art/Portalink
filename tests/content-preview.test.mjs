import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function compile(path, require, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require, document: { addEventListener() {}, removeEventListener() {} }, ...globals });
  return exports;
}
function harness() {
  let cursor = 0;
  const slots = [];
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; slots[i] ??= value; return [slots[i], (next) => { slots[i] = next; }]; },
    useEffect() {},
  };
  const { useContentPreview } = compile('../src/hooks/useContentPreview.ts', () => react);
  const render = (disabled = false, minimumWidth = 0, directTouch = false) => { cursor = 0; return useContentPreview(disabled, minimumWidth, directTouch); };
  return { render };
}
const click = () => ({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
function touch(preview, moved = false) {
  preview.events.onPointerDownCapture({ pointerType: 'touch', clientX: 10, clientY: 10 });
  if (moved) preview.events.onPointerMoveCapture({ pointerType: 'touch', clientX: 10, clientY: 50 });
  preview.events.onPointerUpCapture();
}

test('touch focus cannot turn the first tap into navigation; the second tap opens', () => {
  const h = harness(); let p = h.render(); let opened = 0;
  touch(p);
  p.events.onFocusCapture({ target: { matches: () => true } });
  p = h.render();
  const first = click(); p.open(first, () => opened++);
  assert.equal(first.prevented, true); assert.equal(opened, 0); assert.equal(h.render().expanded, true);
  p = h.render(); touch(p); p.open(click(), () => opened++);
  assert.equal(opened, 1);
});

test('scrolling and cancelled touch gestures do not preview or navigate even if a click follows', () => {
  for (const cancel of [false, true]) {
    const h = harness(); const p = h.render(); let opened = false;
    touch(p, true);
    if (cancel) p.events.onPointerCancel();
    const event = click(); p.open(event, () => { opened = true; });
    assert.equal(event.prevented, true); assert.equal(opened, false); assert.equal(h.render().expanded, false);
  }
});

test('mouse hover and keyboard activation preserve direct navigation', () => {
  const h = harness(); let p = h.render();
  p.events.onPointerMoveCapture({ pointerType: 'mouse' }); assert.equal(h.render().expanded, true);
  p.events.onPointerLeave({ pointerType: 'mouse' }); assert.equal(h.render().expanded, false);
  p.events.onPointerCancel(); p.events.onKeyDown({ key: 'Enter' });
  let opened = false; p.open(click(), () => { opened = true; }); assert.equal(opened, true);
});

test('tiny project thumbnails open directly and cannot expand overflowing text or actions', () => {
  const h = harness(); let p = h.render(false, 80); let opened = 0;
  p.ref.current = { getBoundingClientRect: () => ({width:24}) };
  p.events.onPointerMoveCapture({pointerType:'mouse'});
  p.events.onFocusCapture({target:{matches:()=>true}});
  assert.equal(h.render(false,80).expanded,false);
  touch(p); p.open(click(),()=>opened++);
  assert.equal(opened,1); assert.equal(h.render(false,80).expanded,false);
  touch(p,true); p.open(click(),()=>opened++); assert.equal(opened,1,'scrolling cannot navigate');
  p.ref.current = { getBoundingClientRect: () => ({width:150}) };
  p=h.render(false,80); touch(p); p.open(click(),()=>opened++);
  assert.equal(opened,1); assert.equal(h.render(false,80).expanded,true,'larger cards retain touch previews');
});

test('zooming an expanded preview down to a tiny thumbnail closes its description and actions', () => {
  const slots = []; let cursor = 0, pending = [], cleanup = [], resized, disconnected = false;
  const { useContentPreview } = compile('../src/hooks/useContentPreview.ts', () => ({
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = next; }]; },
    useEffect(fn) { pending.push(fn); },
  }), { ResizeObserver: class {
    constructor(fn) { resized = fn; }
    observe() {}
    disconnect() { disconnected = true; }
  } });
  const render = () => {
    cursor = 0; pending = [];
    const p = useContentPreview(false, 80);
    cleanup.forEach(fn => fn?.()); cleanup = pending.map(fn => fn());
    return p;
  };
  let p = render();
  p.ref.current = { getBoundingClientRect: () => ({ width: 150 }) };
  touch(p); p.open(click(), () => assert.fail('First tap should preview'));
  assert.equal(render().expanded, true);
  resized([{ contentRect: { width: 24 } }]);
  assert.equal(render().expanded, false);
  assert.equal(disconnected, true);
});

test('Escape dismisses a touch preview and leaves nested editor handling alone', () => {
  const h = harness(); let p = h.render(); touch(p); p.open(click(), () => assert.fail());
  p = h.render(); p.events.onKeyDown({ key: 'Escape' }); assert.equal(h.render().expanded, false);
  p = h.render(true); p.events.onKeyDown({ key: 'Escape', defaultPrevented: true });
  assert.equal(h.render(true).expanded, false);
});

const { layoutBento } = compile('../src/utils/bentoLayout.ts', () => ({}));

test('mobile artwork opens on its first tap at every density; scrolling still never opens it', () => {
  for (const width of [24, 150, 300]) {
    const h = harness(); let p = h.render(false, 80, true); let opened = 0;
    p.ref.current = { getBoundingClientRect: () => ({ width }) };
    touch(p); p.open(click(), () => opened++);
    assert.equal(opened, 1);
    p = h.render(false, 80, true);
    assert.equal(p.expanded, false);
    touch(p, true); const event = click(); p.open(event, () => opened++);
    assert.equal(opened, 1); assert.equal(event.prevented, true);
  }
});

test('mobile details control opens and closes the preview without consuming the next artwork tap', () => {
  for (const width of [64, 88, 112, 150]) {
  const h = harness(); let p = h.render(false, 0, true); let opened = 0;
  p.ref.current = { getBoundingClientRect: () => ({ width }) };
  p.toggleDetails(); p = h.render(false, 0, true); assert.equal(p.expanded, true);
  p.toggleDetails(); p = h.render(false, 0, true); assert.equal(p.expanded, false);
  touch(p, true); p.toggleDetails(); assert.equal(h.render(false, 0, true).expanded, false, 'scrolling cannot open details');
  p.events.onPointerCancel(); p.toggleDetails(); assert.equal(h.render(false, 0, true).expanded, false, 'cancelled touch cannot open details');
  touch(p); p.open(click(), () => opened++); assert.equal(opened, 1);
  p = h.render(true, 0, true); p.toggleDetails(); assert.equal(h.render(true, 0, true).expanded, false);
  }
});
function overlaps(a, b, cells) {
  return a.row < b.row + b.rows && b.row < a.row + a.rows &&
    a.column < b.column + cells[1].span && b.column < a.column + cells[0].span;
}
test('expansion preserves dense column slots, avoids overlap, and restores exactly', () => {
  const cells = [
    { key: 'portrait', span: 1, baseRows: 31, rows: 31 },
    { key: 'wide', span: 2, baseRows: 17, rows: 17 },
    { key: 'backfill', span: 1, baseRows: 8, rows: 8 },
    { key: 'landscape', span: 2, baseRows: 20, rows: 20 },
    { key: 'last', span: 1, baseRows: 26, rows: 26 },
  ];
  const baseline = layoutBento(cells, 3);
  for (let expanded = 0; expanded < cells.length; expanded++) {
    const layout = layoutBento(cells.map((c, i) => ({ ...c, rows: c.rows + (i === expanded ? 24 : 0) })), 3);
    cells.forEach(c => assert.equal(layout.get(c.key).column, baseline.get(c.key).column));
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
      assert.equal(overlaps(layout.get(cells[a].key), layout.get(cells[b].key), [cells[a], cells[b]]), false);
    }
  }
  assert.equal(JSON.stringify([...layoutBento(cells, 3)]), JSON.stringify([...baseline]));
});
