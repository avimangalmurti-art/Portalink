import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function nodes(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : []; }
function harness(owner = false, props = {}, fullscreen = false) {
  let cursor = 0, closes = 0, escape, portalHost;
  const appHost = {}, fullscreenHost = {};
  const slots = [], calls = [];
  const style = { removeProperty(name) { delete this[name]; } };
  const panel = { style, getBoundingClientRect: () => ({ height: 400 }), setAttribute() {}, removeAttribute() {} };
  const viewport = { current: { getBoundingClientRect: () => ({ height: 800 }) } };
  const editor = { projectId: null, mode: 'details', phase: 'idle', metadata: { summary: 'Original' }, fieldErrors: {}, isDirty: false, isSaving: false,
    open(id, mode) { calls.push(['open', id, mode]); this.projectId = id; this.mode = mode; this.phase = 'editing'; },
    setField(key, value) { calls.push(['field', key, value]); this.metadata[key] = value; this.isDirty = true; },
    save() { calls.push(['save']); }, close() { calls.push(['close']); this.projectId = null; this.isDirty = false; return Promise.resolve(true); }, retryLoad() {} };
  const react = { ...React, useEffect() {}, useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectDescriptionSheet.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText, { exports, document: { querySelector: () => appHost, fullscreenElement: fullscreen ? fullscreenHost : null }, require(name) {
    if (name === 'react') return react;
    if (name === 'react-dom') return { createPortal: (element, host) => { portalHost = host; return element; } };
    if (name.endsWith('/ConfirmationDialog')) return { ConfirmationDialog: 'discard-layer' };
    if (name.endsWith('/TextFormattingToolbar')) return { TextFormattingToolbar: 'text-format-toolbar' };
    if (name.endsWith('/useDialogViewport')) return { useDialogViewport: () => viewport };
    if (name.endsWith('/useModalFocus')) return { useModalFocus: (_open, _ref, close, preventScroll) => {
      assert.equal(preventScroll, true, 'Sliding sheets must not scroll their overlay to the translated focus target');
      escape = close;
    } };
    return new Proxy({}, { get: () => () => null });
  } });
  const render = () => {
    cursor = 0;
    const tree = exports.MobileProjectDescriptionSheet({ projectId: 'work', description: 'Original', editor: owner ? editor : undefined, onClose: () => { closes++; }, ...props });
    nodes(tree).find(n => n.type === 'section').ref.current = panel;
    return tree;
  };
  const button = (label) => { const layer=nodes(render()).find(n=>n.type==='discard-layer');if(layer && (label===layer.props.cancelLabel||label===layer.props.confirmLabel))return {props:{onClick:label===layer.props.cancelLabel?layer.props.onCancel:layer.props.onConfirm}};return nodes(render()).find(n => n.type === 'button' && (n.props['aria-label'] === label || n.props.children === label));};
  const click = label => button(label).props.onClick({ stopPropagation() {} });
  return { render, button, click, editor, calls, panel, escape: () => escape(), get closes() { return closes; },
    get portalHost() { return portalHost; }, appHost, fullscreenHost };
}

test('project description uses a centered dialog without movable sheet controls', () => {
 const h=harness();const tree=h.render();
 const overlay=nodes(tree).find(n=>n.props['data-project-description-overlay']==='');
 assert.equal(overlay.props['data-centered-project'],true);
 assert.equal(h.button('Expand description sheet'),undefined);
 assert.equal(h.button('Description options'),undefined);
 h.escape();assert.equal(h.closes,1);
});

