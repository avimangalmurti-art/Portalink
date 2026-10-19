import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

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
    media: { items: [{ id: 'image-a', isCover: true, metadata: { coverPageNumber: 2 } }], isComplete: true, state: 'ready' },
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
    if (name === './validation') return { TITLE_MAX_LENGTH: 80 };
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
