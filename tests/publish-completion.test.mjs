import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

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
  const resumeDraft = {id:'saved-draft',profileId:'creator',categoryId:'category'};
  for (const presentation of ['mobile', 'web']) for (const firstProject of [undefined, { madeIn: '2026-05', name: 'Mira', categories: ['Work'] }]) {
    const h = harness(presentation);
    h.render({}, { firstProject, initialMetadata, resumeDraft });
    const args = h.hookCalls[0];
    assert.deepEqual(args.slice(0, 4), ['creator', 'category', true, 'Typography']);
    assert.equal(args[4], presentation === 'mobile');
    assert.equal(args[5], false, 'Ordinary project publishing must not become the onboarding flow');
    assert.equal(args[7].persist, true);
    assert.equal(args[7].initialMetadata, initialMetadata);
    assert.equal(args[7].resume, resumeDraft);
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
  const tree=h.render(flow,{firstProject:{madeIn:'2026-05'}});
  assert.equal(tree.type,'ProjectFormScreen');assert.equal(tree.props.title,expected);
  assert.equal(tree.props.titleId,'publish-dialog-title');
  const guided=nodes(tree).find(node=>node.type==='MobilePublishFlow');
  assert.equal(guided.props.firstProject,true);
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
  const dated=harness('web').render({...flow,metadata:{title:'Work',summary:'',creationDetails:{madeIn:'2024-07'}}},{firstProject:{madeIn:'2026-05'}});
  assert.equal(dated.props.title,'Add work from 2024');
  const fallback=harness('web').render(flow,{firstProject:{madeIn:'2026-05'}});
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
   if(name.endsWith('/usePresentation'))return {usePresentation:()=> 'mobile'};
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
    assert.ok(nodes(tree).some((node) => node.props?.id === 'publish-hint' && node.props.role === 'status' && node.props.children === expected));
    assert.equal(nodes(tree).find((node) => node.props?.type === 'submit').props.disabled, true);
  }
  const tree = harness(presentation).render({ firstProject: false, metadata: { title: 'My project', summary: '' }, canPublish: true, media: { items: [{}] } });
  assert.equal(nodes(tree).find((node) => node.props?.type === 'submit').props.disabled, false);
  assert.ok(!nodes(tree).some((node) => node.props?.id === 'publish-hint'));
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
  const tree = harness('mobile').render({firstProjectStage:'details',metadata:{title:'Saved title',summary:'',creationDetails:{madeIn:'2024-05',field:'Design',answers:{what:'Saved answer',did:'',learned:''}}}, media:{items:[{id:'saved-file'}]}}, {firstProject:{}});
  const guided=nodes(tree).find(node=>node.type==='MobilePublishFlow');
  assert.equal(guided.props.editingStep,'details');assert.equal(guided.props.flow.metadata.creationDetails.answers.what,'Saved answer');assert.equal(guided.props.flow.media.items[0].id,'saved-file');
});
test('first-project close waits for discard cleanup and retains the draft on failure', async () => {
  let closed=0;
  const tree=harness('mobile').render({discard:async()=>false}, {firstProject:{},onClose:()=>closed++});
  await tree.props.onClose();assert.equal(closed,0);
});