test('profile Bio edits, saves and cancels within the same sheet without project services or navigation', async () => {
  const editor = { isEditing: false, phase: 'idle', value: '', isDirty: false, isSaving: false, maxLength: 80,
    open() { this.isEditing = true; this.phase = 'editing'; },
    onChange(value) { this.value = value; this.isDirty = true; },
    save() { this.phase = 'saved'; this.savedValue = this.value; this.isDirty = false; },
    async close() { this.isEditing = false; this.phase = 'idle'; this.isDirty = false; return true; },
  };
  const h = harness(false, { contentLabel: 'Bio', description: '', emptyMessage: 'No bio yet.', textEditor: editor });
  const section = () => nodes(h.render()).find(node => node.type === 'section');
  assert.equal(section().props['data-expanded'], undefined);
  assert.ok(nodes(h.render()).some(node => node.type === 'h2' && node.props.children === 'Bio'));
  assert.ok(nodes(h.render()).some(node => node.props.text === 'No bio yet.'));
  h.click('Expand bio sheet');
  assert.equal(section().props['data-expanded'], true);
  h.click('Bio options'); h.click('Edit bio');
  assert.equal(h.closes, 0);
  let input = nodes(h.render()).find(n => n.type === 'textarea');
  assert.equal(input.props['aria-label'], 'Bio'); assert.equal(input.props.maxLength, 80);
  input.props.onChange({ target: { value: 'New bio' } });
  h.click('Cancel'); assert.ok(h.button('Keep editing'));
  await h.click('Discard changes'); assert.equal(h.closes, 0); assert.ok(h.button('Bio options'));
  h.click('Bio options'); h.click('Edit bio');
  input = nodes(h.render()).find(n => n.type === 'textarea');
  input.props.onChange({ target: { value: 'Saved bio' } });
  nodes(h.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.ok(nodes(h.render()).some(n => n.props.text === 'Saved bio'));
  assert.ok(nodes(h.render()).some(n => n.props.role === 'status' && React.Children.toArray(n.props.children).join('') === 'Bio saved'));
  h.click('Done'); assert.equal(h.closes, 0);
  assert.deepEqual(h.calls, [], 'Bio does not invoke project editing services');
  h.click('Close bio');
  assert.equal(h.closes, 1);
});

test('owner menu uses the existing editor and dirty close requires an explicit discard', async () => {
  const h = harness(true); h.click('Description options'); h.click('Edit description');
  assert.deepEqual(h.calls, [['open', 'work', 'description']]);
  nodes(h.render()).find(n => n.type === 'textarea').props.onChange({ target: { value: 'Changed description' } });
  h.click('Close description'); assert.equal(h.closes, 0);
  assert.ok(h.button('Keep editing')); h.click('Keep editing');
  assert.equal(nodes(h.render()).find(n => n.type === 'textarea').props.value, 'Changed description');
  const form = nodes(h.render()).find(n => n.type === 'form'); form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.calls.at(-1), ['save']);
  h.editor.failure = { message: 'Try again later' };
  assert.ok(nodes(h.render()).some(n => n.props.role === 'alert' && n.props.children === 'Try again later'));
  h.editor.isSaving = true; h.escape(); assert.equal(h.closes, 0);
  h.editor.isSaving = false; h.click('Close description'); await h.click('Discard changes'); assert.equal(h.closes, 1);
});

test('a saved description is shown from the canonical result', () => {
 const h=harness(true);
 h.click('Description options');h.click('Edit description');
 h.editor.phase='saved';h.editor.result={project:{summary:'Stored description'}};
 assert.ok(nodes(h.render()).some(n=>n.props.text==='Stored description'));
 assert.ok(h.button('Done'));
});

