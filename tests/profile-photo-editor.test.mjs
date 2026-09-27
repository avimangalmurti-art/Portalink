import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(options = {}) {
  const slots = [], saves = [], drawCalls = [], pendingExports = [];
  let cursor = 0, dirty = true, tree, effects = [], fail = false, hold = false, cancelled = 0, disposed = false;
  let props = { source: 'https://images.test/photo.jpg', onSave: (result) => saves.push(result), onCancel: () => cancelled++, ...options };
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, (v) => { assert.equal(disposed, false); const next = typeof v === 'function' ? v(slots[i].value) : v; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; } }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; }, useId() { return `id-${cursor++}`; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || !deps.every((v, k) => Object.is(v, old.deps[k]))) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  class LoadedImage { naturalWidth = 2400; naturalHeight = 1600; set src(value) { this.url = value; Promise.resolve().then(() => this.onload?.()); } get src() { return this.url; } }
  const node = { getBoundingClientRect: () => ({ width: 300, height: 300, left: 0, top: 0 }), addEventListener() {}, removeEventListener() {}, focus() {}, setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
  const globals = { Blob, URL, Image: LoadedImage, ResizeObserver: class { observe() {} disconnect() {} }, document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage(...args) { drawCalls.push(args); } }), toBlob(done) { if (fail) throw Error('SecurityError'); const finish = () => done(new Blob(['pixels'], { type: 'image/webp' })); if (hold) pendingExports.push(finish); else finish(); } }) } };
  function load(file, require) { const exports = {}; vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require, ...globals }); return exports; }
  const geometry = load('../src/utils/imageCrop.ts');
  const Component = load('../src/components/profile/ProfilePhotoEditor.tsx', (name) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'lucide-react') return { RotateCcwIcon: 'ResetIcon' };
    if (name.endsWith('/imageCrop')) return geometry;
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name.endsWith('/ModalPortal')) return { ModalPortal: 'Portal' };
    if (name.endsWith('.css')) return {};
    throw Error(name);
  }).ProfilePhotoEditor;
  function walk(n, predicate) { if (!n || typeof n !== 'object') return null; if (Array.isArray(n)) { for (const c of n) { const r = walk(c, predicate); if (r) return r; } return null; } if (predicate(n)) return n; return walk(n.props?.children, predicate); }
  const text = (n) => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : n?.props ? text(n.props.children) : '';
  function render() { cursor = 0; dirty = false; effects = []; tree = Component(props); walk(tree, (n) => { if (n.props?.ref) n.props.ref.current = node; return false; }); effects.forEach((run) => run()); }
  function find(predicate) { if (dirty) render(); return walk(tree, predicate); }
  function pointer(kind, id, x, y) { find((n) => n.props?.className === 'profile-photo-frame').props[`onPointer${kind}`]({ pointerId: id, clientX: x, clientY: y, currentTarget: node, button: 0, isPrimary: id === 1, preventDefault() {} }); }
  return { saves, drawCalls, find, pointer,
    button: (name) => find((n) => n.type === 'button' && text(n) === name),
    zoom: (value) => find((n) => n.props?.type === 'range').props.onChange({ currentTarget: { value: String(value) } }),
    zoomValue: () => find((n) => n.props?.type === 'range').props.value,
    imageStyle: () => find((n) => n.type === 'img').props.style,
    async flush() { for (let i = 0; i < 30; i++) { if (dirty && !disposed) render(); await Promise.resolve(); } },
    fail() { fail = true; }, hold() { hold = true; }, finish() { pendingExports.splice(0).forEach((run) => run()); },
    options(next) { props = { ...props, ...next }; dirty = true; },
    dispose() { disposed = true; slots.forEach((slot) => slot?.cleanup?.()); }, get cancelled() { return cancelled; },
  };
}
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('one-finger pan reaches all four source corners; saved bitmap matches the visible crop', async () => {
  for (const [dx, dy, right, bottom] of [[1000, 1000, false, false], [-1000, 1000, true, false], [1000, -1000, false, true], [-1000, -1000, true, true]]) {
    const editor = harness(); await editor.flush(); editor.zoom(2); await editor.flush();
    editor.pointer('Down', 1, 150, 150); editor.pointer('Move', 1, 150 + dx, 150 + dy); editor.pointer('Up', 1, 150 + dx, 150 + dy); await editor.flush();
    const style = editor.imageStyle(); editor.button('Save').props.onClick(); await editor.flush();
    assert.equal(editor.saves.length, 1); const { crop } = editor.saves[0];
    closeTo(crop.x, right ? 1 - crop.width : 0); closeTo(crop.y, bottom ? 1 - crop.height : 0);
    closeTo(parseFloat(style.left), -100 * crop.x / crop.width); closeTo(parseFloat(style.top), -100 * crop.y / crop.height);
    const [, x, y, width, height] = editor.drawCalls[0];
    closeTo(x, crop.x * 2400); closeTo(y, crop.y * 1600); closeTo(width, crop.width * 2400); closeTo(height, crop.height * 1600);
    editor.dispose();
  }
});

