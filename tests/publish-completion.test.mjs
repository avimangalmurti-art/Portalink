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
  const hookCalls = [];
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
      if (name === './usePublishProject') return { usePublishProject: (...args) => { hookCalls.push(args); return currentFlow; } };
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
      discard:async()=>true, step: 'metadata', state: 'editing', isDirty: true, isOwner: true, draft: {}, isSavingDraft: false,
      media: { items: [] }, firstProject: false, location: '', metadata: { title: ' Wet Paint ', summary: '' }, fieldErrors: {},
      inferredRelevance: {}, upload: {}, publish: {}, ...changes,
    };
    cursor = 0;
    effects = [];
    const tree = exports.PublishProjectDialog({ ...props, ...propChanges });
    effects.forEach((effect) => effect());
    return tree;
  }
  return { render, calls, hookCalls };
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

test('the real dialog requests a fresh-profile completion handoff only for MOBILE', () => {
  const initialMetadata = { title: 'From setup', summary: '' };
  for (const presentation of ['mobile', 'web']) for (const firstProject of [undefined, { madeIn: '2026-05', name: 'Mira', categories: ['Work'] }]) {
    const h = harness(presentation);
    h.render({}, { firstProject, initialMetadata });
    const args = h.hookCalls[0];
    assert.deepEqual(args.slice(0, 4), ['creator', 'category', true, 'Typography']);
    assert.equal(args[4], presentation === 'mobile');
    assert.equal(args[5], false, 'Ordinary project publishing must not become the onboarding flow');
    assert.equal(args[7].persist, presentation === 'mobile');
    assert.equal(args[7].initialMetadata, initialMetadata);
    assert.equal(args[7].awaitProfile, presentation === 'mobile');
  }
});

test('MOBILE retains Review while a committed project awaits its profile and announces only completion', () => {
  const h = harness('mobile');
  const pending = h.render({ step: 'preview', state: 'publishing', hasCommittedProject: true });
  assert.equal(pending.props.title, 'Review project');
  assert.equal(pending.props.closeDisabled, true);
  assert.equal(h.calls.length, 0);
  const failed = h.render({ step: 'preview', state: 'failed', hasCommittedProject: true, publish: { status: 'error', error: 'Try again to open the updated catalogue.' } });
  assert.equal(failed.props.title, 'Review project');
  const notices = nodes(failed).find(node => node.type === 'MobilePublishFlow').props.notices;
  assert.ok(nodes(notices).some(node => node.props?.role === 'alert'));
  assert.equal(h.calls.length, 0);
  assert.equal(h.render({ step: 'done', state: 'published', result: published }), null);
  h.render({ step: 'done', state: 'published', result: published });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].result, published);
});

test('actual MOBILE parent titles follow Files, Details and Review including restored and committed drafts',()=>{
 const h=harness('mobile');
 for(const [flow,expected,editingStep] of [
  [{},'Files & cover','files'],
  [{firstProjectStage:'files',media:{items:[{id:'file'}]}},'Files & cover','files'],
  [{firstProjectStage:'details'},'New project','details'],
  [{step:'preview',firstProjectStage:'details'},'Review project','details'],
  [{hasCommittedProject:true,firstProjectStage:'files'},'Review project','files'],
  [{hasCommittedProject:true,firstProjectStage:'details',state:'failed'},'Review project','details'],
 ]){
  const tree=h.render(flow,{firstProject:{madeIn:'2026-05',name:'Mira',categories:['Work']}});
  assert.equal(tree.type,'ProjectFormScreen');assert.equal(tree.props.title,expected);
  assert.equal(tree.props.titleId,'publish-dialog-title');
  const guided=nodes(tree).find(node=>node.type==='MobilePublishFlow');
  assert.equal(guided.props.editingStep,editingStep);
  assert.equal(guided.props.flow.hasCommittedProject,flow.hasCommittedProject);
 }
 const setupEntry=h.render({firstProjectStage:'files'},{initialMetadata:{title:'Title from setup',summary:''}});
 assert.equal(setupEntry.props.title,'Files & cover');
 assert.equal(nodes(setupEntry).find(node=>node.type==='MobilePublishFlow').props.detailsFirst,true);
});

