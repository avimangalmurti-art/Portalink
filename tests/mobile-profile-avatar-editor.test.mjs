import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

/** Real component handlers and crop geometry, with controlled image/selection completion. */
function avatarEditorHarness(options = {}) {
  const slots = [];
  const busy = [];
  const selections = [];
  const exportsWaiting = [];
  const selectionsWaiting = [];
  const timers = new Map();
  let cursor = 0, dirty = true, tree, effects = [], disposed = false, updatesAfterDispose = 0;
  let holdExports = false, holdSelections = false, failExport = false, nextTimer = 0;
  let props = {
    pending: null, error: null, currentUrl: 'https://images.test/original.jpg',
    onBusyChange(value) { busy.push(value); },
    onSelect(file, framing) {
      selections.push({ file, framing });
      const apply = () => {
        props = { ...props, pending: { file, ...framing, previewUrl: 'blob:pending', fileName: file.name, sizeBytes: file.size, isPersisted: false } };
        dirty = true;
      };
      if (holdSelections) return new Promise((resolve) => selectionsWaiting.push(() => { apply(); resolve(); }));
      apply();
    },
    onClear() { props = { ...props, pending: null }; dirty = true; },
    ...options,
  };
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
        if (disposed) updatesAfterDispose += 1;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useId() { return `avatar-${cursor++}`; },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(deps, slots[index].deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || !sameDeps(deps, previous.deps)) {
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  class LoadedImage {
    naturalWidth = 2400;
    naturalHeight = 1600;
    set src(value) { this.url = value; Promise.resolve().then(() => this.onload?.()); }
    get src() { return this.url; }
  }
  const canvas = () => ({
    width: 0, height: 0, getContext: () => ({ drawImage() { /* Geometry is exercised by the real crop utilities. */ } }),
    toBlob(done) {
      if (failExport) throw Error('SecurityError');
      const finish = () => done(new Blob(['pixels'], { type: 'image/webp' }));
      if (holdExports) exportsWaiting.push(finish);
      else finish();
    },
  });
  const globals = {
    Blob, File, Image: LoadedImage, URL,
    document: { createElement: () => canvas() },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  function load(path, require) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { exports, require, ...globals });
    return exports;
  }
  const geometry = load('../src/utils/imageCrop.ts');
  const Component = load('../src/components/profile/MobileProfileAvatarEditor.tsx', (name) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'lucide-react') return { AlertCircleIcon: 'Alert', ImageIcon: 'Image', MoveIcon: 'Move', UploadIcon: 'Upload' };
    if (name.endsWith('/imageCrop')) return geometry;
    if (name.endsWith('/ImageRepositionDialog')) return { ImageRepositionDialog: 'ImageRepositionDialog' };
    if (name.endsWith('/ResponsiveImage')) return { ResponsiveImage: 'ResponsiveImage' };
    throw Error(name);
  }).MobileProfileAvatarEditor;
  function walk(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) { const match = walk(child, predicate); if (match) return match; }
      return null;
    }
    if (predicate(node)) return node;
    return walk(node.props?.children, predicate);
  }
  const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  function render() { cursor = 0; dirty = false; effects = []; tree = Component(props); for (const effect of effects) effect(); }
  function find(predicate) { if (dirty) render(); return walk(tree, predicate); }
  async function flush() { for (let index = 0; index < 40; index += 1) { if (dirty && !disposed) render(); await Promise.resolve(); } }
  return {
    busy, selections, flush, find,
    zoom(value) { find((node) => node.type === 'input' && node.props.type === 'range').props.onChange({ currentTarget: { value: String(value) } }); },
    button(label) { return find((node) => node.type === 'button' && text(node) === label); },
    choose(file) { find((node) => node.type === 'input' && node.props.type === 'file').props.onChange({ currentTarget: { files: [file], value: file.name } }); },
    runTimers() { const scheduled = [...timers.values()]; timers.clear(); scheduled.forEach((run) => run()); },
    options(next) { props = { ...props, ...next }; dirty = true; },
    holdExports() { holdExports = true; },
    finishExport() { exportsWaiting.shift()?.(); },
    holdSelections() { holdSelections = true; },
    finishSelection() { selectionsWaiting.shift()?.(); },
    failExport() { failExport = true; },
    dispose() { disposed = true; for (const slot of slots) slot?.cleanup?.(); },
    get updatesAfterDispose() { return updatesAfterDispose; },
  };
}

test('zoom blocks Save through async selection and preserves its original source across edits', async () => {
  const editor = avatarEditorHarness();
  await editor.flush();
  editor.holdSelections();
  editor.zoom(2);
  assert.equal(editor.busy.at(-1), true);
  editor.runTimers(); await editor.flush();
  assert.equal(editor.selections.length, 1);
  assert.equal(editor.selections[0].framing.crop.zoom, 2);
  assert.equal(editor.busy.at(-1), true);
  assert.equal(editor.button('Replace').props.disabled, true);
  editor.finishSelection(); await editor.flush();
  assert.equal(editor.busy.at(-1), false);
  editor.zoom(2.5); editor.runTimers(); await editor.flush();
  assert.equal(editor.selections[1].framing.originalSource, 'https://images.test/original.jpg');
  assert.equal(editor.selections[1].framing.crop.zoom, 2.5);
  editor.finishSelection(); await editor.flush();
  assert.equal(editor.busy.at(-1), false);
  editor.dispose();
});

