import assert from 'node:assert/strict';import test from 'node:test';import{readFileSync}from'node:fs';import vm from'node:vm';import React from'react';import ts from'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>mocks[n]??{}});return exports;}
const validation=load('../src/features/publishing/validation.ts',{}),category=load('../src/features/profile/useCategoryManagement.ts',{});
function harness(create=async name=>({id:'created',label:name}),confirm,{initialCategories=[{id:'existing',label:'Design'}],presentation='mobile'}={}){
 let categories=initialCategories;let cursor=0;const slots=[],calls=[],cleanups=[];let mounted=false;const react={...React,useEffect(effect){if(!mounted){cleanups.push(effect());}},useRef:v=>slots[cursor++]??={current:v},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];}};
 const {ProjectSetupScreen}=load('../src/features/publishing/ProjectSetupScreen.tsx',{'react':react,'lucide-react':{PlusIcon:'plus-icon',UsersIcon:'users-icon',XIcon:'close-icon'},'../../components/profile/categoryIcons':{getCategoryIcon:name=>'portal-icon-'+name},'./validation':validation,'../profile/useCategoryManagement':category,'../../components/ui/ModalPortal':{ModalPortal:'portal'},'../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':{useModalFocus(){}},'../../components/publishing/useAuthoringFocus':{useAuthoringFocus(){}},'../../presentation/usePresentation':{usePresentation:()=>presentation}});
 const render=()=>{cursor=0;const tree=ProjectSetupScreen({categories,onCreatePortal:async n=>{calls.push(['create',n]);return create(n)},onConfirmPortal:confirm,onContinue:v=>calls.push(['continue',v]),onClose:()=>calls.push(['close'])});mounted=true;return tree;};
 const change=(label,value)=>{const n=nodes(render()).find(n=>n.props['aria-label']===label||n.type==='textarea'&&label==='Note (optional)'||n.props.name==='title'&&label==='Idea title');n.props.onChange({target:{value}})};
 const submit=()=>nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 return{render,change,submit,calls,setCategories(value){categories=value;},unmount(){cleanups.forEach(fn=>fn?.());}};
}
const tick=()=>new Promise(setImmediate);
test('details first: validation blocks writes, existing portal and entered metadata hand off without creation',async()=>{const h=harness();h.submit();await tick();assert.equal(h.calls.length,0);h.change('Idea title','  My project ');h.change('Note (optional)',' A description ');h.submit();await tick();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'continue');assert.equal(h.calls[0][1].categoryId,'existing');assert.equal(h.calls[0][1].title,'My project');assert.equal(h.calls[0][1].summary,'A description');});
test('new portal validates duplicates and prevents duplicate creations during explicit continue',async()=>{let finish;const h=harness(()=>new Promise(r=>finish=r));h.change('Idea title','Project');h.change('Note (optional)','Description');h.change('Portal','new');h.change('New portal name','Design');h.submit();await tick();assert.equal(h.calls.length,0);h.change('New portal name','Photography');h.submit();h.submit();await tick();assert.equal(h.calls.length,1);finish({id:'new-portal'});await tick();assert.equal(h.calls[1][1].categoryId,'new-portal');});
test('failed portal creation retains details for retry and never enters uploads',async()=>{const h=harness(async()=>null);h.change('Idea title','Project');h.change('Note (optional)','Description');h.change('Portal','new');h.change('New portal name','Photography');h.submit();await tick();assert.equal(h.calls.length,1);assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));assert.equal(nodes(h.render()).find(n=>n.props.name==='title').props.value,'Project');assert.equal(nodes(h.render()).find(n=>n.type==='textarea').props.value,'Description');});

test('a confirmation failure retries the created portal without creating another or losing metadata',async()=>{let checks=0;const h=harness(async name=>({id:'created',label:name}),async()=>{if(++checks===1)throw Error('Refresh failed');});h.change('Idea title','Project');h.change('Note (optional)','Description');h.change('Portal','new');h.change('New portal name','Photography');h.submit();await tick();assert.equal(h.calls.filter(c=>c[0]==='create').length,1);assert.equal(h.calls.filter(c=>c[0]==='continue').length,0);assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));h.submit();await tick();assert.equal(checks,2);assert.equal(h.calls.filter(c=>c[0]==='create').length,1);assert.equal(h.calls.at(-1)[1].categoryId,'created');});


test('unmounting while confirmation is pending prevents stale upload handoff',async()=>{let finish;const h=harness(undefined,()=>new Promise(resolve=>finish=resolve));h.change('Idea title','Project');h.change('Note (optional)','Description');h.submit();await tick();assert.equal(h.calls.length,0);h.unmount();finish();await tick();assert.equal(h.calls.length,0);});


test('a failed profile refresh retains the selected existing portal and form for confirmation retry',async()=>{let checks=0;const h=harness(undefined,async()=>{if(++checks===1)throw Error('Read failed');});h.change('Idea title','Project');h.change('Note (optional)','Description');h.submit();await tick();h.setCategories([]);assert.equal(nodes(h.render()).find(n=>n.props['aria-label']==='Portal').props.value,'existing');h.submit();await tick();assert.equal(checks,2);assert.equal(h.calls.at(-1)[0],'continue');assert.equal(h.calls.at(-1)[1].categoryId,'existing');});

