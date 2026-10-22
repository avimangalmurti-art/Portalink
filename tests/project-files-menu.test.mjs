import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

const imageMetadata = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/imageMetadata.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: imageMetadata });

function harness(file, component, props, presentation = 'web') {
  const source = readFileSync(new URL(`../src/components/publishing/${file}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  let cursor = 0;
  let dismiss;
  const state = [];
  const document = { activeElement: null };
  const exports = {};
  vm.runInNewContext(compiled, { exports, document, require: (name) => {
    if (name === 'react') return { ...React,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
      },
      useRef: () => ({ current: null }), useEffect() {}, useLayoutEffect() {},
    };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name.endsWith('/useModalFocus')) return { useModalFocus: (_open, _ref, onDismiss) => { dismiss = onDismiss; } };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/assetTypes')) return { supportedFormatGroups: [], canBeCover: () => true, processingLabel: () => '' };
    if (name.endsWith('/mediaRules')) return { formatFileSize: () => '1.2 MB' };
    if (name.endsWith('/imageMetadata')) return imageMetadata;
    return new Proxy({}, { get: (_, key) => key });
  } });
  return {
    render: (changes = {}) => { cursor = 0; return exports[component]({ ...props, ...changes }); },
    dismiss: () => dismiss(), document,
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const label = (tree, value) => find(tree, (node) => node.props?.children === value);
const menuProps = { hasFiles: true, locked: false, showsRequirements: false,
  triggerRef: { current: null }, onRequirements() {}, onRemoveAll() {},
};
function open(h) {
  find(h.render(), (node) => node.props?.['aria-haspopup'] === 'menu').props.onClick();
  return h.render();
}

test('file options dismiss before revealing requirements or remove confirmation', () => {
  for (const [text, callback] of [['File requirements', 'onRequirements'], ['Remove all files…', 'onRemoveAll']]) {
    let calls = 0;
    const h = harness('ProjectFilesMenu', 'ProjectFilesMenu', { ...menuProps, [callback]: () => calls++ });
    label(open(h), text).props.onClick();
    assert.equal(calls, 1);
    assert.equal(find(h.render(), (node) => node.props?.role === 'menu'), undefined);
  }
});

test('empty drafts omit remove-all; locked drafts cannot trigger it', () => {
  const empty = harness('ProjectFilesMenu', 'ProjectFilesMenu', { ...menuProps, hasFiles: false });
  assert.equal(label(open(empty), 'Remove all files…'), undefined);
  let calls = 0;
  const locked = harness('ProjectFilesMenu', 'ProjectFilesMenu', { ...menuProps, locked: true, onRemoveAll: () => calls++ });
  const action = label(open(locked), 'Remove all files…');
  assert.equal(action.props.disabled, true);
  action.props.onClick();
  assert.equal(calls, 0);
});

test('file menu supports keyboard entry, wrapping, and modal dismissal', () => {
  const h = harness('ProjectFilesMenu', 'ProjectFilesMenu', menuProps);
  const menu = find(open(h), (node) => node.props?.role === 'menu');
  const items = [0, 1].map(() => ({ focus() { h.document.activeElement = this; } }));
  const press = (key) => menu.props.onKeyDown({ key, preventDefault() {}, currentTarget: { querySelectorAll: () => items } });
  press('ArrowUp');
  assert.equal(h.document.activeElement, items[1]);
  press('ArrowDown');
  assert.equal(h.document.activeElement, items[0]);
  press('End');
  assert.equal(h.document.activeElement, items[1]);
  press('Home');
  assert.equal(h.document.activeElement, items[0]);
  h.dismiss();
  assert.equal(find(h.render(), (node) => node.props?.role === 'menu'), undefined);
});

test('remove-all requires confirmation and Keep files preserves the draft', () => {
  let cleared = 0;
  const h = harness('MediaPicker', 'MediaPicker', { media: {
    items: [{ id: 'image' }], clear: () => cleared++, state: 'ready',
  } });
  const requestRemoval = () => find(h.render(), (node) => node.type === 'ProjectFilesMenu').props.onRemoveAll();
  requestRemoval();
  assert.equal(cleared, 0);
  find(h.render(),node=>node.type==='ConfirmationDialog').props.onCancel();
  assert.equal(cleared, 0);
  assert.equal(label(h.render(), 'Remove all'), undefined);
  requestRemoval();
  find(h.render(),node=>node.type==='ConfirmationDialog').props.onConfirm();
  assert.equal(cleared, 1);
  assert.equal(label(h.render(), 'Remove all'), undefined);
});

const rowAssets = Array.from({ length: 8 }, (_, index) => ({
  id: `file-${index}`,
  displayTitle: `BC86D201-8EA2-42C9-9200-00000000000${index}.png`,
  fileName: `BC86D201-8EA2-42C9-9200-00000000000${index}.png`,
  family: 'image', typeLabel: 'Image', mimeType: 'image/png', sizeBytes: 1200000,
  metadata: { widthPixels: 1223, heightPixels: 1286 },
}));
const renderRows = h => nodes(h.render()).filter(node => node.type?.name === 'AssetRow').map(node => node.type(node.props));

test('mobile file quality uses a closed native disclosure and keeps the full filename and warning available', () => {
  const h = harness('MediaPicker', 'MediaPicker', { compact: true, expanded: true, mobileFileManager: true,
    media: { items: rowAssets, state: 'ready' },
  }, 'mobile');
  const rows = renderRows(h);
  assert.equal(rows.length, 8);
  for (const [index, row] of rows.entries()) {
    const details = find(row, node => node.type === 'details');
    assert.ok(details);
    assert.equal(details.props.open, undefined, 'The warning is disclosed on request, not expanded for every file');
    assert.equal(find(details, node => node.type === 'summary').props.children, 'Check resolution');
    assert.ok(label(details, imageMetadata.imageResolutionNotice(rowAssets[index].metadata, 'artwork')));
    assert.ok(find(row, node => node.props.title === rowAssets[index].displayTitle && node.props.children === rowAssets[index].displayTitle));
    const actions = find(row, node => node.props.className === 'mobile-file-row-actions');
    assert.ok(find(actions, node => node.type === 'details'));
    assert.equal(nodes(actions).filter(node => node.type === 'button').length, 2, 'Disclosure and move controls share the compact row');
  }
});

test('desktop and ordinary pickers retain the full warning without the mobile quality disclosure', () => {
  for (const [presentation, mobileFileManager] of [['web', true], ['mobile', false]]) {
    const h = harness('MediaPicker', 'MediaPicker', { expanded: true, mobileFileManager,
      media: { items: rowAssets, state: 'ready' },
    }, presentation);
    for (const row of renderRows(h)) {
      assert.equal(find(row, node => node.type === 'details'), undefined);
      assert.equal(find(row, node => node.props.className === 'mobile-file-row-actions'), undefined);
      assert.equal(find(row, node => node.props.role === 'status').props.children,
        imageMetadata.imageResolutionNotice(rowAssets[0].metadata, 'artwork'));
    }
  }
});

test('resolution disclosure is omitted for large images and vectors, while move actions retain their boundaries', () => {
  const reorders = [];
  const h = harness('MediaPicker', 'MediaPicker', { expanded: true, mobileFileManager: true,
    media: { items: [
      { ...rowAssets[0], metadata: { widthPixels: 1800, heightPixels: 1800 } },
      { ...rowAssets[1], mimeType: 'image/svg+xml' },
    ], state: 'ready', reorder: (from, to) => reorders.push([from, to]) },
  }, 'mobile');
  const rows = renderRows(h);
  assert.ok(rows.every(row => !find(row, node => node.type === 'details')));
  const earlier = row => find(row, node => node.props['aria-label']?.endsWith(' earlier'));
  const later = row => find(row, node => node.props['aria-label']?.endsWith(' later'));
  assert.equal(earlier(rows[0]).props.disabled, true);
  assert.equal(later(rows[1]).props.disabled, true);
  earlier(rows[1]).props.onClick();
  assert.deepEqual(reorders, [[1, 0]]);
});

test('onboarding file menus retain presentation scope through their portal without changing legacy menus',()=>{
 for(const presentation of ['mobile','web']){
  for(const onboardingFiles of [false,true]){
   let requirements=0;
   const h=harness('ProjectFilesMenu','ProjectFilesMenu',{...menuProps,onboardingFiles,presentation,onRequirements:()=>requirements++},presentation);
   const trigger=find(h.render(),node=>node.props?.['aria-haspopup']==='menu');
   assert.equal(trigger.props['data-ui-shape'],onboardingFiles?'icon':undefined);
   assert.equal(trigger.props['data-control-size'],onboardingFiles?'sm':undefined);
   const menu=find(open(h),node=>node.props?.role==='menu');
   assert.equal(menu.props['data-presentation'],onboardingFiles?presentation:undefined);
   assert.equal(menu.props['data-onboarding-files-manager'],onboardingFiles?true:undefined);
   label(menu,'File requirements').props.onClick();assert.equal(requirements,1);
   assert.equal(find(h.render(),node=>node.props?.role==='menu'),undefined);
  }
 }
});

test('onboarding row actions keep order boundaries, disabled state and portalled file options',()=>{
 for(const presentation of ['mobile','web']){
  const reordered=[],removed=[];
  const h=harness('MediaPicker','MediaPicker',{expanded:true,mobileFileManager:presentation==='mobile',onboardingFiles:true,
   media:{items:rowAssets.slice(0,2),state:'ready',reorder:(from,to)=>reordered.push([from,to]),remove:id=>removed.push(id)}},presentation);
  const section=h.render();assert.equal(section.props['data-presentation'],presentation);
  const menuProps=find(section,node=>node.type==='ProjectFilesMenu').props;
  assert.equal(menuProps.onboardingFiles,true);assert.equal(menuProps.presentation,presentation);
  const rows=renderRows(h);assert.ok(rows.every(row=>row.props['data-ui-shape']==='row'));
  const trigger=find(rows[1],node=>node.props?.['aria-haspopup']==='menu');
  assert.equal(trigger.props['data-ui-shape'],'icon');assert.equal(trigger.props['data-control-size'],'sm');
  if(presentation==='mobile'){
   const earlier=row=>find(row,node=>node.props?.['aria-label']?.endsWith(' earlier'));
   const later=row=>find(row,node=>node.props?.['aria-label']?.endsWith(' later'));
   assert.equal(earlier(rows[0]).props.disabled,true);assert.equal(later(rows[1]).props.disabled,true);
   assert.equal(earlier(rows[1]).props['data-ui-shape'],'icon');earlier(rows[1]).props.onClick();
   assert.deepEqual(reordered,[[1,0]]);
  }
  trigger.props.onClick();
  const popup=find(renderRows(h)[1],node=>node.props?.role==='menu');
  assert.equal(popup.props['data-presentation'],presentation);assert.equal(popup.props['data-onboarding-files-manager'],true);
  const remove=find(popup,node=>node.props?.label==='Remove');remove.props.onSelect();
  assert.deepEqual(removed,[rowAssets[1].id]);
  const locked=harness('MediaPicker','MediaPicker',{expanded:true,mobileFileManager:presentation==='mobile',onboardingFiles:true,disabled:true,media:{items:rowAssets.slice(0,2),state:'ready'}},presentation);
  for(const row of renderRows(locked))for(const button of nodes(row).filter(node=>node.type==='button'))assert.equal(button.props.disabled,true);
 }
});