test('WEB parent keeps New project or its existing made-in year title across all stages',()=>{
 for(const flow of [{firstProjectStage:'files'},{firstProjectStage:'details'},{step:'preview'},{hasCommittedProject:true,step:'metadata'}]){
  const normal=harness('web').render(flow);
  assert.equal(normal.type,'ProjectFormDialog');assert.equal(normal.props.title,'New project');
  const dated=harness('web').render({...flow,metadata:{title:'Work',summary:'',creationDetails:{madeIn:'2024-07'}}},{firstProject:{madeIn:'2026-05',name:'Mira',categories:['Work']}});
  assert.equal(dated.props.title,'Add work from 2024');
  const fallback=harness('web').render(flow,{firstProject:{madeIn:'2026-05',name:'Mira',categories:['Work']}});
  assert.equal(fallback.props.title,'Add work from 2026');
 }
});

test('the actual MOBILE screen frame exposes one focusable heading as its dialog label',()=>{
 const frameSource=readFileSync(new URL('../src/components/publishing/ProjectFormDialog.tsx',import.meta.url),'utf8');
 const frameExports={};
 vm.runInNewContext(ts.transpileModule(frameSource,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{
  React,exports:frameExports,require(name){
   if(name==='react')return {...React,useRef:value=>({current:value}),useLayoutEffect(){}};
   if(name.endsWith('/useModalFocus'))return {useModalFocus(){}};
   if(name.endsWith('/useDialogViewport'))return {useDialogViewport:()=>({current:null})};
   if(name==='./useAuthoringFocus')return {useAuthoringFocus(){}};
   return new Proxy({},{get:(_,key)=>key});
  },
 });
 for(const title of ['New project','Files & cover','Review project']){
  const frame=frameExports.ProjectFormScreen({title,titleId:'publish-dialog-title',onClose(){},children:React.createElement('form',null)}),all=nodes(frame);
  const headings=all.filter(node=>typeof node.type==='string'&&/^h[1-6]$/.test(node.type)),dialog=all.find(node=>node.props?.role==='dialog');
  assert.equal(headings.length,1);assert.equal(headings[0].type,'h1');assert.equal(headings[0].props.children,title);
  assert.equal(headings[0].props.tabIndex,-1);assert.equal(dialog.props['aria-labelledby'],headings[0].props.id);
 }
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
  ]) {
    const tree = harness(presentation).render({ metadata: { title, summary }, canPublish: false, media: { items: [{}] } });
    assert.ok(nodes(tree).some((node) => node.props?.role === 'status' && node.props.children === expected));
    assert.equal(nodes(tree).find((node) => node.props?.type === 'submit').props.disabled, true);
  }
  const tree = harness(presentation).render({ firstProject: false, metadata: { title: 'My project', summary: '' }, canPublish: true, media: { items: [{}] } });
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
test('first-project close waits for discard cleanup and retains the draft on failure', async () => {
  let closed=0;
  const tree=harness('mobile').render({discard:async()=>false}, {firstProject:{name:'Mira',categories:['Work']},onClose:()=>closed++});
  await tree.props.onClose();assert.equal(closed,0);
});


test('first-project recovery retains safe close and locked fields after switching to WEB', async () => {
  let saved=0,closed=0;
  const tree=harness('web').render({hasCommittedProject:true,discard:async()=>{saved++;return true;},canPublish:true,media:{items:[{}]}},{firstProject:{name:'Mira',categories:['Work']},onClose:()=>closed++});
  await tree.props.onClose();assert.equal(saved,1);assert.equal(closed,1);
  const guided = nodes(tree).find(node => node.type === 'MobilePublishFlow');
  assert.equal(guided.props.flow.hasCommittedProject, true);
  const exports = {};
  const compiledFlow = ts.transpileModule(readFileSync(new URL('../src/features/publishing/MobilePublishFlow.tsx', import.meta.url), 'utf8'), {
    compilerOptions: {jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true},
  }).outputText;
  vm.runInNewContext(compiledFlow, {exports, require(name) {
    if (name === 'react') return {...React, useRef: value => ({current:value}), useEffect() {}};
    if (name.endsWith('/usePresentation')) return {usePresentation:()=> 'web'};
    if (name === './firstProject') return {EMPTY_CREATION:{answers:{what:'',did:'',learned:''}}};
    return new Proxy({}, {get:(_,key)=>key});
  }});
  const review = nodes(exports.MobilePublishFlow(guided.props));
  assert.equal(review.find(node=>node.props?.['aria-label']==='Edit project details').props.disabled,true);
  assert.equal(review.find(node=>node.props?.['aria-label']==='Edit cover').props.disabled,true);
  assert.equal(review.find(node=>node.props?.type==='submit').props.disabled,false);
  assert.ok(React.Children.toArray(review.find(node=>node.props?.type==='submit').props.children).includes('Finish saving details'));
});
