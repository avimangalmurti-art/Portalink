import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Exercise the real dialog's completion boundary without a browser, network
// calls, or publishing test projects. Service state and hook scheduling are
// controlled here; the actual component/effect code is compiled unchanged.
const source = readFileSync(new URL('../src/features/publishing/PublishProjectDialog.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;

function harness(presentation = 'web') {
  let currentFlow;
  let effects = [];
  let cursor = 0;
  const refs = [];
  const calls = [];
  const stubReact = { ...React,
    useEffect: (effect) => effects.push(effect),
    useRef: (value) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    useState: (value) => [value, () => undefined],
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === 'react') return stubReact;
      if (name === 'framer-motion') return { AnimatePresence: React.Fragment, motion: { div: 'div', section: 'section' }, useReducedMotion: () => true };
      if (name === './usePublishProject') return { usePublishProject: () => currentFlow };
      if (name === './validation') return { TITLE_MAX_LENGTH: 80 };
      if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
      return new Proxy({}, { get: (_, key) => key });
    },
    document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  });
  const props = { isOpen: true, profileId: 'creator', categoryId: 'category', categoryLabel: 'Typography',
    onClose: () => undefined, onPublished: (result, title) => calls.push({ result, title }),
  };
  function render(changes = {}, propChanges = {}) {
    currentFlow = {
      step: 'metadata', state: 'editing', isDirty: true, isOwner: true, draft: {}, isSavingDraft: false,
      media: { items: [] }, firstProject: false, location: '', metadata: { title: ' Wet Paint ', summary: '' }, fieldErrors: {},
      inferredRelevance: {}, upload: {}, publish: {}, ...changes,
    };
    cursor = 0;
    effects = [];
    const tree = exports.PublishProjectDialog({ ...props, ...propChanges });
    effects.forEach((effect) => effect());
    return tree;
  }
  return { render, calls };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
const published = { projectId: 'new-project', mediaPersisted: true, sessionOnly: false };

test('mobile delegates to the guided flow while WEB keeps its existing form', () => {
  const flow = { location: 'Oakland', inferredRelevance: { contentGeography: { label: 'San Francisco' } }, media: { items: [{}] } };
  const tree = harness('mobile').render(flow);
  assert.equal(tree.props.mobileFlow, true);
  const guided = nodes(tree).find(node => node.type === 'MobilePublishFlow');
  assert.equal(guided.props.editingStep, 'files');
  assert.equal(guided.props.flow.location, 'Oakland');
  assert.equal(guided.props.flow.media, flow.media);
  const web = nodes(harness().render(flow));
  assert.ok(!web.some(node => node.type === 'MobilePublishFlow'));
  assert.ok(!web.some(node => node.props?.id === 'publish-location'));
  assert.equal(web.find(node => node.type === 'MediaPicker').props.compact, false);
});

test('mobile cannot close while details are saving, files preparing or cleanup is pending', () => {
  for (const state of [{ isSavingDraft: true }, { media: { items: [], state: 'selecting' } }, { upload: { isCleaningUp: true } }]) {
    assert.equal(harness('mobile').render(state).props.closeDisabled, true);
  }
});

test('draft saving stays protected after resizing to WEB and cleanup locks recovery actions', () => {
  const web = harness().render({ isSavingDraft: true, canPublish: true });
  assert.equal(web.props.closeDisabled, true);
  assert.equal(nodes(web).find(node => node.props?.type === 'submit').props.disabled, true);
  const mobile = harness('mobile').render({ upload: { isCleaningUp: true, failure: { message: 'Failed' } } });
  const notices = nodes(mobile).find(node=>node.type==='MobilePublishFlow').props.notices;
  assert.ok(nodes(notices).filter(node=>node.type==='button').every(node=>node.props.disabled));
});

test('confirmed publication removes the entire modal and announces once', () => {
  const h = harness();
  assert.equal(h.render({ step: 'done', state: 'published', result: published }), null);
  h.render({ step: 'done', state: 'published', result: published });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].result, published);
  assert.equal(h.calls[0].title, 'Wet Paint');
});

test('uploaded files alone do not close the publishing form', () => {
  const h = harness();
  const tree = h.render({ state: 'publishing', upload: { phase: 'uploaded' } });
  assert.equal(tree.props.titleId, 'publish-dialog-title');
  assert.equal(h.calls.length, 0);
});

test('cover framing stays locked while uploading and after files are stored', () => {
  for (const upload of [
    { phase: 'uploading', isBusy: true },
    { phase: 'cancelling', isBusy: true },
    { phase: 'uploaded', isBusy: false },
  ]) {
    const tree = harness().render({ state: 'editing', upload });
    assert.equal(nodes(tree).find((node) => node.type === 'CoverFilmstrip').props.disabled, true);
  }
  const tree = harness().render({ upload: { phase: 'idle', isBusy: false } });
  assert.equal(nodes(tree).find((node) => node.type === 'CoverFilmstrip').props.disabled, false);
});

