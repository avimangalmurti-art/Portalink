import assert from 'node:assert/strict';import test from 'node:test';import{readFileSync}from'node:fs';import vm from'node:vm';import React from'react';import ts from'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>mocks[n]??{}});return exports;}
const validation=load('../src/features/publishing/validation.ts',{}),category=load('../src/features/profile/useCategoryManagement.ts',{});
function harness(create=async name=>({id:'created',label:name}),confirm){
 let categories=[{id:'existing',label:'Design'}];let cursor=0;const slots=[],calls=[],cleanups=[];let mounted=false;const react={...React,useEffect(effect){if(!mounted){cleanups.push(effect());}},useRef:v=>slots[cursor++]??={current:v},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];}};
 const {ProjectSetupScreen}=load('../src/features/publishing/ProjectSetupScreen.tsx',{'react':react,'lucide-react':{PlusIcon:'plus-icon',CheckIcon:'check-icon',UsersIcon:'users-icon',XIcon:'close-icon'},'../../components/profile/categoryIcons':{getCategoryIcon:name=>'portal-icon-'+name},'./validation':validation,'../profile/useCategoryManagement':category,'../../components/ui/ModalPortal':{ModalPortal:'portal'},'../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':{useModalFocus(){}},'../../components/publishing/useAuthoringFocus':{useAuthoringFocus(){}},'./ProjectCreationProgress':{ProjectCreationProgress:'ProjectCreationProgress'}});
 const render=()=>{cursor=0;const tree=ProjectSetupScreen({categories,onCreatePortal:async n=>{calls.push(['create',n]);return create(n)},onConfirmPortal:confirm,onContinue:v=>calls.push(['continue',v]),onClose:()=>calls.push(['close'])});mounted=true;return tree;};
 const change=(label,value)=>{const n=nodes(render()).find(n=>n.props['aria-label']===label||n.type==='textarea'&&label==='Description (optional)'||n.props.name==='title'&&label==='Project title');n.props.onChange({target:{value}})};
 const submit=()=>nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 return{render,change,submit,calls,setCategories(value){categories=value;},unmount(){cleanups.forEach(fn=>fn?.());}};
}
const tick=()=>new Promise(setImmediate);
test('details first: validation blocks writes, existing portal and entered metadata hand off without creation',async()=>{const h=harness();h.submit();await tick();assert.equal(h.calls.length,0);h.change('Project title','  My project ');h.change('Description (optional)',' A description ');h.submit();await tick();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'continue');assert.equal(h.calls[0][1].categoryId,'existing');assert.equal(h.calls[0][1].title,'My project');assert.equal(h.calls[0][1].summary,'A description');assert.ok(nodes(h.render()).some(n=>n.type==='button'&&n.props.disabled&&n.props.children==='Coming soon'));});
test('new portal validates duplicates and prevents duplicate creations during explicit continue',async()=>{let finish;const h=harness(()=>new Promise(r=>finish=r));h.change('Project title','Project');h.change('Description (optional)','Description');h.change('Portal','new');h.change('New portal name','Design');h.submit();await tick();assert.equal(h.calls.length,0);h.change('New portal name','Photography');h.submit();h.submit();await tick();assert.equal(h.calls.length,1);finish({id:'new-portal'});await tick();assert.equal(h.calls[1][1].categoryId,'new-portal');});
test('failed portal creation retains details for retry and never enters uploads',async()=>{const h=harness(async()=>null);h.change('Project title','Project');h.change('Description (optional)','Description');h.change('Portal','new');h.change('New portal name','Photography');h.submit();await tick();assert.equal(h.calls.length,1);assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));assert.equal(nodes(h.render()).find(n=>n.props.name==='title').props.value,'Project');assert.equal(nodes(h.render()).find(n=>n.type==='textarea').props.value,'Description');});

test('a confirmation failure retries the created portal without creating another or losing metadata',async()=>{let checks=0;const h=harness(async name=>({id:'created',label:name}),async()=>{if(++checks===1)throw Error('Refresh failed');});h.change('Project title','Project');h.change('Description (optional)','Description');h.change('Portal','new');h.change('New portal name','Photography');h.submit();await tick();assert.equal(h.calls.filter(c=>c[0]==='create').length,1);assert.equal(h.calls.filter(c=>c[0]==='continue').length,0);assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));h.submit();await tick();assert.equal(checks,2);assert.equal(h.calls.filter(c=>c[0]==='create').length,1);assert.equal(h.calls.at(-1)[1].categoryId,'created');});