test('setup focuses title and preserves selected portal without creating anything',()=>{const h=harness();h.setCategories([{id:'existing',label:'Portalink Networks Inc.',iconName:'globe'},{id:'photo',label:'Photography',iconName:'camera'}]);let tree=nodes(h.render());assert.equal(tree.find(n=>n.props.name==='title').props.autoFocus,true);assert.equal(tree.find(n=>n.props['aria-label']==='Portal').props.value,'existing');h.change('Portal','photo');tree=nodes(h.render());assert.equal(tree.find(n=>n.props['aria-label']==='Portal').props.value,'photo');assert.equal(h.calls.length,0);});
test('secondary add portal action preserves project details and defers creation until continue',()=>{const h=harness();h.change('Idea title','Existing title');h.change('Note (optional)','Existing description');const action=nodes(h.render()).find(n=>n.type==='button'&&n.props['aria-label']==='Create a Portal');assert.equal(action.props.type,'button');action.props.onClick();const tree=nodes(h.render());assert.equal(tree.find(n=>n.props['aria-label']==='Portal').props.value,'new');assert.equal(tree.find(n=>n.props['aria-label']==='New portal name').props.autoFocus,true);assert.equal(tree.find(n=>n.props.name==='title').props.value,'Existing title');assert.equal(tree.find(n=>n.type==='textarea').props.value,'Existing description');assert.equal(h.calls.length,0);});
test('description is optional and empty text hands off without inventing content',async()=>{const h=harness();h.change('Idea title','Project');const textarea=nodes(h.render()).find(n=>n.type==='textarea');assert.equal(textarea.props.required,undefined);h.submit();await tick();assert.equal(h.calls.at(-1)[0],'continue');assert.equal(h.calls.at(-1)[1].summary,'');});

test('mobile setup has one screen title and one explicit continue action without a step tracker',()=>{
 const all=nodes(harness().render()),header=all.find(node=>node.type==='header');
 const headings=all.filter(node=>typeof node.type==='string'&&/^h[1-6]$/.test(node.type));
 assert.equal(headings.length,1);assert.equal(headings[0].type,'h1');
 assert.equal(headings[0].props.children,'New idea');
 assert.equal(headings[0].props.id,all.find(node=>node.props.role==='dialog').props['aria-labelledby']);
 assert.equal(nodes(header).filter(node=>node.type==='button').length,1);
 assert.equal(nodes(header).find(node=>node.type==='button').props['aria-label'],'Cancel new idea');
 assert.equal(all.filter(node=>node.type==='button'&&node.props.type==='submit').length,1);
 assert.equal(all.find(node=>node.type==='button'&&node.props.type==='submit').props.form,'project-setup-form');
 assert.equal(all.some(node=>node.type==='ol'||node.props['aria-current']==='step'||node.props.className==='project-creation-orientation'),false);
 assert.equal(all.find(node=>node.props.className==='project-setup-header-balance').props['aria-hidden'],'true');
});

test('zero portals on either platform require valid details and create only once on explicit continue',async()=>{
 for(const presentation of ['mobile','web']){
  let finish;
  const h=harness(()=>new Promise(resolve=>finish=resolve),undefined,{initialCategories:[],presentation});
  let all=nodes(h.render());assert.equal(all.find(n=>n.props['aria-label']==='Portal'),undefined);
  assert.equal(all.find(n=>n.type==='button'&&n.props['aria-label']==='Create a Portal'),undefined);
  assert.equal(all.find(n=>n.props['aria-label']==='New portal name').props.value,'');
  assert.equal(all.find(n=>n.props.name==='title').props.autoFocus,true);
  assert.equal(all.find(n=>n.props['aria-label']==='New portal name').props.autoFocus,false);assert.equal(h.calls.length,0);
  h.submit();await tick();assert.equal(h.calls.length,0);
  h.change('Idea title','  First idea  ');h.submit();await tick();assert.equal(h.calls.length,0);
  h.change('New portal name','  Ideas  ');assert.equal(h.calls.length,0);
  h.submit();h.submit();await tick();assert.deepEqual(h.calls,[['create','Ideas']]);
  all=nodes(h.render());assert.equal(all.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
  finish({id:'created',label:'Ideas'});await tick();assert.equal(h.calls.length,2);
  assert.equal(h.calls[1][0],'continue');assert.equal(h.calls[1][1].categoryId,'created');
  assert.equal(h.calls[1][1].categoryLabel,'Ideas');assert.equal(h.calls[1][1].title,'First idea');assert.equal(h.calls[1][1].summary,'');
 }
});

test('a newly created first Portal remains selectable after confirmation fails and retries without another creation',async()=>{
 for(const presentation of ['mobile','web']){
  let checks=0;
  const h=harness(async name=>({id:'first-portal',label:name}),async()=>{if(++checks===1)throw Error('Refresh failed');},{initialCategories:[],presentation});
  h.change('Idea title','First idea');h.change('New portal name','Ideas');h.submit();await tick();
  let all=nodes(h.render());assert.equal(all.find(node=>node.props['aria-label']==='Portal').props.value,'first-portal');
  assert.ok(all.some(node=>node.type==='option'&&node.props.value==='first-portal'));assert.equal(all.find(node=>node.props['aria-label']==='New portal name'),undefined);
  assert.ok(all.some(node=>node.props.role==='alert'));assert.equal(h.calls.filter(call=>call[0]==='create').length,1);assert.equal(h.calls.some(call=>call[0]==='continue'),false);
  h.submit();await tick();assert.equal(checks,2);assert.equal(h.calls.filter(call=>call[0]==='create').length,1);assert.equal(h.calls.at(-1)[0],'continue');assert.equal(h.calls.at(-1)[1].categoryId,'first-portal');
 }
});
