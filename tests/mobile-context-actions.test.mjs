import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = (path, dependencies = {}, globals = {}) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, React, require: name => dependencies[name] ?? new Proxy({}, {get: (_obj, key) => key === '__esModule' ? false : key}), ...globals });
  return exports;
};
const { contextActions, mergeContextActions } = compile('../src/presentation/mobile/contextActions.ts');
const ids = model => [...model.primary, ...model.groups.flat()].map(action => action.id);
const all = ['search','explore','newProject','refresh','settings','editProfile','share','reorder','insights','copy','follow','message','saveCreator','report','saveProject','savePage','comment','pageIndex','edit','cover','visibility','delete','select','list','categories','newMessage','blocked','viewProfile','mute','block','yourWorld','myCity','reset','signIn','createAccount','react','editMessage','unsend','leaveLive'];
const handlers = Object.fromEntries(all.map(id => [id, () => id]));
const expected = {
 home:['search','explore','newProject','refresh','settings','leaveLive'], profile:['follow','message','saveCreator','share','copy','report'],
 project:['saveProject','savePage','share','comment','pageIndex','copy','report'], studio:['select','search','newProject','list','categories'],
 messages:['newMessage','search','blocked'], conversation:['viewProfile','share','mute','block','report'], explore:['search','yourWorld','myCity','reset'],
 shared:['share','savePage','comment','copy','categories','settings','report'], message:['react','editMessage','unsend'], settings:[],
};
for (const kind of Object.keys(expected)) for (const viewer of [{signedIn:false},{signedIn:true},{signedIn:true,owner:true}]) {
 test(`${kind}: capabilities and cap for ${JSON.stringify(viewer)}`, () => {
   const model = contextActions(kind, viewer, {handlers});
   const actions = [...model.primary,...model.groups.flat()];
   assert.ok(actions.length <= 8); assert.ok(model.primary.length <= 3);
   assert.ok(actions.every(action => typeof action.run === 'function' && !('disabled' in action)));
   if (!viewer.signedIn) for (const id of ['newProject','follow','saveCreator','edit','delete','mute']) assert.ok(!ids(model).includes(id));
   if (!viewer.owner) for (const id of ['editProfile','insights','reorder','edit','cover','visibility','delete']) assert.ok(!ids(model).includes(id));
   if (viewer.signedIn && !viewer.owner) assert.deepEqual(Array.from(ids(model)), expected[kind]);
   assert.equal(ids(contextActions(kind,viewer,{handlers:{}})).length,0);
 });
}
test('owner maps preserve requested order; unavailable callbacks are absent', () => {
 assert.deepEqual(Array.from(ids(contextActions('profile',{signedIn:true,owner:true},{handlers}))),['editProfile','share','newProject','reorder','insights','copy','settings']);
 assert.deepEqual(Array.from(ids(contextActions('project',{signedIn:true,owner:true},{handlers}))),['edit','cover','share','pageIndex','copy','visibility','delete']);
 assert.deepEqual(Array.from(ids(contextActions('home',{signedIn:true},{handlers:{newProject:handlers.newProject,explore:handlers.explore}}))),['explore','newProject']);
});
test('shared visitor actions offer auth and preserve the existing return destination', () => {
 assert.deepEqual(Array.from(ids(contextActions('shared',{signedIn:false},{handlers}))),['signIn','createAccount','share','savePage','comment','copy','categories','settings']);
 const source=read('../src/presentation/mobile/SharedContextActions.tsx');
 assert.match(source,/readSharedReturnPath\(pathname \+ search\)/); assert.match(source,/requestAuthenticatedDestination\(\{ kind: 'route', path/);
});

test('owner project includes both curation actions and deletion within the eight-action sheet',()=>{
 const owner=contextActions('project',{signedIn:true,owner:true},{handlers:{...handlers,startHere:()=>{},thenNow:()=>{}}});
 assert.deepEqual(Array.from(ids(owner)),['edit','cover','share','startHere','thenNow','pageIndex','visibility','delete']);
 for(const viewer of [{signedIn:false},{signedIn:true,owner:false}])assert.ok(!ids(contextActions('project',viewer,{handlers:{...handlers,startHere:()=>{},thenNow:()=>{}}})).includes('startHere'));
});

test('shared current-page registration retains auth-gated actions alongside portfolio navigation', () => {
 const calls=[];
 const page=contextActions('shared',{signedIn:false},{handlers:{savePage:()=>calls.push('auth-save'),comment:()=>calls.push('auth-comment')}});
 const shell=contextActions('shared',{signedIn:false},{handlers:{signIn:handlers.signIn,createAccount:handlers.createAccount,share:handlers.share,copy:handlers.copy,categories:handlers.categories,settings:handlers.settings}});
 const merged=mergeContextActions([page,shell]);
 assert.deepEqual(Array.from(ids(merged)),['signIn','createAccount','share','savePage','comment','copy','categories','settings']);
 for(const action of merged.groups.flat().filter(a=>['savePage','comment'].includes(a.id)))action.run();
 assert.deepEqual(calls,['auth-save','auth-comment']);
});
test('registration composition stays in the active route kind and keeps canonical ordering', () => {
 const project=contextActions('project',{signedIn:true,owner:true},{title:'Work',handlers:{share:handlers.share}});
 const owner=contextActions('project',{signedIn:true,owner:true},{handlers:{edit:handlers.edit,delete:handlers.delete}});
 const home=contextActions('home',{signedIn:true},{handlers});
 const merged=mergeContextActions([project,owner,home]);
 assert.deepEqual(Array.from(ids(merged)),['edit','share','delete']); assert.equal(merged.title,'Work');
});
const nodes = tree => React.isValidElement(tree) ? [tree,...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
test('the common sheet supports close, backdrop, Escape, swipe and action delegation without placeholders', () => {
 const calls=[]; let escape;
 class ElementStub { closest() { return null; } }
 const {MobileActionSheet}=compile('../src/components/messages/MobileActionSheet.tsx',{
  react:{...React,useRef:()=>({current:null}),useId:()=> 'title'},
  '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},
  '../../hooks/useModalFocus':{useModalFocus:(_open,_ref,fn)=>{escape=fn;}},
 }, { Element: ElementStub });
 const model=contextActions('home',{signedIn:true},{handlers:{explore:()=>calls.push('explore'),newProject:()=>calls.push('new')}});
 const tree=MobileActionSheet({model,onClose:()=>calls.push('close'),onAction:action=>action.run()});
 const list=nodes(tree), close=list.find(n=>n.props['aria-label']==='Close actions'), scrim=list.find(n=>n.props.className?.includes('mobile-context-scrim'));
 close.props.onClick(); escape(); const background={}; scrim.props.onClick({target:background,currentTarget:background});
 assert.deepEqual(calls,['close','close','close']);
 list.find(n=>n.type==='button'&&nodes(n).some(x=>x.type==='span'&&x.props.children==='Explore')).props.onClick(); assert.equal(calls.at(-1),'explore');
 const header=list.find(n=>n.type==='header');
 const context={setPointerCapture(){}}, target=new ElementStub();
 header.props.onPointerDown({isPrimary:true,button:0,target,currentTarget:context,pointerId:1,clientX:10,clientY:10});
 header.props.onPointerUp({pointerId:1,clientX:12,clientY:100});
 assert.equal(calls.at(-1),'close'); assert.equal(calls.length,5);
 target.closest=()=>({});
 header.props.onPointerDown({isPrimary:true,button:0,target,currentTarget:context,pointerId:1,clientX:10,clientY:10});
 header.props.onPointerUp({pointerId:1,clientX:12,clientY:100});
 assert.equal(calls.length,5,'A close-button press cannot also trigger a drag');
 assert.ok(list.every(n=>n.type!=='button'||n.props.disabled===undefined));
});
test('provider re-resolves capabilities and restores context focus before handing off an action', () => {
 const slots=[]; let cursor=0, location={pathname:'/',search:''}, account='me'; const effects=[], calls=[];
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 const react={...React,useRef(value){return slots[cursor++]??={current:value};},useState(value){const i=cursor++;slots[i]??={value:typeof value==='function'?value():value};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},useCallback:fn=>fn,useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){slots[i]={deps};effects.push(fn);}}};
 const button={getClientRects:()=>[{}],focus:()=>calls.push('focus')};
 const {MobileContextProvider}=compile('../src/presentation/mobile/MobileContextActions.tsx',{
  react,'react-dom':{flushSync:fn=>fn()},'react-router-dom':{useLocation:()=>location},
  '../../contexts/AuthContext':{useAuth:()=>({user:{id:account}})},'../usePresentation':{usePresentation:()=> 'mobile'},
  './contextFocus':{focusMobileContextButton:()=>{button.focus();return button;}},'./contextActions':{mergeContextActions},'../../components/messages/MobileActionSheet':{MobileActionSheet:'sheet'},
 },{localStorage:{getItem:()=>null,setItem(){}},document:{querySelectorAll:()=>[button]},getComputedStyle:()=>({visibility:'visible'})});
 const render=()=>{cursor=0;return MobileContextProvider({children:null});};
 let tree=render(); effects.splice(0).forEach(fn=>fn()); tree=render();
 tree.props.value.register('home',{route:'/',priority:0,model:contextActions('home',{signedIn:true},{handlers:{refresh:()=>calls.push('old')}})});
 tree=render(); tree.props.value.open(); tree=render();
 assert.equal(tree.props.value.hint,false);
 tree.props.value.register('home',{route:'/',priority:0,model:contextActions('home',{signedIn:true},{handlers:{refresh:()=>calls.push('new')}})});
 const sheet=nodes(tree).find(n=>n.type==='sheet');sheet.props.onAction(sheet.props.model.groups[0][0]);
 assert.deepEqual(calls,['focus','focus','new']); assert.equal(nodes(render()).some(n=>n.type==='sheet'),false);
 let object=contextActions('project',{signedIn:true},{handlers:{saveProject:()=>{}},labels:{saveProject:'Save project'}});
 const source=()=>object; tree=render();tree.props.value.open(source);tree=render();
 object=contextActions('project',{signedIn:true},{handlers:{saveProject:()=>{}},labels:{saveProject:'Unsave project'}});
 tree.props.value.refresh(source);tree=render();assert.equal(nodes(tree).find(n=>n.type==='sheet').props.model.primary[0].label,'Unsave project');
 tree=render();tree.props.value.open();account='another';tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
 location={pathname:'/studio',search:''};tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
});

test('held object refresh updates Save labels and leaves WEB scroll listeners untouched', () => {
 const slots=[], timers=new Map(), listeners=new Map(); let cursor=0, mobile=true, held=0, timerId=0, cleanup;
 const react={...React,useRef(value){return slots[cursor++]??={current:value};},useEffect(fn){cleanup=fn();}};
 const {useMobileHold}=compile('../src/presentation/mobile/MobileContextActions.tsx',{
  react,'../usePresentation':{usePresentation:()=>mobile?'mobile':'web'},
 },{window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},Element:class{},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 const render=()=>{cursor=0;return useMobileHold(()=>held++);};
 const pointer={isPrimary:true,button:0,pointerId:1,clientX:100,clientY:100,target:{}};
 const expire=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
 let press=render();press.onPointerDownCapture(pointer);expire();assert.equal(held,1);
 const click={detail:1,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};press.onClickCapture(click);assert.equal(click.prevented,true);
 for(const cancel of [()=>press.onPointerMoveCapture({...pointer,clientX:120}),()=>listeners.get('scroll')(),()=>press.onPointerCancel(),()=>press.onPointerUpCapture()]){
  press.onPointerDownCapture(pointer);cancel();expire();assert.equal(held,1);
 }
 cleanup();assert.equal(listeners.size,0);mobile=false;press=render();assert.equal(Object.keys(press).length,0);assert.equal(listeners.size,0);
});

test('project holds resolve engagement only on demand, use shared capabilities and refresh the same object source', () => {
 let requested=false, latest, onOpen, shared=false;
 const record={isSaved:true}; let resolved=false;
 const {useMobileProjectContext}=compile('../src/presentation/mobile/useMobileProjectContext.ts',{
  react:{useState:()=>[requested,next=>{requested=next;}]},
  '../../features/sharing/shareModel':{isPublicSharePath:path=>path.startsWith('/share/')},
  'react-router-dom':{useNavigate:()=>()=>{},useLocation:()=>({pathname:shared?'/share/creator':'/p/creator',search:''})},
  '../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:true,viewerProfileId:'other'})},
  '../../features/engagement/useProjectEngagement':{useProjectEngagement:id=>{assert.equal(id,requested?'work':null);return{record:resolved?record:null,isEngaged:()=>resolved,isPending:()=>false,toggle(){}};}},
  './MobileContextActions':{useMobileContextPress:(model,_screen,open)=>{latest=model;onOpen=open;return{};}},
  './contextActions':{contextActions},'../../app/routes':{buildPath:()=>'/share/creator/c/portal/work'},
 },{URL,window:{location:{origin:'https://portalink.test'}}});
 const render=()=>useMobileProjectContext({id:'work',categoryId:'portal',title:'Work'},'creator');
 render();assert.ok(!ids(latest).includes('saveProject'));onOpen();render();assert.ok(!ids(latest).includes('saveProject'));
 resolved=true;render();assert.equal(latest.primary.find(a=>a.id==='saveProject').label,'Unsave project');
 shared=true;render();assert.deepEqual(Array.from(ids(latest)),['share','copy']);
});