test('continuous zoom keeps only the latest timer and discards superseded bitmap exports', async () => {
  const editor = avatarEditorHarness();
  await editor.flush();
  editor.holdExports();
  editor.zoom(1.2); editor.zoom(1.5); editor.runTimers(); await editor.flush();
  assert.equal(editor.selections.length, 0);
  editor.zoom(2); editor.runTimers(); await editor.flush();
  editor.zoom(2.7); editor.runTimers(); await editor.flush();
  assert.equal(editor.find((node) => node.type === 'input' && node.props.type === 'range').props.value, 2.7);
  editor.finishExport(); editor.finishExport(); await editor.flush();
  assert.equal(editor.selections.length, 0, 'superseded crop exports never reach selection');
  assert.equal(editor.busy.at(-1), true);
  editor.finishExport(); await editor.flush();
  assert.equal(editor.selections.length, 1);
  assert.equal(editor.selections[0].framing.crop.zoom, 2.7);
  assert.equal(editor.busy.at(-1), false);
  assert.equal(editor.find((node) => node.type === 'input' && node.props.type === 'range').props.value, 2.7);
  editor.dispose();
});

test('stale bitmap completion cannot select after a source change or unmount', async () => {
  for (const unmount of [false, true]) {
    const editor = avatarEditorHarness();
    await editor.flush(); editor.holdExports();
    editor.zoom(2); editor.runTimers(); await editor.flush();
    if (unmount) editor.dispose();
    else { editor.options({ currentUrl: 'https://images.test/replacement.jpg' }); await editor.flush(); }
    editor.finishExport(); await editor.flush();
    assert.equal(editor.selections.length, 0);
    assert.equal(editor.busy.at(-1), false);
    assert.equal(editor.updatesAfterDispose, 0);
    if (!unmount) editor.dispose();
  }
});

test('Replace remains busy until its async caller settles, including a source change', async () => {
  let resolveSelection;
  const editor = avatarEditorHarness({ onSelect: () => new Promise((resolve) => { resolveSelection = resolve; }) });
  await editor.flush();
  const file = new File(['new pixels'], 'replacement.png', { type: 'image/png' });
  editor.choose(file); await editor.flush();
  assert.equal(editor.busy.at(-1), true);
  assert.equal(editor.find((node) => node.type === 'input' && node.props.type === 'range').props.disabled, true);
  editor.options({ pending: { file, previewUrl: 'blob:replacement', fileName: file.name, sizeBytes: file.size, isPersisted: false } });
  await editor.flush();
  assert.equal(editor.busy.at(-1), true, 'showing the replacement does not imply validation completed');
  resolveSelection(); await editor.flush();
  assert.equal(editor.busy.at(-1), false);
  editor.dispose();
});

test('Reposition awaits selection before closing and unlocks outer Save on Cancel', async () => {
  const editor = avatarEditorHarness();
  await editor.flush(); editor.holdSelections();
  editor.button('Reposition').props.onClick(); await editor.flush();
  assert.equal(editor.busy.at(-1), true);
  const dialog = editor.find((node) => node.type === 'ImageRepositionDialog');
  const saving = dialog.props.onSave({ blob: new Blob(['pixels'], { type: 'image/webp' }), crop: { x: .25, y: .25, width: .5, height: .5, zoom: 2 } });
  await editor.flush();
  assert.ok(editor.find((node) => node.type === 'ImageRepositionDialog'));
  assert.equal(editor.busy.at(-1), true);
  editor.finishSelection(); await saving; await editor.flush();
  assert.equal(editor.find((node) => node.type === 'ImageRepositionDialog'), null);
  assert.equal(editor.busy.at(-1), false);
  editor.button('Reposition').props.onClick(); await editor.flush();
  editor.find((node) => node.type === 'ImageRepositionDialog').props.onClose(); await editor.flush();
  assert.equal(editor.busy.at(-1), false);
  editor.dispose();
});

test('failed crop restores saved framing, reports an error, and releases busy state', async () => {
  const editor = avatarEditorHarness();
  await editor.flush(); editor.failExport();
  editor.zoom(2); editor.runTimers(); await editor.flush();
  assert.equal(editor.selections.length, 0);
  assert.equal(editor.busy.at(-1), false);
  assert.equal(editor.find((node) => node.type === 'input' && node.props.type === 'range').props.value, 1);
  assert.ok(editor.find((node) => node.props?.role === 'alert'));
  editor.dispose();
});

test('a rejected selection without a pending avatar leaves Choose image available for retry', async () => {
  const editor = avatarEditorHarness({ currentUrl: undefined, onSelect: async () => { throw Error('Could not read this picture.'); } });
  await editor.flush();
  editor.choose(new File(['invalid'], 'unreadable.png', { type: 'image/png' }));
  await editor.flush();
  assert.equal(editor.busy.at(-1), false);
  assert.equal(editor.button('Choose image').props.disabled, false);
  assert.equal(editor.button('Undo photo changes'), null);
  assert.ok(editor.find((node) => node.props?.role === 'alert'));
  editor.dispose();
});
