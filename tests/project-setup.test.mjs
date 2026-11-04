import assert from 'node:assert/strict';import test from 'node:test';import{readFileSync}from'node:fs';import vm from'node:vm';import React from'react';import ts from'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
const portalButton = (all, label) => all.find(node => node.type === 'button' && node.props.children === label);
const portalList = all => all.find(node => node.type === 'ul' && node.props.id === 'project-setup-portal-list');
const portalChoice = (all, id) => nodes(portalList(all)).find(node => node.type === 'button' && node.props.value === id);
const newPortalDialog = all => all.find(node => node.type === 'NewCategoryDialog');
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>mocks[n]??{}});return exports;}
const validation=load('../src/features/publishing/validation.ts',{}),category=load('../src/features/profile/useCategoryManagement.ts',{});
function harness(create=async(name,iconName)=>({id:'created',label:name,iconName}),confirm,{initialCategories=[{id:'existing',label:'Design'}],presentation='mobile'}={}){
 let categories=initialCategories;let cursor=0;const slots=[],calls=[],cleanups=[];let mounted=false;const react={...React,useEffect(effect){if(!mounted){cleanups.push(effect());}},useRef:v=>slots[cursor++]??={current:v},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}};
 const {ProjectSetupScreen}=load('../src/features/publishing/ProjectSetupScreen.tsx',{'react':react,'lucide-react':{PlusIcon:'plus-icon',XIcon:'close-icon'},'../../components/profile/categoryIcons':{portalIconNames:['shapes','camera','globe','lucide:book-open']},'../../components/profile/NewCategoryDialog':{NewCategoryDialog:'NewCategoryDialog'},'./validation':validation,'../profile/useCategoryManagement':category,'../../components/ui/ModalPortal':{ModalPortal:'portal'},'../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':{useModalFocus(){}},'../../components/publishing/useAuthoringFocus':{useAuthoringFocus(){}},'../../presentation/usePresentation':{usePresentation:()=>presentation}});
 const render=()=>{cursor=0;const tree=ProjectSetupScreen({categories,onCreatePortal:async(n,iconName)=>{calls.push(['create',n,iconName]);return create(n,iconName)},onConfirmPortal:confirm,onContinue:v=>calls.push(['continue',v]),onClose:()=>calls.push(['close'])});mounted=true;return tree;};
 const change=(label,value)=>{const n=nodes(render()).find(n=>n.props['aria-label']===label||n.type==='textarea'&&label==='Note (optional)'||n.props.name==='title'&&label==='Title');n.props.onChange({target:{value}})};
 const choosePortal = id => {
  if (presentation === 'web') { change('Portal', id); return; }
  const all = nodes(render());
  if (id === 'new') { portalButton(all, 'New Portal').props.onClick(); return; }
  if (portalList(all).props.hidden) portalButton(all, 'Portals').props.onClick();
  const choice = portalChoice(nodes(render()), id);
  assert.ok(choice, `Available Portal ${id}`);
  choice.props.onClick();
 };
 const submit=()=>nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 const dialog = () => newPortalDialog(nodes(render()));
 return{render,change,choosePortal,submit,dialog,calls,setCategories(value){categories=value;},unmount(){cleanups.forEach(fn=>fn?.());}};
}
const tick=()=>new Promise(setImmediate);
test('details first: validation blocks writes, existing portal and entered metadata hand off without creation',async()=>{const h=harness();h.submit();await tick();assert.equal(h.calls.length,0);h.change('Title','  My project ');h.change('Note (optional)',' A description ');h.submit();await tick();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'continue');assert.equal(h.calls[0][1].categoryId,'existing');assert.equal(h.calls[0][1].title,'My project');assert.equal(h.calls[0][1].summary,'A description');});
test('the canonical creator rejects duplicate Portal names before writing', async () => {
 const h = harness();
 h.choosePortal('new');
 await h.dialog().props.onCreate('Design', 'camera');
 assert.equal(h.calls.length, 0);
 assert.match(h.dialog().props.error, /already have.*name/i);
 assert.equal(h.dialog().props.isSaving, false);
});