test('second non-primary finger pinches around its midpoint, then either remaining finger can pan', async () => {
  const editor = harness(); await editor.flush();
  editor.pointer('Down', 1, 100, 150); editor.pointer('Down', 2, 200, 150);
  editor.pointer('Move', 1, 50, 150); editor.pointer('Move', 2, 250, 150); await editor.flush();
  closeTo(editor.zoomValue(), 2);
  editor.button('Save').props.onClick(); await editor.flush();
  const crop = editor.saves[0].crop; closeTo(crop.x + crop.width / 2, .5); closeTo(crop.y + crop.height / 2, .5);
  // Saving clears gestures; begin fresh with two fingers and release the first.
  editor.pointer('Down', 1, 100, 150); editor.pointer('Down', 2, 200, 150); editor.pointer('Up', 1, 100, 150);
  const before = editor.imageStyle().left; editor.pointer('Move', 2, 240, 150); await editor.flush();
  assert.notEqual(editor.imageStyle().left, before); closeTo(editor.zoomValue(), 2); editor.dispose();
});

test('two-finger translation pans without changing final scale; cancelled pointers no longer move crop', async () => {
  const editor = harness(); await editor.flush(); editor.zoom(2); await editor.flush();
  const before = editor.imageStyle().left;
  editor.pointer('Down', 1, 100, 100); editor.pointer('Down', 2, 200, 100);
  editor.pointer('Move', 1, 120, 120); editor.pointer('Move', 2, 220, 120); await editor.flush();
  closeTo(editor.zoomValue(), 2); assert.notEqual(editor.imageStyle().left, before);
  editor.pointer('Cancel', 1, 120, 120); editor.pointer('Cancel', 2, 220, 120);
  const stopped = editor.imageStyle().left; editor.pointer('Move', 1, 240, 240); editor.pointer('Move', 2, 300, 240); await editor.flush();
  assert.equal(editor.imageStyle().left, stopped); editor.dispose();
});

test('lost capture removes only that finger and rebases the remaining drag without a jump', async () => {
  const editor = harness(); await editor.flush(); editor.zoom(2); await editor.flush();
  editor.pointer('Down', 1, 100, 150); editor.pointer('Down', 2, 200, 150);
  editor.find((n) => n.props?.className === 'profile-photo-frame').props.onLostPointerCapture({ pointerId: 1 });
  const before = editor.imageStyle(); editor.pointer('Move', 1, -1000, -1000); await editor.flush();
  assert.deepEqual(editor.imageStyle(), before);
  editor.pointer('Move', 2, 220, 150); await editor.flush(); closeTo(editor.zoomValue(), 2);
  assert.notEqual(editor.imageStyle().left, before.left); editor.dispose();
});