test('unmounting while confirmation is pending prevents stale upload handoff',async()=>{let finish;const h=harness(undefined,()=>new Promise(resolve=>finish=resolve));h.change('Project title','Project');h.change('Description (optional)','Description');h.submit();await tick();assert.equal(h.calls.length,0);h.unmount();finish();await tick();assert.equal(h.calls.length,0);});


test('a failed profile refresh retains the selected existing portal and form for confirmation retry',async()=>{let checks=0;const h=harness(undefined,async()=>{if(++checks===1)throw Error('Read failed');});h.change('Project title','Project');h.change('Description (optional)','Description');h.submit();await tick();h.setCategories([]);assert.equal(nodes(h.render()).find(n=>n.props['aria-label']==='Portal').props.value,'existing');h.submit();await tick();assert.equal(checks,2);assert.equal(h.calls.at(-1)[0],'continue');assert.equal(h.calls.at(-1)[1].categoryId,'existing');});

test('setup focuses title and follows the selected portal icon without creating anything',()=>{const h=harness();h.setCategories([{id:'existing',label:'Portalink Networks Inc.',iconName:'globe'},{id:'photo',label:'Photography',iconName:'camera'}]);let tree=nodes(h.render());assert.equal(tree.find(n=>n.props.name==='title').props.autoFocus,true);assert.ok(tree.some(n=>n.type==='portal-icon-globe'));h.change('Portal','photo');tree=nodes(h.render());assert.ok(tree.some(n=>n.type==='portal-icon-camera'));assert.equal(h.calls.length,0);});
test('secondary add portal action preserves project details and defers creation until continue',()=>{const h=harness();h.change('Project title','Existing title');h.change('Description (optional)','Existing description');const action=nodes(h.render()).find(n=>n.type==='button'&&n.props.className==='project-setup-add-portal');assert.equal(action.props.type,'button');action.props.onClick();const tree=nodes(h.render());assert.equal(tree.find(n=>n.props['aria-label']==='Portal').props.value,'new');assert.equal(tree.find(n=>n.props['aria-label']==='New portal name').props.autoFocus,true);assert.equal(tree.find(n=>n.props.name==='title').props.value,'Existing title');assert.equal(tree.find(n=>n.type==='textarea').props.value,'Existing description');assert.equal(h.calls.length,0);});
test('description is optional and empty text hands off without inventing content',async()=>{const h=harness();h.change('Project title','Project');const textarea=nodes(h.render()).find(n=>n.type==='textarea');assert.equal(textarea.props.required,undefined);h.submit();await tick();assert.equal(h.calls.at(-1)[0],'continue');assert.equal(h.calls.at(-1)[1].summary,'');});

test('mobile setup has one explicit continue action and starts the shared creation progress on Details',()=>{
 const all=nodes(harness().render()),header=all.find(node=>node.type==='header');
 assert.equal(nodes(header).filter(node=>node.type==='button').length,1);
 assert.equal(nodes(header).find(node=>node.type==='button').props['aria-label'],'Cancel new project');
 assert.equal(all.filter(node=>node.type==='button'&&node.props.type==='submit').length,1);
 assert.equal(all.find(node=>node.type==='ProjectCreationProgress').props.current,'details');
 assert.equal(all.find(node=>node.props.className==='project-setup-header-balance').props['aria-hidden'],'true');
});

test('shared creation progress shows the actual order and current stage without interactive navigation',()=>{
 const {ProjectCreationProgress}=load('../src/features/publishing/ProjectCreationProgress.tsx',{'react':React,'lucide-react':{CheckIcon:'check-icon'}});
 for(const steps of [['details','files','review'],['files','details','review']]){
  for(const current of steps){
   const tree=ProjectCreationProgress({steps,current}),all=nodes(tree),items=all.filter(node=>node.type==='li');
   assert.equal(tree.props['aria-label'],'Project creation steps');
   assert.deepEqual(items.map(item=>React.Children.toArray(item.props.children).at(-1)),steps.map(step=>step[0].toUpperCase()+step.slice(1)));
   assert.deepEqual(items.map(item=>item.props['aria-current']),steps.map(step=>step===current?'step':undefined));
   assert.deepEqual(items.map(item=>Boolean(item.props['data-complete'])),steps.map((_,index)=>index<steps.indexOf(current)));
   assert.equal(all.some(node=>node.type==='button'||node.type==='a'),false);
  }
 }
});
