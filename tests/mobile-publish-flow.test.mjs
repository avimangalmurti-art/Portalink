import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const assetTypes={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/publishing/assetTypes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:assetTypes});
const validation={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/publishing/validation.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS},
}).outputText,{exports:validation});
const compiled = ts.transpileModule(readFileSync(new URL('../src/features/publishing/MobilePublishFlow.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
const text = tree => typeof tree === 'number' ? String(tree) : typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';
const action = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);
const button = (tree, label) => nodes(tree).find(node => (node.type === 'Button' || node.type === 'button') && text(node) === label);
const component = (tree, name) => nodes(tree).find(node => node.type === name);
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(overrides = {}, props = {}, presentation = 'mobile') {
  const calls = [], focus = [], focusCalls = [], scrollCalls = [], slots = []; let cursor = 0, effects = [], editingStep = 'files';
  const flow = { step: 'metadata', state: 'editing', isSavingDraft: false, isDiscarding: false,
    draft: { id: 'draft-a' }, metadata: { title: 'Quiet Rooms', summary: 'A study of space.' }, location: 'London', fieldErrors: {},
    inferredRelevance:{},ignoreInferredLocation:false,setIgnoreInferredLocation:value=>calls.push(['ignore-location',value]),
    media: { items: [{ id: 'image-a', isCover: true, family: 'image', capability: 'native', metadata: { coverPageNumber: 2 } }], isComplete: true, state: 'ready' },
    upload: { phase: 'idle', dismissFailure: () => calls.push('dismiss-upload'), cancel: () => calls.push('cancel') },
    publish: { status: 'idle', reset: () => calls.push('reset-error'), run: async () => calls.push('publish') },
    canPublish: true, setField: (key, value) => { flow.metadata[key] = value; }, setLocation: value => { flow.location = value; },
    setStep: value => { flow.step = value; }, dismissSaveDraftError: () => calls.push('dismiss-save'),
    goToPreview: async () => { calls.push('save'); flow.step = 'preview'; }, ...overrides };
  const exports = {};
  const focused = (id, options) => { focus.push(id); focusCalls.push({id,options}); };
  vm.runInNewContext(compiled, { exports, document: { getElementById: id => ({ focus: options => focused(id,options) }) }, require(name) {
    if (name === 'react') return { ...React, useRef: value => slots[cursor++] ??= { current: value }, useEffect(fn,deps) {
      const index=cursor++,previous=slots[index];
      if(!previous||!deps||deps.some((value,item)=>!Object.is(value,previous.deps?.[item]))) {slots[index]={deps};effects.push(fn);}
    } };
    if (name === './validation') return validation;
    if (name === './assetTypes') return assetTypes;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    return new Proxy({}, { get: (_, key) => key });
  } });
  const render = (step = editingStep) => { editingStep = step; cursor = 0; effects = [];
    const tree = exports.MobilePublishFlow({ flow, editingStep, onEditingStepChange: value => { editingStep = value; }, categoryLabel: 'Interiors', notices: React.createElement('aside', null, 'Service notices'), ...props });
    for(const node of nodes(tree)){
      if(node.ref&&node.type==='h3')node.ref.current={focus:options=>focused(node.props.id,options)};
      if(node.ref&&node.props.className?.includes('mobile-publish-body'))node.ref.current={scrollTo:options=>scrollCalls.push(options)};
    }
    effects.forEach(fn => fn()); return tree;
  };
  const submit = async tree => { tree.props.onSubmit({ preventDefault() {} }); await tick(); };
  return { flow, render, submit, calls, focus, focusCalls, scrollCalls };
}

test('Files → Details → Review preserves the same draft, files, cover and metadata without publishing', async () => {
  const h = harness(), media = h.flow.media, draft = h.flow.draft;
  let tree = h.render();
  assert.equal(component(tree, 'MobileCoverFiles').props.media, media);
  assert.equal(component(tree, 'ProfileField'), undefined);
  await h.submit(tree); tree = h.render();
  assert.ok(button(tree, 'Review project'));
  assert.equal(component(tree, 'MediaPicker'), undefined);
  const fields = nodes(tree).filter(node => node.type === 'ProfileField');
  assert.deepEqual(fields.map(node => node.props.id), ['publish-title', 'publish-summary', 'publish-location']);
  assert.equal(fields[0].props.maxLength, 80); assert.equal(fields[1].props.maxLength, undefined); assert.equal(fields[2].props.maxLength, 80);
  fields[1].props.onChange('Long description\n\n' + 'Full text '.repeat(2000));
  await h.submit(tree); tree = h.render();
  assert.ok(button(tree, 'Publish project'));
  assert.deepEqual(h.calls, ['save']);
  assert.equal(h.flow.media, media); assert.equal(h.flow.draft, draft);
  assert.equal(component(tree, 'FormattedText').props.text, h.flow.metadata.summary.trim());
  assert.ok(text(tree).includes('London')); assert.ok(text(tree).includes('Quiet Rooms')); assert.ok(text(tree).includes('London')); assert.ok(action(tree, 'Edit cover')); assert.ok(action(tree, 'Edit project details')); assert.ok(action(tree, 'Edit selected files'));
  assert.equal(component(tree, 'CoverFilmstrip').props.readOnly, true);
});

test('no files or file preparation blocks Continue and Enter', async () => {
  for (const media of [{ items: [], isComplete: false, state: 'empty' }, { items: [{}], isComplete: true, state: 'selecting' }]) {
    const h = harness({ media }), tree = h.render();
    assert.equal(button(tree, 'Continue to details').props.disabled, true);
    await h.submit(tree); assert.ok(button(h.render(), 'Continue to details')); assert.deepEqual(h.calls, []);
  }
});

test('validation/save failure stays on Details and repeated submits cannot duplicate the save', async () => {
  let finish; const h = harness();
  h.flow.goToPreview = () => { h.calls.push('save'); return new Promise(resolve => { finish = resolve; }); };
  const tree = h.render('details');
  await h.submit(tree); await h.submit(tree); assert.deepEqual(h.calls, ['save']);
  h.flow.saveDraftError = 'Draft save refused'; finish(); await tick();
  const failed = h.render();
  assert.ok(button(failed, 'Review project'));
  assert.ok(nodes(failed).some(node => node.props.role === 'alert' && text(node).includes('Draft save refused')));
  h.flow.invalidField = 'summary'; h.flow.fieldErrors = { summary: 'Add a description' };
  h.render(); assert.equal(h.focus.at(-1), 'publish-summary');
  assert.equal(h.calls.includes('publish'), false);
});

test('Back and edit retain input while dismissing a stale upload retry snapshot', () => {
  const h = harness({ step: 'preview' }), media = h.flow.media;
  action(h.render(), 'Edit selected files').props.onClick();
  assert.ok(button(h.render(), 'Continue to details')); assert.equal(h.flow.media, media);
  assert.deepEqual(h.calls, ['dismiss-upload', 'reset-error', 'dismiss-save']);
  assert.equal(h.flow.location, 'London'); assert.equal(h.flow.metadata.title, 'Quiet Rooms');
});

test('review retains transport controls and stored-file locks, and only final Publish calls publication', async () => {
  const h = harness({ step: 'preview' });
  let tree = h.render();
  assert.equal(component(tree, 'MediaPicker'), undefined);
  h.flow.upload.failure = { message: 'Try again' };
  tree = h.render();
  assert.equal(component(tree, 'MediaPicker').props.upload, h.flow.upload);
  assert.equal(component(tree, 'MediaPicker').props.disabled, true);
  await h.submit(tree); assert.deepEqual(h.calls, ['publish']);
  h.flow.upload.phase = 'uploaded'; tree = h.render();
  assert.equal(action(tree, 'Edit selected files').props.disabled, true);
  button(tree, 'Back').props.onClick(); tree = h.render();
  assert.ok(button(tree, 'Review project'));
  assert.equal(button(tree, 'Back').props.disabled, true, 'Stored files cannot be reopened through step Back');
  assert.ok(component(tree, 'ProfileField'));
});

test('saving, publishing, cleanup and discard block navigation and final submission', async () => {
  for (const overrides of [{ state: 'publishing' }, { isSavingDraft: true }, { isDiscarding: true }, { upload: { phase: 'failed', isCleaningUp: true } }]) {
    const h = harness({ step: 'preview', ...overrides }), tree = h.render();
    assert.equal(button(tree, 'Back').props.disabled, true);
    assert.equal(action(tree, 'Edit selected files').props.disabled, true);
    await h.submit(tree); assert.deepEqual(h.calls, []);
  }
});

test('saving on mobile close locks fields, cover edits and submission until dismissal settles', async () => {
  const h = harness({}, {closing:true});
  assert.equal(component(h.render(), 'MobileCoverFiles').props.disabled, true);
  const details = h.render('details');
  assert.ok(nodes(details).filter(node=>node.type==='ProfileField').every(node=>node.props.disabled));
  await h.submit(details);
  h.flow.step='preview';
  const review=h.render();
  assert.equal(button(review,'Publish project').props.disabled,true);
  await h.submit(review);
  assert.deepEqual(h.calls,[]);
});

test('legacy first-project drafts use one editable description instead of story questions', () => {
 const h=harness({metadata:{title:'Saved title',summary:'Saved description',creationDetails:{answers:{what:'Old answer',did:'Old role',learned:'Old lesson'}}}}, {firstProject:{name:'Creator',categories:['Work']}});
 const tree=h.render('details');
 const fields=nodes(tree).filter(node=>node.type==='ProfileField');
 assert.deepEqual(fields.map(node=>node.props.id),['publish-title','publish-summary','publish-location']);
 assert.equal(fields[1].props.value,'Saved description');
 fields[1].props.onChange('Updated description');assert.equal(h.flow.metadata.summary,'Updated description');
 assert.doesNotMatch(text(tree),/What is it|What did you|Every answer|Tell it in your own words/);
 assert.equal(component(h.render('files'),'MobileCoverFiles').props.media,h.flow.media);
});

 test('legacy drafts can add files and continue without a title on the Files step', async () => {
 const h=harness({metadata:{title:'',summary:'Description',creationDetails:{madeIn:'2026-07',field:'Old field'}}},{firstProject:{name:'Creator',categories:['Work']}});
 let tree=h.render('files');
 assert.ok(button(tree,'Continue to details'));
 await h.submit(tree);
 assert.ok(button(h.render(),'Review project'));
 h.flow.step='preview';tree=h.render();
 assert.doesNotMatch(text(tree),/2026-07|Old field/);
 });



test('WEB Review keeps ordered summaries and its existing thumbnail summary without changing state', () => {
 const h=harness({step:'preview',location:'',media:{items:Array.from({length:8},(_,n)=>({id:String(n),family:'image',previewUrl:`image-${n}`,metadata:{}})),isComplete:true,state:'ready'}},{},'web');
 const tree=h.render();
 const summaries=nodes(tree).filter(n=>n.type==='section').map(n=>n.props['aria-label']);
 assert.deepEqual(summaries,['Cover','Project details','Selected files']);
 const images=nodes(tree).filter(n=>n.type==='img');
 assert.deepEqual(images.map(n=>n.props.src),['image-0','image-1','image-2']);
 assert.ok(text(tree).includes('+5'));assert.ok(text(tree).includes('8 files'));
 assert.ok(!text(tree).includes('Location'));assert.ok(!text(tree).includes('Your files upload'));
 assert.equal(h.flow.media.items.length,8);
 action(tree,'Edit project details').props.onClick();assert.equal(h.flow.metadata.summary,'A study of space.');
});

test('MOBILE Review includes every selected file and labels the optional empty description',()=>{
 const items=Array.from({length:15},(_,index)=>({id:`file-${index}`,displayTitle:`Artwork ${index+1}`,family:'image',previewUrl:`image-${index}`,metadata:{}}));
 const h=harness({step:'preview',metadata:{title:'Title only',summary:''},media:{items,isComplete:true,state:'ready'}}),tree=h.render();
 assert.deepEqual(nodes(tree).filter(node=>node.type==='img').map(node=>node.props.src),items.map(item=>item.previewUrl));
 assert.equal(nodes(tree).filter(node=>node.props.role==='img').length,15);
 assert.ok(text(tree).includes('Description (optional)'));assert.ok(text(tree).includes('Not added'));assert.ok(text(tree).includes('15 files'));
 assert.equal(nodes(tree).some(node=>node.props.className==='mobile-review-more'),false);
 action(tree,'Edit selected files').props.onClick();
 assert.equal(component(h.render(),'MobileCoverFiles').props.media.items,items);assert.equal(h.flow.metadata.summary,'');
});

test('MOBILE Back follows the declared step order and WEB retains its original navigation',()=>{
 for(const detailsFirst of [false,true]){
  const h=harness({}, {detailsFirst}),first=detailsFirst?'details':'files',second=detailsFirst?'files':'details';
  assert.equal(button(h.render(first),'Back'),undefined);
  let tree=h.render(second),back=button(tree,'Back');
  assert.equal(back.props['aria-label'],detailsFirst?'Back to project details':'Back to files');
  back.props.onClick();assert.equal(button(h.render(),'Back'),undefined);
  h.flow.step='preview';tree=h.render();back=button(tree,'Back');
  assert.equal(back.props['aria-label'],detailsFirst?'Back to files':'Back to project details');
  back.props.onClick();assert.ok(component(h.render(),second==='files'?'MobileCoverFiles':'ProfileField'));
 }
 const web=harness({step:'preview'},{detailsFirst:true},'web');button(web.render(),'Back').props.onClick();
 assert.ok(component(web.render(),'ProfileField'));assert.equal(button(web.render(),'Back').props['aria-label'],undefined);
});
test('details-first project setup goes from files directly to review without a duplicate form or early publication',async()=>{
 const h=harness({}, {detailsFirst:true});let tree=h.render();
 assert.equal(nodes(tree).some(node=>node.type==='ol'||node.props['aria-current']==='step'),false);
 assert.ok(button(tree,'Review project'));
 await h.submit(tree);tree=h.render();
 assert.equal(h.flow.step,'preview');assert.deepEqual(h.calls,['save']);
 assert.ok(button(tree,'Publish project'));
 action(tree,'Edit project details').props.onClick();tree=h.render();
 assert.ok(component(tree,'ProfileField'));assert.equal(h.flow.metadata.title,'Quiet Rooms');
});

test('MOBILE leaves each stage title to its screen frame and removes the duplicate heading, context and tracker',()=>{
 for(const media of [{items:[],isComplete:false,state:'empty'},{items:[{id:'file',family:'image',metadata:{}}],isComplete:true,state:'ready'}]){
  const h=harness({media},{detailsFirst:true});
  for(const stage of ['files','details','review']){
   if(stage==='review')h.flow.step='preview';
   const tree=h.render(stage==='review'?'files':stage),all=nodes(tree);
   assert.equal(all.some(node=>node.type==='h1'||node.type==='h2'||node.type==='h3'),false);
   assert.equal(all.some(node=>node.type==='ol'||node.props['aria-current']==='step'||node.props.className==='project-creation-orientation'||node.props.className==='project-creation-context'),false);
   if(stage==='files')assert.equal(button(tree,'Review project').props.disabled,!media.isComplete);
   if(stage==='details')assert.equal(all.find(node=>node.props.className==='project-form-details').props['aria-labelledby'],'publish-dialog-title');
  }
 }
});

test('MOBILE stage changes focus and label the single outer title without scrolling the page',()=>{
 const h=harness({}, {screenTitleId:'custom-authoring-title'});
 h.render('files');h.render('files');
 assert.equal(h.focusCalls.length,1,'Unchanged stages do not refocus the title');
 let tree=h.render('details');
 assert.equal(nodes(tree).find(node=>node.props.className==='project-form-details').props['aria-labelledby'],'custom-authoring-title');
 h.flow.step='preview';h.render();
 assert.deepEqual(h.focus,['custom-authoring-title','custom-authoring-title','custom-authoring-title']);
 assert.ok(h.focusCalls.every(call=>call.options?.preventScroll===true));
 assert.equal(h.scrollCalls.length,3);assert.ok(h.scrollCalls.every(call=>call.top===0));
 h.flow.invalidField='summary';h.flow.fieldErrors={summary:'Invalid description'};h.flow.step='metadata';
 tree=h.render('details');assert.equal(h.focus.at(-1),'publish-summary','Validation still gives the invalid field final focus');
});

test('WEB keeps its existing numbered rail, inline headings, explanatory copy and heading focus',()=>{
 for(const detailsFirst of [false,true]){
  const h=harness({media:{items:[],isComplete:false,state:'empty'}},{detailsFirst,screenTitleId:'mobile-only-title'},'web');
  for(const [stage,expected] of [['files','Create your cover'],['details','Project details'],['review','Review project']]){
   if(stage==='review')h.flow.step='preview';
   const tree=h.render(stage==='review'?'files':stage),all=nodes(tree),rail=all.find(node=>node.type==='ol');
   assert.equal(rail.props['aria-label'],'Upload steps');
   const labels=detailsFirst?['Details','Files','Review']:['Files','Details','Review'];
   assert.deepEqual(nodes(rail).filter(node=>node.type==='li').map(node=>React.Children.toArray(node.props.children).at(-1)),labels);
   assert.equal(nodes(rail).find(node=>node.props['aria-current']==='step').props.children.at(-1),stage[0].toUpperCase()+stage.slice(1));
   assert.equal(all.find(node=>node.type==='h3').props.children,expected);
   if(stage==='files'){assert.match(text(tree),/Choose an image, adjust the crop and make it look its best\./);assert.equal(button(tree,detailsFirst?'Continue to upload':'Continue').props.disabled,true);}
   if(stage==='details')assert.equal(all.find(node=>node.props.className==='project-form-details').props['aria-labelledby'],'mobile-publish-step-title');
  }
  assert.ok(h.focusCalls.every(call=>call.id==='mobile-publish-step-title'&&call.options?.preventScroll===true));
  assert.equal(h.focusCalls.length,3);
 }
});

test('onboarding Files goes directly to Review on either platform using the same files and metadata',async()=>{
 for(const presentation of ['mobile','web']){
  const h=harness({}, {onboarding:true,detailsFirst:true,screenTitleId:'onboarding-title'},presentation),media=h.flow.media,draft=h.flow.draft;
  let tree=h.render(),all=nodes(tree);
  assert.equal(component(tree,'MobileCoverFiles').props.onboarding,true);
  assert.equal(all.some(node=>node.type==='ol'||node.type==='h3'),false);
  assert.ok(button(tree,'Review idea'));assert.deepEqual(h.calls,[]);
  await h.submit(tree);tree=h.render();assert.deepEqual(h.calls,['save']);
  assert.ok(button(tree,'Publish idea'));assert.equal(h.flow.media,media);assert.equal(h.flow.draft,draft);
  assert.equal(component(tree,'FormattedText').props.text,'A study of space.');
  assert.ok(h.focusCalls.every(call=>call.id==='onboarding-title'&&call.options?.preventScroll===true));
  action(tree,'Edit idea details').props.onClick();tree=h.render();
  assert.equal(component(tree,'ProfileField').props.value,'Quiet Rooms');
  assert.equal(nodes(tree).find(node=>node.props.className==='project-form-details').props['aria-labelledby'],'onboarding-title');
  assert.equal(h.flow.media,media);assert.equal(h.calls.includes('publish'),false);
 }
});

test('onboarding Files suppresses duplicate pending Review saves and allows retry after a refused save',async()=>{
 for(const presentation of ['mobile','web']){
  const h=harness({}, {onboarding:true,detailsFirst:true},presentation);let finish;
  h.flow.goToPreview=()=>{h.calls.push('save');return new Promise(resolve=>finish=resolve);};
  let tree=h.render();await h.submit(tree);await h.submit(tree);assert.deepEqual(h.calls,['save']);
  h.flow.saveDraftError='Save refused';finish();await tick();tree=h.render();
  assert.ok(nodes(tree).some(node=>node.props.role==='alert'&&text(node).includes('Save refused')));
  assert.ok(button(tree,'Review idea'));assert.equal(h.calls.includes('publish'),false);
  await h.submit(tree);assert.deepEqual(h.calls,['save','save']);finish();await tick();
 }
});

test('onboarding WEB Back retains file locks and details editing dismisses stale retry snapshots',()=>{
 const h=harness({step:'preview',upload:{phase:'uploaded',dismissFailure:()=>h.calls.push('dismiss-upload')}},{onboarding:true,detailsFirst:true},'web');
 let tree=h.render();const media=h.flow.media;
 assert.equal(button(tree,'Back').props['aria-label'],'Back to files');assert.equal(button(tree,'Back').props.disabled,true);
 assert.equal(action(tree,'Edit cover').props.disabled,true);assert.equal(action(tree,'Edit selected files').props.disabled,true);
 action(tree,'Edit idea details').props.onClick();tree=h.render();
 assert.deepEqual(h.calls,['dismiss-upload','reset-error','dismiss-save']);assert.equal(h.flow.media,media);
 assert.equal(button(tree,'Back'),undefined);assert.equal(component(tree,'ProfileField').props.value,'Quiet Rooms');
 h.flow.upload.phase='idle';h.flow.step='preview';tree=h.render();button(tree,'Back').props.onClick();
 assert.equal(component(h.render(),'MobileCoverFiles').props.media,media);
});

test('onboarding WEB details retain inferred place controls without introducing mobile manual-location behavior',()=>{
 const h=harness({inferredRelevance:{contentGeography:{label:'Oakland'}}},{onboarding:true,detailsFirst:true},'web');
 const tree=h.render('details');
 assert.equal(nodes(tree).some(node=>node.props.id==='publish-location'),false);
 const relevance=nodes(tree).find(node=>node.type==='button'&&text(node)==='This project is not location-specific');
 assert.ok(relevance);relevance.props.onClick();assert.deepEqual(h.calls,[['ignore-location',true]]);
 assert.equal(h.flow.location,'London');assert.equal(h.flow.metadata.title,'Quiet Rooms');
});

test('explicit onboarding Review returns invalid titles to visible Details without losing files or publishing',async()=>{
 for(const presentation of ['mobile','web'])for(const [stage,complete] of [['files',true],['details',false],['details',true]]){
  const h=harness({metadata:{title:'  ',summary:'Retained note'},media:{items:complete?[{id:'kept-file',isCover:true}]:[],isComplete:complete,state:complete?'ready':'empty'}},{onboarding:true,detailsFirst:true},presentation);
  const media=h.flow.media,draft=h.flow.draft;
  h.flow.goToPreview=async()=>{
   const invalid=validation.validateTitle(h.flow.metadata.title);h.calls.push('validate');
   if(invalid){h.flow.fieldErrors={title:invalid};h.flow.invalidField='title';return;}
   if(h.flow.media.isComplete){h.calls.push('save');h.flow.step='preview';}
  };
  await h.submit(h.render(stage));const tree=h.render(),title=nodes(tree).find(node=>node.props.id==='publish-title');
  assert.ok(title,'The title error must have a visible Details field');assert.equal(title.props.value,'  ');
  assert.equal(title.props.error,validation.validateTitle('  '));assert.equal(h.focus.at(-1),'publish-title');
  assert.deepEqual(h.calls,['validate']);assert.equal(h.flow.step,'metadata');
  assert.equal(h.flow.media,media);assert.equal(h.flow.draft,draft);assert.equal(h.flow.metadata.summary,'Retained note');
 }
});

test('stale title errors never interrupt onboarding file selection when the current title is valid',async()=>{
 for(const presentation of ['mobile','web']){
  const h=harness({invalidField:'title',fieldErrors:{title:'Old title error'}},{onboarding:true,detailsFirst:true},presentation),media=h.flow.media;
  h.flow.goToPreview=async()=>{
   const invalid=validation.validateTitle(h.flow.metadata.title);
   if(invalid){h.flow.fieldErrors={title:invalid};h.flow.invalidField='title';return;}
   h.calls.push('save');h.flow.step='preview';
  };
  let tree=h.render('files');h.render();
  assert.ok(component(tree,'MobileCoverFiles'));assert.equal(component(tree,'ProfileField'),undefined);
  assert.equal(h.focus.includes('publish-title'),false);assert.deepEqual(h.calls,[]);
  await h.submit(tree);tree=h.render();assert.ok(button(tree,'Publish idea'));
  assert.deepEqual(h.calls,['save']);assert.equal(h.flow.media,media);assert.equal(h.flow.metadata.title,'Quiet Rooms');
 }
});

test('valid onboarding Details without files still proceeds to file selection without saving or publishing',async()=>{
 for(const presentation of ['mobile','web']){
  const h=harness({media:{items:[],isComplete:false,state:'empty'}},{onboarding:true,detailsFirst:true},presentation);
  const media=h.flow.media;const tree=h.render('details');assert.ok(button(tree,'Continue to upload'));
  await h.submit(tree);assert.ok(component(h.render(),'MobileCoverFiles'));assert.equal(h.flow.media,media);
  assert.deepEqual(h.calls,[]);assert.equal(h.flow.metadata.title,'Quiet Rooms');
 }
});

test('onboarding Review shows full authored details and accessible mixed-file summaries on both platforms',()=>{
 for(const presentation of ['mobile','web']){
  const title='An unabridged idea title for a catalogue of thoughtful experiments';
  const summary='A complete first paragraph.\n\nA second paragraph with **formatting** and the last detail.';
  const items=Array.from({length:15},(_,index)=>({id:`review-${index}`,displayTitle:`Selected file ${index+1}`,family:index===1?'document':index===2?'audio':'image',previewUrl:`review-image-${index}`,capability:'native',isCover:index===0,metadata:{coverPageNumber:2}}));
  const h=harness({step:'preview',metadata:{title:`  ${title}  `,summary:`  ${summary}  `},location:'  Kyoto  ',media:{items,isComplete:true,state:'ready'}},{onboarding:true,detailsFirst:true},presentation);
  const tree=h.render(),sections=nodes(tree).filter(node=>node.type==='section');
  assert.deepEqual(sections.map(node=>node.props['aria-label']),['Cover','Idea details','Selected files']);
  assert.equal(nodes(tree).some(node=>node.type==='h3'),false);
  assert.equal(nodes(tree).some(node=>node.type==='img'&&node.props.src?.startsWith('/onboarding/')),false);
  assert.ok(nodes(sections[1]).some(node=>node.type==='strong'&&text(node)==='Interiors'));
  assert.ok(text(sections[1]).includes('Portal'));
  const details=sections[1],files=sections[2];
  assert.equal(text(nodes(details).find(node=>node.type==='h4')),title);
  assert.equal(component(details,'FormattedText').props.text,summary);
  assert.ok(text(details).includes('Kyoto'));
  assert.doesNotMatch(text(details),/Description \(optional\)|Not added/);
  const cover=component(sections[0],'CoverFilmstrip');
  assert.equal(cover.props.media,h.flow.media);assert.equal(cover.props.compact,true);assert.equal(cover.props.readOnly,true);assert.equal(cover.props.disabled,true);
  assert.equal(text(nodes(files).find(node=>node.type==='h4')),'15 files');
  const thumbnails=nodes(files).filter(node=>node.type==='span'&&node.props.children&&nodes(node).some(child=>child.type==='img'||child.type==='FileIcon'));
  assert.equal(thumbnails.length,presentation==='mobile'?15:3);
  assert.deepEqual(nodes(files).filter(node=>node.type==='img').map(node=>node.props.src),items.slice(0,presentation==='mobile'?15:3).filter(item=>item.family==='image').map(item=>item.previewUrl));
  if(presentation==='mobile'){
   assert.ok(nodes(files).some(node=>node.props.role==='group'&&node.props['aria-label']==='Selected project files'));
   assert.deepEqual(nodes(files).filter(node=>node.props.role==='img').map(node=>node.props['aria-label']),items.map((item,index)=>`File ${index+1}: ${item.displayTitle}`));
   assert.ok(!text(files).includes('+12'));
  }else assert.ok(text(files).includes('+12'));
  assert.equal(h.flow.media.items,items);assert.deepEqual(h.calls,[]);
 }
});

test('all onboarding Review edit routes preserve the same draft, media, crop and authored details',()=>{
 for(const presentation of ['mobile','web'])for(const label of ['Edit cover','Edit idea details','Edit selected files']){
  const h=harness({step:'preview'},{onboarding:true,detailsFirst:true},presentation),media=h.flow.media,draft=h.flow.draft,cover=media.items[0],crop=cover.metadata;
  action(h.render(),label).props.onClick();const tree=h.render();
  assert.deepEqual(h.calls,['dismiss-upload','reset-error','dismiss-save']);
  assert.equal(h.flow.step,'metadata');assert.equal(h.flow.media,media);assert.equal(h.flow.draft,draft);
  assert.equal(media.items[0],cover);assert.equal(cover.metadata,crop);assert.equal(crop.coverPageNumber,2);
  assert.equal(h.flow.metadata.title,'Quiet Rooms');assert.equal(h.flow.metadata.summary,'A study of space.');assert.equal(h.flow.location,'London');
  if(label==='Edit idea details')assert.equal(nodes(tree).find(node=>node.props.id==='publish-title').props.value,'Quiet Rooms');
  else assert.equal(component(tree,'MobileCoverFiles').props.media,media);
 }
});

test('onboarding Review keeps busy and stored-file edit locks on either platform',async()=>{
 for(const presentation of ['mobile','web']){
  for(const [overrides,props] of [[{state:'publishing'},{}],[{isSavingDraft:true},{}],[{isDiscarding:true},{}],[{upload:{phase:'failed',isCleaningUp:true}},{}],[{media:{items:[{id:'kept',isCover:true}],isComplete:true,state:'selecting'}},{}],[{}, {closing:true}]]){
   const h=harness({step:'preview',...overrides},{onboarding:true,detailsFirst:true,...props},presentation),tree=h.render();
   for(const label of ['Edit cover','Edit idea details','Edit selected files'])assert.equal(action(tree,label).props.disabled,true);
   assert.equal(button(tree,'Back').props.disabled,true);
   assert.equal(button(tree,overrides.state==='publishing'?'Publishing…':overrides.isSavingDraft?'Saving details…':'Publish idea').props.disabled,true);
   await h.submit(tree);assert.deepEqual(h.calls,[]);
  }
  const h=harness({step:'preview',upload:{phase:'uploaded',dismissFailure:()=>h.calls.push('dismiss-upload')}},{onboarding:true,detailsFirst:true},presentation),tree=h.render(),media=h.flow.media;
  assert.equal(action(tree,'Edit cover').props.disabled,true);assert.equal(action(tree,'Edit selected files').props.disabled,true);assert.equal(button(tree,'Back').props.disabled,true);
  assert.equal(action(tree,'Edit idea details').props.disabled,false);action(tree,'Edit idea details').props.onClick();
  assert.ok(component(h.render(),'ProfileField'));assert.equal(h.flow.media,media);assert.equal(h.calls.includes('publish'),false);
 }
});

test('committed onboarding Review stays truthful, locks editing and guards final-detail retries',async()=>{
 for(const presentation of ['mobile','web']){
  const h=harness({hasCommittedProject:true,step:'metadata'},{onboarding:true,detailsFirst:true},presentation),tree=h.render('details');
  assert.ok(nodes(tree).some(node=>node.props.role==='status'&&text(node).includes('Your idea is published.')));
  assert.ok(text(tree).includes('Finish saving its details.'));assert.ok(!text(tree).includes('Ready for your catalogue'));
  assert.equal(component(tree,'ProfileField'),undefined);
  for(const label of ['Edit cover','Edit idea details','Edit selected files']){
   const edit=action(tree,label);assert.equal(edit.props.disabled,true);edit.props.onClick();
  }
  assert.equal(button(tree,'Back').props.disabled,true);assert.deepEqual(h.calls,[]);
  const finishButton=button(tree,'Finish saving details');assert.equal(finishButton.props.disabled,false);
  let finish;h.flow.publish.run=()=>{h.calls.push('publish');return new Promise(resolve=>finish=resolve);};
  await h.submit(tree);await h.submit(tree);assert.deepEqual(h.calls,['publish']);
  finish();await tick();await h.submit(h.render());assert.deepEqual(h.calls,['publish','publish']);finish();await tick();
  h.flow.canPublish=false;const blocked=h.render();assert.equal(button(blocked,'Finish saving details').props.disabled,true);
  await h.submit(blocked);assert.deepEqual(h.calls,['publish','publish']);
 }
});

test('onboarding Review handles missing cover and optional details while retaining failure and cleanup transport',()=>{
 for(const presentation of ['mobile','web'])for(const transport of [{failure:{message:'Upload refused'}},{cleanupError:'Cleanup refused'}]){
  const h=harness({step:'preview',metadata:{title:'Audio study',summary:'  '},location:' ',media:{items:[{id:'audio',displayTitle:'Recorded idea',family:'audio',metadata:{}}],isComplete:true,state:'ready'}},{onboarding:true,detailsFirst:true},presentation);
  Object.assign(h.flow.upload,transport);const tree=h.render(),details=nodes(tree).find(node=>node.type==='section'&&node.props['aria-label']==='Idea details');
  assert.ok(text(tree).includes('No cover selected'));assert.equal(component(tree,'CoverFilmstrip'),undefined);
  assert.equal(component(details,'FormattedText'),undefined);assert.ok(text(details).includes('No description added.'));assert.doesNotMatch(text(details),/Not added|Location/);
  assert.equal(text(nodes(nodes(tree).find(node=>node.type==='section'&&node.props['aria-label']==='Selected files')).find(node=>node.type==='h4')),'1 file');
  const transportPicker=component(tree,'MediaPicker');assert.equal(transportPicker.props.media,h.flow.media);assert.equal(transportPicker.props.upload,h.flow.upload);assert.equal(transportPicker.props.compact,true);assert.equal(transportPicker.props.disabled,true);
  assert.ok(action(tree,'Edit cover'));assert.ok(action(tree,'Edit idea details'));assert.ok(action(tree,'Edit selected files'));assert.ok(button(tree,'Publish idea'));
  assert.deepEqual(h.calls,[]);
 }
});

test('Review never presents a stale converted Word cover as a rendered page on either platform',()=>{
 for(const presentation of ['mobile','web']){
  const word={id:'word',displayTitle:'Notes.docx',family:'document',capability:'converted',isCover:true,previewUrl:null};
  const h=harness({step:'preview',media:{items:[word],isComplete:true,state:'ready'}},{onboarding:true,detailsFirst:true},presentation);
  const tree=h.render();assert.equal(component(tree,'CoverFilmstrip'),undefined);assert.ok(text(tree).includes('No cover selected'));
  assert.ok(text(tree).includes('Interiors'));assert.ok(text(tree).includes('Quiet Rooms'));
  assert.equal(component(tree,'FormattedText').props.text,'A study of space.');assert.equal(h.flow.media.items[0],word);assert.deepEqual(h.calls,[]);
 }
});