test('a failed Portal create stays in the canonical dialog and retries with the chosen icon', async () => {
 let attempts = 0;
 const h = harness(async (name, iconName) => ++attempts === 1 ? null : {id:'new-portal',label:name,iconName});
 h.change('Title', 'Project');
 h.change('Note (optional)', 'Description');
 h.choosePortal('new');
 h.dialog().props.onDraftChange('Photography', 'camera');
 await h.dialog().props.onCreate('Photography', 'camera');
 const failed = h.dialog();
 assert.ok(failed.props.error);
 assert.equal(failed.props.isSaving, false);
 assert.deepEqual(h.calls, [['create','Photography','camera']]);
 await failed.props.onCreate('Photography', 'camera');
 assert.deepEqual(h.calls, [['create','Photography','camera'], ['create','Photography','camera']]);
 assert.equal(h.dialog(), undefined);
 const all = nodes(h.render());
 assert.equal(all.find(node => node.props.name === 'title').props.value, 'Project');
 assert.equal(all.find(node => node.type === 'textarea').props.value, 'Description');
 assert.equal(portalChoice(all, 'new-portal').props['aria-pressed'], true);
});

test('a confirmation failure retries the created Portal without another creation', async () => {
 for (const presentation of ['mobile','web']) {
  let checks = 0;
  const h = harness(async name => ({id:'created',label:name}), async () => { if (++checks === 1) throw Error('Refresh failed'); }, { presentation });
  h.change('Title', 'Project');
  h.change('Note (optional)', 'Description');
  h.choosePortal('new');
  await h.dialog().props.onCreate('Photography', 'camera');
  assert.equal(checks, 0, 'Create returns to setup before project confirmation');
  const all = nodes(h.render());
  if (presentation === 'mobile') assert.equal(portalChoice(all, 'created').props['aria-pressed'], true);
  else assert.equal(all.find(node => node.props['aria-label'] === 'Portal').props.value, 'created');
  h.submit(); await tick();
  assert.deepEqual(h.calls, [['create','Photography','camera']]);
  assert.ok(nodes(h.render()).some(node => node.props.role === 'alert'));
  h.submit(); await tick();
  assert.equal(checks, 2);
  assert.equal(h.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal(h.calls.at(-1)[0], 'continue');
  assert.equal(h.calls.at(-1)[1].categoryId, 'created');
  assert.equal(h.calls.at(-1)[1].summary, 'Description');
 }
});


test('unmounting while confirmation is pending prevents stale upload handoff',async()=>{let finish;const h=harness(undefined,()=>new Promise(resolve=>finish=resolve));h.change('Title','Project');h.change('Note (optional)','Description');h.submit();await tick();assert.equal(h.calls.length,0);h.unmount();finish();await tick();assert.equal(h.calls.length,0);});


test('a failed profile refresh retains a non-default existing Portal for confirmation retry', async () => {
 let checks = 0;
 const h = harness(undefined, async () => { if (++checks === 1) throw Error('Read failed'); }, {
  initialCategories: [{id:'existing',label:'Design'},{id:'photo',label:'Photography'}],
 });
 h.change('Title','Project');
 h.change('Note (optional)','Description');
 h.choosePortal('photo');
 h.submit(); await tick();
 h.setCategories([]);
 assert.equal(portalChoice(nodes(h.render()), 'photo')?.props['aria-pressed'], true);
 h.submit(); await tick();
 assert.equal(checks, 2);
 assert.equal(h.calls.at(-1)[0], 'continue');
 assert.equal(h.calls.at(-1)[1].categoryId, 'photo');
 assert.equal(h.calls.at(-1)[1].summary, 'Description');
});

test('mobile Portals selects an existing Portal while preserving the authored form', async () => {
 const h = harness(undefined, undefined, { initialCategories: [{id:'existing',label:'Design'},{id:'photo',label:'Photography'}] });
 let all = nodes(h.render());
 const portals = portalButton(all, 'Portals'), add = portalButton(all, 'New Portal');
 assert.equal(portals.props.type, 'button');
 assert.equal(add.props.type, 'button');
 assert.equal(add.props['aria-haspopup'], 'dialog');
 assert.equal(portals.props['aria-controls'], portalList(all).props.id);
 assert.equal(portals.props['aria-expanded'], false);
 assert.equal(portalList(all).props.hidden, true);
 assert.equal(all.find(node => node.type === 'select' && node.props['aria-label'] === 'Portal'), undefined);
 assert.equal(all.find(node => node.props.name === 'title').props.autoFocus, true);
 h.change('Title', 'Existing title');
 h.change('Note (optional)', 'Existing note');
 portalButton(nodes(h.render()), 'Portals').props.onClick();
 all = nodes(h.render());
 assert.equal(portalButton(all, 'Portals').props['aria-expanded'], true);
 assert.equal(portalList(all).props.hidden, false);
 assert.equal(portalChoice(all, 'existing').props['aria-pressed'], true);
 const photo = portalChoice(all, 'photo');
 assert.equal(photo.props.type, 'button');
 assert.equal(photo.props.children, 'Photography');
 assert.equal(photo.props['aria-pressed'], false);
 photo.props.onClick();
 all = nodes(h.render());
 assert.equal(portalButton(all, 'Portals').props['aria-expanded'], false);
 assert.equal(portalList(all).props.hidden, true);
 assert.equal(portalChoice(all, 'photo').props['aria-pressed'], true);
 assert.equal(h.calls.length, 0);
 h.submit(); await tick();
 assert.equal(h.calls.length, 1);
 assert.equal(h.calls[0][0], 'continue');
 assert.equal(h.calls[0][1].categoryId, 'photo');
 assert.equal(h.calls[0][1].title, 'Existing title');
 assert.equal(h.calls[0][1].summary, 'Existing note');
});

test('mobile New Portal and the desktop select or add action open the canonical creator without changing the project draft', () => {
 for (const entry of ['mobile','web-select','web-add']) {
  const presentation = entry === 'mobile' ? 'mobile' : 'web';
  const h = harness(undefined, undefined, { presentation });
  h.change('Title', 'Existing title');
  h.change('Note (optional)', 'Existing description');
  let all = nodes(h.render());
  if (presentation === 'mobile') {
   portalButton(all, 'Portals').props.onClick();
   portalButton(nodes(h.render()), 'New Portal').props.onClick();
  } else {
   assert.equal(portalButton(all, 'Portals'), undefined);
   assert.equal(portalButton(all, 'New Portal'), undefined);
   assert.equal(all.find(node => node.props['aria-label'] === 'Portal').props.value, 'existing');
   const action = all.find(node => node.type === 'button' && node.props['aria-label'] === 'Create a Portal');
   assert.equal(action.props.type, 'button');
   assert.equal(action.props['aria-haspopup'], 'dialog');
   if (entry === 'web-add') action.props.onClick();
   else h.choosePortal('new');
  }
  all = nodes(h.render());
  const dialog = newPortalDialog(all);
  assert.equal(dialog.props.itemName, 'portal');
  assert.equal(dialog.props.isSaving, false);
  assert.equal(all.some(node => node.type === 'form' || node.type === 'footer' || node.props.children === 'Portal icon'), false);
  dialog.props.onDraftChange('Abandoned portal', 'camera');
  assert.equal(h.calls.length, 0);
  h.dialog().props.onCancel();
  all = nodes(h.render());
  assert.equal(newPortalDialog(all), undefined);
  if (presentation === 'mobile') {
   assert.equal(portalList(all).props.hidden, true);
   assert.equal(portalChoice(all, 'existing').props['aria-pressed'], true);
  } else {
   assert.equal(all.find(node => node.props['aria-label'] === 'Portal').props.value, 'existing');
  }
  assert.equal(all.find(node => node.props.name === 'title').props.value, 'Existing title');
  assert.equal(all.find(node => node.type === 'textarea').props.value, 'Existing description');
  assert.equal(h.calls.length, 0);
 }
});
test('description is optional and empty text hands off without inventing content',async()=>{const h=harness();h.change('Title','Project');const textarea=nodes(h.render()).find(n=>n.type==='textarea');assert.equal(textarea.props.required,undefined);h.submit();await tick();assert.equal(h.calls.at(-1)[0],'continue');assert.equal(h.calls.at(-1)[1].summary,'');});

test('mobile Continue only appears when the title and portal are ready', () => {
 const h=harness();
 const hidden=()=>nodes(h.render()).find(node=>node.type==='footer').props.hidden;
 assert.equal(hidden(),true);
 h.change('Title','   '); assert.equal(hidden(),true);
 h.change('Title','New work'); assert.equal(hidden(),false,'The preselected portal satisfies the requirement and Note is optional');
 h.change('Title',''); assert.equal(hidden(),true);
 const web=harness(undefined,undefined,{presentation:'web'});
 assert.equal(nodes(web.render()).find(node=>node.type==='footer').props.hidden,false);
});

test('mobile setup has one screen title and one explicit continue action without a step tracker',()=>{
 const all=nodes(harness().render()),header=all.find(node=>node.type==='header');
 const headings=all.filter(node=>typeof node.type==='string'&&/^h[1-6]$/.test(node.type));
 assert.equal(headings.length,1);assert.equal(headings[0].type,'h1');
 assert.equal(headings[0].props.children,'New project');
 assert.equal(headings[0].props.id,all.find(node=>node.props.role==='dialog').props['aria-labelledby']);
 assert.equal(nodes(header).filter(node=>node.type==='button').length,1);
 assert.equal(nodes(header).find(node=>node.type==='button').props['aria-label'],'Cancel new project');
 assert.equal(all.filter(node=>node.type==='button'&&node.props.type==='submit').length,1);
 assert.equal(all.find(node=>node.type==='button'&&node.props.type==='submit').props.form,'project-setup-form');
 assert.equal(all.some(node=>node.type==='ol'||node.props['aria-current']==='step'||node.props.className==='project-creation-orientation'),false);
 assert.equal(all.find(node=>node.props.className==='project-setup-header-balance').props['aria-hidden'],'true');
});

test('with zero Portals, Create writes one Portal and Continue separately hands off the project', async () => {
 for (const presentation of ['mobile','web']) {
  let finish;
  const pendingPortal = new Promise(resolve => { finish = resolve; });
  const h = harness(() => pendingPortal, undefined, { initialCategories: [], presentation });
  let all = nodes(h.render());
  assert.equal(newPortalDialog(all), undefined);
  assert.equal(all.find(node => node.props['aria-label'] === 'New portal name'), undefined);
  assert.equal(all.find(node => node.props.name === 'title').props.autoFocus, true);
  if (presentation === 'mobile') {
   assert.ok(portalButton(all, 'New Portal'));
   assert.equal(all.find(node => node.type === 'footer').props.hidden, true);
   portalButton(all, 'Portals').props.onClick();
   all = nodes(h.render());
   assert.equal(portalList(all).props.hidden, false);
   assert.ok(nodes(portalList(all)).some(node => node.props.children === 'No portals yet.'));
  } else {
   const picker = all.find(node => node.type === 'select' && node.props['aria-label'] === 'Portal');
   assert.equal(picker.props.value, '');
   assert.ok(nodes(picker).some(node => node.type === 'option' && node.props.value === ''));
   assert.ok(all.find(node => node.type === 'button' && node.props['aria-label'] === 'Create a Portal'));
  }
  h.change('Title', '  First idea  ');
  h.submit(); await tick();
  assert.deepEqual(h.calls, []);
  h.choosePortal('new');
  const dialog = h.dialog();
  assert.equal(dialog.props.itemName, 'portal');
  assert.equal(dialog.props.initialLabel ?? '', '');
  assert.equal(dialog.props.initialIconName, undefined, 'The canonical dialog supplies its own default icon');
  dialog.props.onDraftChange('Ideas', 'camera');
  assert.deepEqual(h.calls, []);
  const create = h.dialog().props.onCreate;
  const writing = create('Ideas', 'camera');
  const duplicate = create('Ideas', 'camera');
  assert.equal(h.dialog().props.isSaving, true);
  h.dialog().props.onCancel();
  assert.equal(h.dialog().props.isSaving, true);
  assert.deepEqual(h.calls, [['create','Ideas','camera']]);
  finish({id:'created',label:'Ideas',iconName:'camera'});
  await Promise.all([writing, duplicate]);
  assert.equal(h.dialog(), undefined);
  assert.deepEqual(h.calls, [['create','Ideas','camera']]);
  all = nodes(h.render());
  if (presentation === 'mobile') assert.equal(all.find(node => node.type === 'footer').props.hidden, false);
  h.submit(); await tick();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1][0], 'continue');
  assert.equal(h.calls[1][1].categoryId, 'created');
  assert.equal(h.calls[1][1].categoryLabel, 'Ideas');
  assert.equal(h.calls[1][1].title, 'First idea');
  assert.equal(h.calls[1][1].summary, '');
 }
});

test('Continue locks both platform forms during confirmation without creating a Portal', async () => {
 for (const presentation of ['mobile','web']) {
  let finish;
  const h = harness(undefined, () => new Promise(resolve => { finish = resolve; }), { presentation });
  h.change('Title', 'Existing Portal project');
  h.submit(); h.submit(); await tick();
  const all = nodes(h.render());
  assert.equal(all.find(node => node.props.name === 'title').props.disabled, true);
  assert.equal(all.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
  assert.deepEqual(h.calls, []);
  finish(); await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], 'continue');
  assert.equal(h.calls[0][1].categoryId, 'existing');
 }
});
