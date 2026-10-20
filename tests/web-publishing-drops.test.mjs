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
function harness({ presentation = 'web', items = assets, upload, disabled = false, isFull = false, expanded = false, mobileFileManager = false, liveReorder = false } = {}) {
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
  const media = { items, isFull, select: files => selections.push(files), reorder: (from, to) => {reorders.push([from, to]);if(liveReorder){const next=[...media.items],moved=next.splice(from,1)[0];next.splice(to,0,moved);media.items=next;}} };
  const render=()=>{const tree=exports.MediaPicker({ media, upload: upload ? { itemProgress: {}, ...upload } : undefined, disabled, compact: presentation === 'mobile', expanded, mobileFileManager });return {tree,rows:nodes(tree).filter(node=>node.type?.name==='AssetRow').map(node=>node.type(node.props))};};
  return { ...render(), render, media, selections, reorders };
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

test('MOBILE file manager exposes every row and touch reorder preserves each file and its cover draft',()=>{
 const items=Array.from({length:15},(_,index)=>({...assets[0],id:`file-${index}`,displayTitle:`Artwork ${index+1}`,isCover:index===14,metadata:{coverFrame:{x:.2,y:.8,zoom:2}}}));
 const h=harness({presentation:'mobile',items,expanded:true,mobileFileManager:true,liveReorder:true});
 assert.equal(h.rows.length,15);assert.equal(h.tree.props['data-mobile-file-manager'],true);
 const earlier=row=>nodes(row).find(node=>node.props['aria-label']?.endsWith(' earlier'));
 const later=row=>nodes(row).find(node=>node.props['aria-label']?.endsWith(' later'));
 assert.equal(earlier(h.rows[0]).props.disabled,true);assert.equal(later(h.rows[14]).props.disabled,true);
 assert.ok(!earlier(h.rows[14]).props.className?.includes('sr-only'));
 earlier(h.rows[14]).props.onClick();
 const next=h.render();assert.deepEqual(h.reorders,[[14,13]]);assert.equal(next.rows.length,15);
 assert.equal(h.media.items[13],items[14]);assert.equal(h.media.items[13].isCover,true);assert.equal(h.media.items[13].metadata.coverFrame,items[14].metadata.coverFrame);
 assert.equal(nodes(next.rows[13]).find(node=>node.props['data-file-order']).props['data-file-order'],14);
 assert.deepEqual(h.selections,[],'Reorder never opens or changes native file selection');
});

test('file-manager controls respect all transport locks and remain an explicit MOBILE opt-in',()=>{
 for(const options of [{disabled:true},{upload:{phase:'uploading'}},{upload:{phase:'cancelling'}},{upload:{phase:'uploaded'}}]){
  const h=harness({presentation:'mobile',expanded:true,mobileFileManager:true,...options});
  for(const row of h.rows)for(const node of nodes(row).filter(node=>node.type==='button'))assert.equal(node.props.disabled,true);
 }
 for(const options of [{presentation:'web',mobileFileManager:true},{presentation:'mobile',mobileFileManager:false}]){
  const h=harness({...options,expanded:true});assert.equal(h.tree.props['data-mobile-file-manager'],undefined);
  for(const row of h.rows)assert.equal(nodes(row).some(node=>node.props.className==='mobile-file-reorder-controls'),false);
 }
});
