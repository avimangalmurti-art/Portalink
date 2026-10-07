import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/publishing/MediaPicker.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
const assets = Array.from({ length: 3 }, (_, index) => ({ id: `asset-${index}`, fileName: `image-${index}.png`, displayTitle: `Image ${index}`, family: 'image', typeLabel: 'Image', sizeBytes: 100 }));
function harness({ presentation = 'web', items = assets, upload, disabled = false, isFull = false } = {}) {
  const selections = [], reorders = [], exports = {};
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react') return { ...React, useState: initial => [initial, () => {}], useRef: value => ({ current: value }), useEffect() {}, useLayoutEffect() {} };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name.endsWith('/mediaRules')) return { formatFileSize: () => '100 B' };
    if (name.endsWith('/assetTypes')) return { canBeCover: () => false, processingLabel: () => '' };
    if (name.endsWith('/imageMetadata')) return { imageDimensionsLabel: () => '', imageResolutionNotice: () => null };
    return new Proxy({}, { get: (_, key) => key });
  } });
  const media = { items, isFull, select: files => selections.push(files), reorder: (from, to) => reorders.push([from, to]) };
  const tree = exports.MediaPicker({ media, upload: upload ? { itemProgress: {}, ...upload } : undefined, disabled, compact: presentation === 'mobile' });
  const rowComponents = nodes(tree).filter(node => node.type?.name === 'AssetRow');
  return { tree, selections, reorders, rows: rowComponents.map(node => node.type(node.props)) };
}
function dragEvent({ files = [], text = '', types = files.length ? ['Files'] : [], data = {} } = {}) {
  const values = new Map(Object.entries({ 'text/plain': text, ...data }));
  return { prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; },
    dataTransfer: { files, types: [...types], getData: key => values.get(key) ?? '',
      setData(key, value) { values.set(key, value); if (!this.types.includes(key)) this.types.push(key); },
    },
  };
}

test('WEB accepts initial and additional OS files once without treating a file drop as reordering', () => {
  for (const items of [[], assets]) {
    const h = harness({ items });
    const files = [{ name: 'new-image.png' }];
    const event = dragEvent({ files });
    h.tree.props.onDropCapture(event);
    if (!event.stopped && h.rows.length) h.rows[2].props.onDrop(event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(h.selections.length, 1);
    assert.equal(h.selections[0], files);
    assert.deepEqual(h.reorders, []);
  }
});

test('WEB file dragging advertises copy while editable and refuses drops through upload locks or capacity', () => {
  for (const options of [{}, { disabled: true }, { upload: { phase: 'uploading' } }, { upload: { phase: 'cancelling' } }, { upload: { phase: 'uploaded' } }, { isFull: true }]) {
    const h = harness(options);
    const event = dragEvent({ files: [{ name: 'new-file.pdf' }] });
    h.tree.props.onDragOverCapture(event);
    const blocked = Object.keys(options).length > 0;
    assert.equal(event.dataTransfer.dropEffect, blocked ? 'none' : 'copy');
    assert.equal(event.prevented, true);
    h.tree.props.onDropCapture(event);
    assert.equal(h.selections.length, blocked ? 0 : 1);
    assert.deepEqual(h.reorders, []);
  }
});

test('WEB reorder requires a real in-range row payload and cannot run while locked', () => {
  const h = harness();
  const event = dragEvent();
  h.rows[0].props.onDragStart(event);
  h.tree.props.onDropCapture(event);
  assert.equal(event.stopped, false, 'Internal row movement must reach its drop row');
  h.rows[2].props.onDrop(event);
  assert.deepEqual(h.reorders, [[0, 2]]);
  assert.equal(h.selections.length, 0);
  for (const invalid of ['', ' ', '-1', '3', '1.5', 'not-an-index']) {
    const invalidEvent = dragEvent({ data: { 'application/x-portalink-media-index': invalid } });
    h.rows[2].props.onDrop(invalidEvent);
  }
  h.rows[2].props.onDrop(dragEvent({ text: '0' }));
  h.rows[2].props.onDrop(dragEvent({ files: [{ name: 'file.png' }], data: { 'application/x-portalink-media-index': '0' } }));
  assert.deepEqual(h.reorders, [[0, 2]], 'Unrelated text/files or malformed rows cannot move the first file');
  for (const options of [{ disabled: true }, { upload: { phase: 'uploading' } }, { upload: { phase: 'cancelling' } }, { upload: { phase: 'uploaded' } }]) {
    const locked = harness(options);
    locked.rows[2].props.onDrop(event);
    assert.deepEqual(locked.reorders, []);
    assert.equal(locked.rows[0].props.draggable, false);
  }
});

test('MOBILE keeps its compact picker and existing native file-selection path', () => {
  const h = harness({ presentation: 'mobile', items: [] });
  assert.equal(h.tree.props.onDropCapture, undefined);
  assert.equal(h.tree.props.onDragOverCapture, undefined);
  assert.equal(h.tree.props['data-web-file-picker'], undefined);
  const input = nodes(h.tree).find(node => node.type === 'input' && node.props.type === 'file' && node.props.multiple);
  const files = [{ name: 'phone-image.jpg' }], target = { files, value: 'chosen' };
  input.props.onChange({ target });
  assert.equal(h.selections[0], files);
  assert.equal(target.value, '');
  assert.ok(nodes(h.tree).some(node => node.props.children === 'Choose photos, videos or documents from your device.'));
});