test('dirty description confirmation is outside the resized sheet inside its visible viewport and fullscreen portal', async () => {
  for (const fullscreen of [false, true]) {
    const h = harness(true, {}, fullscreen);
    h.click('Description options'); h.click('Edit description');
    nodes(h.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Keep this draft' } });
    h.panel.style.height = '320px';
    h.click('Close description');
    let tree = h.render();
    const viewport = nodes(tree).find(node => node.props['data-project-description-overlay'] === '');
    const sheet = nodes(tree).find(node => node.type === 'section');
    let layer = nodes(tree).find(node => node.type === 'discard-layer');
    assert.ok(layer);
    assert.equal(React.Children.toArray(viewport.props.children).some(node => node.props === layer.props), true);
    assert.equal(nodes(sheet).some(node => node.type === 'discard-layer'), false, 'The resized/transformed sheet cannot bound the confirmation');
    assert.equal(sheet.props['data-expanded'], true);
    assert.equal(layer.props.title, 'Discard your description changes?');
    assert.equal(layer.props.host, fullscreen ? h.fullscreenHost : h.appHost);
    assert.match(viewport.props.style.top, /dialog-viewport-top/);
    assert.match(viewport.props.style.height, /dialog-viewport-height/);
    assert.equal(h.portalHost, fullscreen ? h.fullscreenHost : h.appHost);
    assert.equal(h.closes, 0);
    assert.equal(nodes(tree).some(node => node.type === 'form'), false);
    layer.props.onCancel(); tree = h.render();
    assert.equal(nodes(tree).some(node => node.type === 'discard-layer'), false);
    assert.equal(nodes(tree).find(node => node.type === 'textarea').props.value, 'Keep this draft');
    assert.equal(h.panel.style.height, '320px', 'Keeping edits does not reset the sheet snap/drag size');
    assert.equal(h.closes, 0);
    h.click('Close description'); tree = h.render();
    layer = nodes(tree).find(node => node.type === 'discard-layer');
    await layer.props.onConfirm();
    assert.equal(h.closes, 1);
    assert.deepEqual(h.calls.at(-1), ['close']);
    assert.equal(nodes(h.render()).some(node => node.type === 'discard-layer'), false);
  }
});

test('failed discard keeps its confirmation and draft until Keep editing or a successful retry', async () => {
  const h = harness(true);
  h.click('Description options'); h.click('Edit description');
  nodes(h.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Unsaved text' } });
  let attempts = 0;
  h.editor.close = async () => { attempts++; return attempts > 1; };
  h.click('Close description'); await h.click('Discard changes');
  assert.equal(h.closes, 0);
  assert.equal(attempts, 1);
  assert.ok(nodes(h.render()).find(node => node.type === 'discard-layer'));
  h.click('Keep editing');
  assert.equal(nodes(h.render()).find(node => node.type === 'textarea').props.value, 'Unsaved text');
  assert.equal(attempts, 1, 'Keep editing must not retry cleanup or discard');
  h.click('Close description'); await h.click('Discard changes');
  assert.equal(h.closes, 1);
  assert.equal(attempts, 2);
});
test('mobile Bio writing uses its full screen and returns to reading after save or cancel', async () => {
  const editor = { isEditing: false, phase: 'idle', value: 'Original', isDirty: false, isSaving: false,
    open() { this.isEditing = true; this.phase = 'editing'; },
    onChange(value) { this.value = value; this.isDirty = true; },
    save() { this.phase = 'saved'; this.savedValue = this.value; this.isDirty = false; },
    async close() { this.isEditing = false; this.phase = 'idle'; this.isDirty = false; return true; },
  };
  const h = harness(false, { contentLabel: 'Bio', fullScreenEditor: true, textEditor: editor });
  const section = () => nodes(h.render()).find(n => n.type === 'section');
  h.click('Bio options'); h.click('Edit bio');
  assert.equal(section().props['data-writing-screen'], true);
  const formatting = nodes(h.render()).find(n => n.type === 'text-format-toolbar');
  assert.equal(formatting.props.variant, 'dropdown');
  assert.equal(nodes(nodes(h.render()).find(n => n.type === 'header')).filter(n => n.type === 'text-format-toolbar').length, 1);
  assert.equal(nodes(nodes(h.render()).find(n => n.type === 'form')).filter(n => n.type === 'text-format-toolbar').length, 0);
  assert.equal(h.button('Reduce bio sheet'), undefined);
  h.click('Cancel');
  assert.equal(section().props['data-writing-screen'], undefined);
  h.click('Bio options'); h.click('Edit bio');
  nodes(h.render()).find(n => n.type === 'textarea').props.onChange({ target: { value: 'Updated' } });
  h.escape(); assert.ok(h.button('Keep editing'));
  h.click('Keep editing');
  assert.equal(section().props['data-writing-screen'], true);
  nodes(h.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(section().props['data-writing-screen'], undefined);
  assert.ok(h.button('Done'));
  const web = harness(false, { contentLabel: 'Bio', textEditor: { ...editor, phase: 'editing' } });
  assert.equal(nodes(web.render()).find(n => n.type === 'section').props['data-writing-screen'], undefined);
  assert.ok(web.button('Expand bio sheet'));
});


test('project information uses the actual title rather than a Description heading', () => {
  const h = harness(false, { projectTitle: 'Triple Helvetica' });
  const tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === 'h2').props.children, 'Triple Helvetica');
  assert.equal(nodes(tree).find(node => node.type === 'section').props['aria-labelledby'], 'project-description-title');
  assert.equal(nodes(tree).filter(node => node.type === 'h2' && node.props.children === 'Description').length, 0);
});

test('mobile bio opens directly with top Save, no footer and protected Close', async () => {
  let saves = 0;
  const editor = { isEditing: false, phase: 'idle', value: 'Bio', isDirty: false, isSaving: false,
    open() { this.isEditing = true; this.phase = 'editing'; },
    save() { saves++; }, async close() { this.isEditing = false; return true; },
    onChange(value) { this.value = value; this.isDirty = true; }, retryLoad() {},
  };
  const h = harness(false, { contentLabel: 'Bio', textEditor: editor, fullScreenEditor: true, directEditAction: true });
  h.click('Edit bio');
  assert.equal(nodes(h.render()).find(n => n.type === 'section').props['data-top-editor-actions'], true);
  assert.equal(nodes(h.render()).some(n => n.type === 'footer'), false);
  assert.equal(h.button('Save').props.disabled, true);
  editor.onChange('Changed');
  const heading = nodes(h.render()).find(n => n.type === 'header');
  assert.ok(nodes(heading).some(n => n.type === 'button' && n.props.children === 'Save'));
  h.click('Save'); assert.equal(saves, 1);
  h.click('Close bio'); assert.equal(h.closes, 0);
  assert.ok(h.button('Keep editing'));
  await h.click('Discard changes'); assert.equal(h.closes, 1);
});