test('first-project recovery retains safe close and locked fields after switching to WEB', async () => {
  let saved=0,closed=0;
  const tree=harness('web').render({hasCommittedProject:true,saveLocalDraft:async()=>{saved++;},discard:async()=>assert.fail('A committed project must preserve its recovery checkpoint'),canPublish:true,media:{items:[{}]}},{firstProject:{},onClose:()=>closed++});
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

test('shared setup opts WEB and MOBILE into Files, Details and Review while legacy WEB remains unchanged',()=>{
 const initialMetadata={title:'Creator idea',summary:'Creator note'};
 for(const presentation of ['mobile','web']){
  const h=harness(presentation);
  for(const [flow,title,stage] of [
   [{firstProjectStage:'files'},'Files & cover','files'],
   [{firstProjectStage:'details'},'Project details','details'],
   [{step:'preview',firstProjectStage:'files'},'Review project','files'],
   [{hasCommittedProject:true,firstProjectStage:'details',state:'failed'},'Review project','details'],
  ]){
   const tree=h.render(flow,{initialMetadata}),guided=nodes(tree).find(node=>node.type==='MobilePublishFlow');
   assert.equal(tree.type,presentation==='mobile'?'ProjectFormScreen':'ProjectFormDialog');
   assert.equal(tree.props.onboarding,true);assert.equal(tree.props.mobileFlow,true);assert.equal(tree.props.title,title);
   assert.equal(guided.props.onboarding,true);assert.equal(guided.props.detailsFirst,true);assert.equal(guided.props.editingStep,stage);
   assert.equal(guided.props.flow.metadata.title,' Wet Paint ');
  }
 }
 const legacy=harness('web').render();assert.equal(legacy.props.title,'New project');assert.equal(legacy.props.onboarding,false);
 assert.equal(nodes(legacy).some(node=>node.type==='MobilePublishFlow'),false);
});

test('onboarding WEB preparing files locks close and preserves separate upload and publication retry actions',async()=>{
 const initialMetadata={title:'Creator idea',summary:''};let closed=0,discarded=0,uploadRetries=0,publishRetries=0;
 const h=harness('web'),preparing=h.render({media:{items:[],state:'selecting'},discard:async()=>{discarded++;return true;}},{initialMetadata,onClose:()=>closed++});
 assert.equal(preparing.props.closeDisabled,true);await preparing.props.onClose();assert.equal(closed,0);assert.equal(discarded,0);
 const upload=h.render({state:'failed',upload:{failure:{message:'Upload refused'}},retryUpload:()=>uploadRetries++},{initialMetadata});
 let notices=nodes(upload).find(node=>node.type==='MobilePublishFlow').props.notices;
 nodes(notices).find(node=>node.type==='button'&&node.props.children==='Retry upload').props.onClick();
 assert.equal(uploadRetries,1);assert.equal(publishRetries,0);assert.equal(h.calls.length,0);
 const publish=h.render({state:'failed',publish:{status:'error',error:'Publish refused'},retryPublish:()=>publishRetries++},{initialMetadata});
 notices=nodes(publish).find(node=>node.type==='MobilePublishFlow').props.notices;
 nodes(notices).find(node=>node.type==='button'&&node.props.children==='Try again').props.onClick();
 assert.equal(uploadRetries,1);assert.equal(publishRetries,1);assert.equal(h.calls.length,0);
});

test('opt-in frames expose a focusable dialog heading and retain locked Escape dismissal on both platforms',()=>{
 const frameSource=readFileSync(new URL('../src/components/publishing/ProjectFormDialog.tsx',import.meta.url),'utf8');
 let trap,framePresentation='web';const frameExports={};
 vm.runInNewContext(ts.transpileModule(frameSource,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{
  React,exports:frameExports,require(name){
   if(name==='react')return {...React,useRef:value=>({current:value}),useLayoutEffect(){}};
   if(name==='framer-motion')return {motion:{div:'div',section:'section'},useReducedMotion:()=>true};
   if(name.endsWith('/motion/motion'))return {motionSeconds:()=>0,motionCurve:()=>[0,0,1,1]};
   if(name.endsWith('/useModalFocus'))return {useModalFocus:(_open,_ref,onClose)=>{trap=onClose;}};
   if(name.endsWith('/useDialogViewport'))return {useDialogViewport:()=>({current:null})};
   if(name.endsWith('/usePresentation'))return {usePresentation:()=>framePresentation};
   if(name.endsWith('/useTouchTap'))return {useTouchTap:()=>({})};
   if(name==='./useAuthoringFocus')return {useAuthoringFocus(){}};
   return new Proxy({},{get:(_,key)=>key});
  },
 });
 for(const name of ['ProjectFormDialog','ProjectFormScreen'])for(const closeDisabled of [false,true]){
  framePresentation=name==='ProjectFormScreen'?'mobile':'web';
  let closed=0;const tree=frameExports[name]({title:'Files & cover',titleId:'guided-title',onboarding:true,closeDisabled,onClose:()=>closed++,children:React.createElement('form',null)});
  const all=nodes(tree),dialog=all.find(node=>node.props?.role==='dialog');
  const headings=all.filter(node=>typeof node.type==='string'&&/^h[1-6]$/.test(node.type));
  assert.equal(headings.length,1);assert.equal(headings[0].props.id,dialog.props['aria-labelledby']);
  assert.equal(headings[0].props.tabIndex,-1);assert.equal(all.find(node=>node.type==='button').props.disabled,closeDisabled);
  trap();assert.equal(closed,closeDisabled?0:1);
 }
});

function postPublishDialogHarness(presentation){
 const calls=[],effects=[],slots=[],listeners=new Map(),windowListeners=new Map();let cursor=0;
 const doc={activeElement:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 const browser={location:{href:'https://portalink.example.test/p/owner'},addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:(name,fn)=>{if(windowListeners.get(name)===fn)windowListeners.delete(name);}};
 class Element{
  constructor(name){this.name=name;this.isConnected=true;this.tabIndex=0;this.controls=[];this.parent=null;}
  focus(){doc.activeElement=this;}
  matches(selector){return selector===':disabled'&&Boolean(this.disabled);}
  closest(selector){return selector.includes('[role="dialog"]')?(this===panel||this.parent===panel?panel:null):null;}
  getClientRects(){return [{}];}
  contains(element){return element===this||this.controls.includes(element);}
  querySelectorAll(){return this.controls;}
 }
 const opener=new Element('opener'),panel=new Element('dialog');doc.activeElement=opener;
 const react={...React,useRef:value=>slots[cursor++]??={current:value},useEffect:(fn,deps)=>{const index=cursor++,previous=slots[index];if(!previous||!deps||deps.some((value,item)=>!Object.is(value,previous.deps?.[item])))effects.push(()=>{previous?.cleanup?.();slots[index]={deps,cleanup:fn()};});}};
 const globals={document:doc,window:browser,HTMLElement:Element,getComputedStyle:()=>({visibility:'visible'})};
 const focus=sourceModule('src/hooks/useModalFocus.ts',{react},globals);
 const api=sourceModule('src/features/publishing/PostPublishIdeaDialog.tsx',{
  react,'lucide-react':{ArrowRightIcon:'arrow-icon',XIcon:'close-icon'},'../../components/ui/ModalPortal':{ModalPortal:'portal'},
  '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':focus,
  '../../presentation/usePresentation':{usePresentation:()=>presentation},'./post-publish-idea.css':{},
 },globals);
 const props={onClose:()=>calls.push('close'),onViewIdea:()=>calls.push('idea'),onOpenCatalogue:()=>calls.push('catalogue')};
 const render=changes=>{
  Object.assign(props,changes);cursor=0;effects.length=0;
  const tree=api.PostPublishIdeaDialog(props),all=nodes(tree),dialog=all.find(node=>node.props?.role==='dialog');dialog.ref.current=panel;
  const buttons=all.filter(node=>node.type==='button');panel.controls=buttons.map((_,index)=>{if(panel.controls[index])return panel.controls[index];const control=new Element(`button-${index}`);control.parent=panel;return control;});
  for(const effect of effects)effect();return {tree,all,dialog,buttons};
 };
 const rendered=render();
 const key=(value,options={})=>{let prevented=false,stopped=false;listeners.get('keydown')?.({key:value,target:doc.activeElement,preventDefault(){prevented=true;},stopPropagation(){stopped=true;},...options});return {prevented,stopped};};
 return {...rendered,calls,panel,opener,doc,listeners,windowListeners,key,rerender:render,
  pop:(href=browser.location.href)=>{browser.location.href=href;windowListeners.get('popstate')?.();},
  cleanup:()=>slots.forEach(slot=>slot?.cleanup?.()),
 };
}
const dialogText=tree=>typeof tree==='string'?tree:Array.isArray(tree)?tree.map(dialogText).join(''):React.isValidElement(tree)?dialogText(tree.props.children):'';

test('published idea dialog exposes meaningful context and explicit actions on both platforms',()=>{
 for(const presentation of ['mobile','web']){
  const h=postPublishDialogHarness(presentation);
  try{
   assert.equal(h.dialog.props['aria-modal'],'true');assert.equal(h.dialog.props.tabIndex,-1);
   const heading=h.all.find(node=>node.type==='h1'),description=h.all.find(node=>node.props?.id===h.dialog.props['aria-describedby']);
   assert.equal(heading.props.id,h.dialog.props['aria-labelledby']);assert.equal(dialogText(heading),'Your project is published');assert.equal(dialogText(description),'Your catalogue is growing.');
   assert.ok(h.all.some(node=>node.props?.['data-presentation']===presentation));
   const art=h.all.find(node=>node.props?.['aria-hidden']==='true'&&nodes(node).some(child=>child.type==='img'));
   assert.equal(nodes(art).find(node=>node.type==='img').props.alt,'');
   h.buttons.find(node=>dialogText(node)==='View project').props.onClick();h.buttons.find(node=>dialogText(node)==='My catalogue').props.onClick();
   h.buttons.find(node=>node.props['aria-label']==='Close published project confirmation').props.onClick();
   assert.deepEqual(h.calls,['idea','catalogue','close']);
  }finally{h.cleanup();}
 }
});

test('published idea dialog uses the real shared Escape and Tab trap and restores opener focus',()=>{
 for(const presentation of ['mobile','web']){
  const h=postPublishDialogHarness(presentation);
  try{
   assert.equal(h.doc.activeElement,h.panel,'The mounted modal receives focus.');
   assert.equal(h.key('Tab').prevented,true);assert.equal(h.doc.activeElement,h.panel.controls[0]);
   assert.equal(h.key('Tab',{shiftKey:true}).prevented,true);assert.equal(h.doc.activeElement,h.panel.controls.at(-1));
   assert.equal(h.key('Tab').prevented,true);assert.equal(h.doc.activeElement,h.panel.controls[0]);
   const escape=h.key('Escape');assert.deepEqual(escape,{prevented:true,stopped:true});assert.deepEqual(h.calls,['close']);
  }finally{h.cleanup();}
  assert.equal(h.doc.activeElement,h.opener);assert.equal(h.listeners.has('keydown'),false);assert.equal(h.listeners.has('focusin'),false);
 }
});

test('published idea backdrop dismisses only a direct backdrop press',()=>{
 for(const presentation of ['mobile','web']){
  const h=postPublishDialogHarness(presentation);
  try{
   const backdrop=h.all.find(node=>node.props?.onPointerDown),backdropElement={};
   backdrop.props.onPointerDown({target:h.panel,currentTarget:backdropElement});assert.deepEqual(h.calls,[]);
   backdrop.props.onPointerDown({target:backdropElement,currentTarget:backdropElement});assert.deepEqual(h.calls,['close']);
  }finally{h.cleanup();}
 }
});

test('published idea history dismissal respects presentation, uses the latest close callback and removes its listener',()=>{
 for(const presentation of ['mobile','web']){
  const h=postPublishDialogHarness(presentation),registered=h.windowListeners.get('popstate');
  try{
   assert.equal(typeof registered,'function');
   h.rerender({onClose:()=>h.calls.push('latest-close')});
   assert.equal(h.windowListeners.get('popstate'),registered,'A callback change retains one stable history listener.');
   h.pop();assert.deepEqual(h.calls,presentation==='mobile'?[]:['latest-close']);
   h.pop('https://portalink.example.test/p/earlier');
   assert.deepEqual(h.calls,presentation==='mobile'?['latest-close']:['latest-close','latest-close']);
  }finally{h.cleanup();}
  assert.equal(h.windowListeners.has('popstate'),false);
 }
});