test('disabled Publish explains the missing detail, then clears the helper when ready', () => {
  for (const presentation of ['web']) {
  for (const [title, summary, expected] of [
    ['  ', '', 'Add a title to publish.'],
    ['My project', '  ', 'Add a description to publish.'],
  ]) {
    const tree = harness(presentation).render({ metadata: { title, summary }, canPublish: false, media: { items: [{}] } });
    assert.ok(nodes(tree).some((node) => node.props?.role === 'status' && node.props.children === expected));
    assert.equal(nodes(tree).find((node) => node.props?.type === 'submit').props.disabled, true);
  }
  const tree = harness(presentation).render({ firstProject: false, metadata: { title: 'My project', summary: 'About the work' }, canPublish: true, media: { items: [{}] } });
  assert.equal(nodes(tree).find((node) => node.props?.type === 'submit').props.disabled, false);
  assert.ok(!nodes(tree).some((node) => node.props?.role === 'status'));
  assert.ok(nodes(tree).some((node) => node.props?.id === 'publish-details-label' && node.props.children === 'Project details'));
  }
});

test('publishing accepts the complete long description without an input cap', () => {
  const summary = 'First paragraph — café 🌍\n\nSecond paragraph.\n'.repeat(2500);
  const tree = harness().render({ firstProject: false, metadata: { title: 'Long-form project', summary } });
  const fields = nodes(tree);
  const description = fields.find((node) => node.props?.id === 'publish-summary');
  assert.equal(description.props.maxLength, undefined);
  assert.equal(description.props.value, summary);
  assert.equal(fields.find((node) => node.props?.id === 'publish-title').props.maxLength, 80);
});

test('upload and publication errors keep the dialog and recovery message', () => {
  for (const failure of [
    { upload: { failure: { message: 'Upload failed' } } },
    { publish: { status: 'error', error: 'Publication failed' } },
  ]) {
    const h = harness();
    const tree = h.render({ state: 'failed', ...failure });
    assert.equal(tree.props.titleId, 'publish-dialog-title');
    assert.ok(nodes(tree).some((node) => node.props?.role === 'alert'));
    assert.equal(h.calls.length, 0);
  }
});

test('closed or incomplete flows never emit a successful result', () => {
  const h = harness();
  h.render({ step: 'done', result: published }, { isOpen: false });
  h.render({ upload: { phase: 'cancelled' } });
  assert.equal(h.calls.length, 0);
});

test('a later publication can announce and prototype results retain their warning flags', () => {
  const h = harness();
  h.render({ step: 'done', result: published });
  h.render({}, { isOpen: false });
  const prototype = { projectId: 'session-project', mediaPersisted: false, sessionOnly: true };
  h.render({ step: 'done', result: prototype });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].result, prototype);
});

test('first-project dashed-tile reentry resumes the saved Details step instead of resetting to Files', () => {
  const tree = harness('mobile').render({firstProjectStage:'details',metadata:{title:'Saved title',summary:'',creationDetails:{madeIn:'2024-05',field:'Design',answers:{what:'Saved answer',did:'',learned:''}}}, media:{items:[{id:'saved-file'}]}}, {firstProject:{name:'Mira',categories:['Work']}});
  const guided=nodes(tree).find(node=>node.type==='MobilePublishFlow');
  assert.equal(guided.props.editingStep,'details');assert.equal(guided.props.flow.metadata.creationDetails.answers.what,'Saved answer');assert.equal(guided.props.flow.media.items[0].id,'saved-file');
});
test('first-project close cannot abandon a draft when local checkpoint fails', async () => {
  let closed=0;
  const tree=harness('mobile').render({saveLocalDraft:async()=>{throw Error('quota');}}, {firstProject:{name:'Mira',categories:['Work']},onClose:()=>closed++});
  await tree.props.onClose();assert.equal(closed,0);
});


test('first-project recovery retains safe close and locked fields after switching to WEB', async () => {
  let saved=0,closed=0;
  const tree=harness('web').render({hasCommittedProject:true,saveLocalDraft:async()=>saved++,canPublish:true,media:{items:[{}]}},{firstProject:{name:'Mira',categories:['Work']},onClose:()=>closed++});
  await tree.props.onClose();assert.equal(saved,1);assert.equal(closed,1);
  const guided = nodes(tree).find(node => node.type === 'MobilePublishFlow');
  assert.equal(guided.props.flow.hasCommittedProject, true);
  const exports = {};
  const compiledFlow = ts.transpileModule(readFileSync(new URL('../src/features/publishing/MobilePublishFlow.tsx', import.meta.url), 'utf8'), {
    compilerOptions: {jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true},
  }).outputText;
  vm.runInNewContext(compiledFlow, {exports, require(name) {
    if (name === 'react') return {...React, useRef: value => ({current:value}), useEffect() {}};
    if (name === './firstProject') return {EMPTY_CREATION:{answers:{what:'',did:'',learned:''}}};
    return new Proxy({}, {get:(_,key)=>key});
  }});
  const review = nodes(exports.MobilePublishFlow(guided.props));
  assert.equal(review.find(node=>node.props?.children==='Edit details').props.disabled,true);
  assert.equal(review.find(node=>node.props?.children==='Edit files and cover').props.disabled,true);
  assert.equal(review.find(node=>node.props?.type==='submit').props.disabled,false);
  assert.ok(React.Children.toArray(review.find(node=>node.props?.type==='submit').props.children).includes('Finish saving details'));
});
