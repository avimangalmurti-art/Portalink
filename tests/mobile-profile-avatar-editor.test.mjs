import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const avatarValidation = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/profile/avatarValidation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: avatarValidation });

function harness(options = {}) {
  const slots = [], busy = [], selections = [];
  let cursor = 0, dirty = true, effects = [], tree, disposed = false;
  let finishSelection, waitForSelection = false;
  let props = { pending: null, error: null, currentUrl: 'https://images.test/original.jpg', onBusyChange: (value) => busy.push(value),
    onSelect: async (file, framing) => {
      selections.push({ file, framing });
      if (waitForSelection) await new Promise((resolve) => { finishSelection = resolve; });
      props = { ...props, pending: { file, ...framing, previewUrl: 'blob:pending' } }; dirty = true;
    }, onClear: () => { props = { ...props, pending: null }; dirty = true; }, ...options };
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, (v) => { assert.equal(disposed, false); slots[i].value = v; dirty = true; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(effect, deps) { const i = cursor++, prior = slots[i]; if (!prior || !deps.every((v, k) => Object.is(v, prior.deps[k]))) { slots[i] = { deps }; effects.push(() => { prior?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/profile/MobileProfileAvatarEditor.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: module.exports, File, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'lucide-react') return { AlertCircleIcon: 'Alert', ImageIcon: 'Image', MoveIcon: 'Move', UploadIcon: 'Upload' };
    if (name.endsWith('/ResponsiveImage')) return { ResponsiveImage: 'Image' };
    if (name === './ProfilePhotoEditor') return { ProfilePhotoEditor: 'PhotoEditor' };
    if (name.endsWith('/avatarValidation')) return avatarValidation;
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name.endsWith('/ModalPortal')) return { ModalPortal: 'modal-portal' };
    if (name.endsWith('.css')) return {};
    throw Error(name);
  } });
  function walk(node, predicate) { if (!node || typeof node !== 'object') return null; if (Array.isArray(node)) { for (const child of node) { const found = walk(child, predicate); if (found) return found; } return null; } if (predicate(node)) return node; return walk(node.props?.children, predicate); }
  const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  function render() { cursor = 0; dirty = false; effects = []; tree = module.exports.MobileProfileAvatarEditor(props); effects.forEach((run) => run()); }
  function find(predicate) { if (dirty) render(); return walk(tree, predicate); }
  return { busy, selections, find, photo: () => find((n) => n.type === 'PhotoEditor'),
    button: (name) => find((n) => n.type === 'button' && text(n) === name),
    choose: (file) => find((n) => n.props?.type === 'file').props.onChange({ currentTarget: { files: [file], value: file.name } }),
    wait() { waitForSelection = true; }, finish: () => finishSelection(),
    async flush() { for (let i = 0; i < 20; i++) { if (dirty && !disposed) render(); await Promise.resolve(); } },
    dispose() { disposed = true; slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
const result = () => ({ blob: new Blob(['pixels'], { type: 'image/webp' }), crop: { x: .25, y: .25, width: .5, height: .5, zoom: 2 } });

test('Replace stages a photo in the only editor; Cancel does not alter the profile draft', async () => {
  const editor = harness(); await editor.flush();
  assert.equal(editor.find((n) => n.props?.type === 'range'), null, 'no duplicate outer zoom');
  const file = new File(['pixels'], 'photo.png', { type: 'image/png' });
  editor.choose(file); await editor.flush();
  assert.equal(editor.photo().props.source, file);
  assert.equal(editor.selections.length, 0);
  assert.equal(editor.busy.at(-1), true);
  editor.photo().props.onCancel(); await editor.flush();
  assert.equal(editor.photo(), null); assert.equal(editor.busy.at(-1), false);
  assert.equal(editor.selections.length, 0); assert.equal(editor.button('Undo photo changes'), null);
  editor.dispose();
});

test('Reposition saves once, awaits selection, retains the original and restores crop on reopen', async () => {
  const editor = harness(); await editor.flush(); editor.wait();
  editor.button('Reposition').props.onClick(); await editor.flush();
  const saving = editor.photo().props.onSave(result()); await editor.flush();
  assert.equal(editor.selections.length, 1); assert.equal(editor.busy.at(-1), true); assert.ok(editor.photo());
  editor.finish(); await saving; await editor.flush();
  assert.equal(editor.photo(), null); assert.equal(editor.busy.at(-1), false);
  assert.equal(editor.selections[0].framing.originalSource, 'https://images.test/original.jpg');
  editor.button('Reposition').props.onClick(); await editor.flush();
  assert.equal(editor.photo().props.initialCrop.zoom, 2);
  editor.photo().props.onCancel(); await editor.flush();
  assert.ok(editor.button('Undo photo changes'));
  editor.button('Undo photo changes').props.onClick(); await editor.flush();
  assert.equal(editor.button('Undo photo changes'), null);
  editor.dispose();
});

test('replacement Cancel keeps an earlier unsaved crop and its Undo option', async () => {
  const pending = { file: new File(['old'], 'old.webp'), previewUrl: 'blob:old', originalSource: 'original.jpg', crop: result().crop };
  const editor = harness({ pending }); await editor.flush();
  editor.choose(new File(['new'], 'new.png', { type: 'image/png' })); await editor.flush();
  editor.photo().props.onCancel(); await editor.flush();
  editor.button('Reposition').props.onClick(); await editor.flush();
  assert.equal(editor.photo().props.source, 'original.jpg'); assert.equal(editor.photo().props.initialCrop, pending.crop);
  assert.equal(editor.selections.length, 0); editor.dispose();
});

test('selection rejection leaves the photo transaction open for retry or Cancel', async () => {
  const editor = harness({ onSelect: async () => { throw Error('Read failed'); } }); await editor.flush();
  editor.button('Reposition').props.onClick(); await editor.flush();
  await assert.rejects(editor.photo().props.onSave(result()), /Read failed/);
  assert.ok(editor.photo()); assert.equal(editor.busy.at(-1), true);
  editor.photo().props.onCancel(); await editor.flush(); assert.equal(editor.busy.at(-1), false);
  editor.dispose();
});

test('unmount releases outer Save and a delayed selection cannot update the disposed editor', async () => {
  let finish;
  const editor = harness({ onSelect: () => new Promise((resolve) => { finish = resolve; }) }); await editor.flush();
  editor.button('Reposition').props.onClick(); await editor.flush();
  const saving = editor.photo().props.onSave(result()); editor.dispose(); finish(); await saving;
  assert.equal(editor.busy.at(-1), false);
});

test('unsupported or oversized originals are rejected before cropping can hide their type or size', async () => {
  for (const file of [new File(['svg'], 'image.svg', { type: 'image/svg+xml' }), new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]) {
    const editor = harness(); await editor.flush(); editor.choose(file); await editor.flush();
    assert.equal(editor.photo(), null); assert.equal(editor.selections.length, 0);
    assert.notEqual(editor.busy.at(-1), true); assert.ok(editor.find((n) => n.props?.role === 'alert'));
    editor.choose(new File(['valid'], 'valid.jpg', { type: 'image/jpeg' })); await editor.flush();
    assert.ok(editor.photo()); editor.dispose();
  }
});

test('a false selection result stays in the photo editor with a useful failure for its inline alert', async () => {
  const editor = harness({ onSelect: () => false }); await editor.flush();
  editor.button('Reposition').props.onClick(); await editor.flush();
  await assert.rejects(editor.photo().props.onSave(result()), /photo could not be prepared.*cancel and choose another image/);
  assert.ok(editor.photo()); assert.equal(editor.busy.at(-1), true);
  editor.photo().props.onCancel(); await editor.flush(); assert.equal(editor.busy.at(-1), false); editor.dispose();
});