test('two-finger pan never changes scale at either zoom limit, regardless of pointer event order', async () => {
  for (const zoom of [1, 3]) {
    for (const reverse of [false, true]) {
      const editor = harness(); await editor.flush(); editor.zoom(zoom); await editor.flush();
      editor.pointer('Down', 1, 100, 100); editor.pointer('Down', 2, 200, 100);
      for (let delta = 10; delta <= 50; delta += 10) {
        const events = [[1, 100 + delta, 100 + delta], [2, 200 + delta, 100 + delta]];
        for (const move of reverse ? events.reverse() : events) editor.pointer('Move', ...move);
        await editor.flush(); closeTo(editor.zoomValue(), zoom);
      }
      editor.dispose();
    }
  }
});

test('clamped pinch uses its original baseline so returning fingers restores the exact starting crop', async () => {
  const editor = harness(); await editor.flush(); editor.zoom(2); await editor.flush();
  const initial = editor.imageStyle();
  editor.pointer('Down', 1, 100, 150); editor.pointer('Down', 2, 200, 150);
  editor.pointer('Move', 1, -100, 150); editor.pointer('Move', 2, 400, 150); await editor.flush(); closeTo(editor.zoomValue(), 3);
  editor.pointer('Move', 1, 100, 150); editor.pointer('Move', 2, 200, 150); await editor.flush();
  closeTo(editor.zoomValue(), 2); assert.deepEqual(editor.imageStyle(), initial); editor.dispose();
});

test('Reset restores default position and zoom; Cancel never exports or saves', async () => {
  const editor = harness(); await editor.flush(); const initial = editor.imageStyle();
  editor.zoom(2.5); editor.pointer('Down', 1, 150, 150); editor.pointer('Move', 1, 20, 20); await editor.flush();
  editor.button('Reset').props.onClick(); await editor.flush(); closeTo(editor.zoomValue(), 1); assert.deepEqual(editor.imageStyle(), initial);
  editor.button('Cancel').props.onClick(); assert.equal(editor.cancelled, 1); assert.equal(editor.saves.length, 0); assert.equal(editor.drawCalls.length, 0); editor.dispose();
});

test('Save is transactional, disables Cancel during export/selection, and does not duplicate writes', async () => {
  let finish; const results = [];
  const editor = harness({ onSave: async (result) => { results.push(result); await new Promise((resolve) => { finish = resolve; }); } });
  await editor.flush(); editor.hold(); editor.button('Save').props.onClick(); editor.button('Saving…').props.onClick(); await editor.flush();
  assert.equal(editor.drawCalls.length, 1); assert.equal(editor.button('Cancel').props.disabled, true);
  editor.button('Cancel').props.onClick(); assert.equal(editor.cancelled, 0);
  editor.finish(); await editor.flush(); assert.equal(results.length, 1); assert.equal(editor.button('Cancel').props.disabled, true);
  finish(); await editor.flush(); assert.equal(editor.button('Cancel').props.disabled, false); editor.dispose();
});

test('export failure keeps framing editable and reports error without saving', async () => {
  const editor = harness(); await editor.flush(); editor.zoom(2.4); editor.fail(); editor.button('Save').props.onClick(); await editor.flush();
  assert.equal(editor.saves.length, 0); assert.ok(editor.find((n) => n.props?.role === 'alert')); closeTo(editor.zoomValue(), 2.4);
  assert.equal(editor.button('Cancel').props.disabled, false); editor.dispose();
});

test('a bitmap completing after source replacement or unmount cannot save stale pixels', async () => {
  for (const unmount of [false, true]) {
    const editor = harness(); await editor.flush(); editor.hold(); editor.button('Save').props.onClick(); await editor.flush();
    if (unmount) editor.dispose(); else { editor.options({ source: 'replacement.jpg' }); await editor.flush(); }
    editor.finish(); await editor.flush(); assert.equal(editor.saves.length, 0); if (!unmount) editor.dispose();
  }
});
