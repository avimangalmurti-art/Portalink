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
test('project exports add only the requested actions and do not reveal previously capped visitor controls',()=>{
 const old=['savePage','cite','share','signIn','createAccount','comment','copy','categories','settings','report'];
 const handlers=Object.fromEntries(old.map(id=>[id,()=>{}])),before=contextActions('shared',{signedIn:false},{handlers});
 const after=contextActions('shared',{signedIn:false},{handlers:{...handlers,export(){}}});
 const flat=model=>[...model.primary,...model.groups.flat()].map(action=>action.id);
 assert.deepEqual(Array.from(flat(after)),[...flat(before),'export']);
 const owner=contextActions('project',{signedIn:true,owner:true},{handlers:{edit(){},cover(){},startHere(){},thenNow(){},reads(){},visibility(){},delete(){},copyCitation(){},export(){}}});
 assert.ok(flat(owner).includes('delete'));assert.ok(flat(owner).includes('copyCitation'));assert.ok(flat(owner).includes('export'));
});
const ids = model => [...model.primary, ...model.groups.flat()].map(action => action.id);
const all = ['projectInfo','deleteChat','newProject','search','explore','refresh','settings','editProfile','share','reorder','insights','copy','follow','message','saveCreator','report','saveProject','savePage','comment','pageIndex','edit','cover','visibility','delete','select','drafts','bookmarks','list','categories','newMessage','blocked','viewProfile','mute','block','yourWorld','myCity','reset','signIn','createAccount','react','editMessage','unsend','leaveLive'];
const handlers = Object.fromEntries(all.map(id => [id, () => id]));
const expected = {
 home:['search','explore','viewProfile','refresh','settings','leaveLive'], profile:['follow','message','saveCreator','share','copy','report'],
 project:['savePage','share','comment','pageIndex','copy','report'], studio:['drafts','bookmarks','select'],
 messages:['newMessage','search','blocked'], conversation:['viewProfile','share','mute','deleteChat','block','report'], explore:['search','yourWorld','myCity','reset'],
 shared:['savePage','share','comment','copy','categories','settings','report'], message:['react','editMessage','unsend'], settings:[],
};
for (const kind of Object.keys(expected)) for (const viewer of [{signedIn:false},{signedIn:true},{signedIn:true,owner:true}]) {
 test(`${kind}: capabilities and cap for ${JSON.stringify(viewer)}`, () => {
   const model = contextActions(kind, viewer, {handlers});
   const actions = [...model.primary,...model.groups.flat()];
   assert.ok(actions.length <= (viewer.owner ? (kind === 'profile' ? 10 : kind === 'project' ? 11 : 8) : 8)); assert.ok(model.primary.length <= 3);
   assert.ok(actions.every(action => typeof action.run === 'function' && !('disabled' in action)));
   if (!viewer.signedIn) for (const id of ['follow','saveCreator','edit','delete','mute']) assert.ok(!ids(model).includes(id));
   if (!viewer.owner) for (const id of ['editProfile','insights','reorder','edit','cover','visibility','delete']) assert.ok(!ids(model).includes(id));
   if (viewer.signedIn && !viewer.owner) assert.deepEqual(Array.from(ids(model)), expected[kind]);
   assert.equal(ids(contextActions(kind,viewer,{handlers:{}})).length,0);
 });
}
test('owner maps preserve requested order; unavailable callbacks are absent', () => {
 assert.deepEqual(Array.from(ids(contextActions('profile',{signedIn:true,owner:true},{handlers:{...handlers,viewAsVisitor(){throw new Error('Retired visitor preview must not run.');}}}))),['newProject','editProfile','share','reorder','insights','bookmarks','copy','settings']);
 assert.deepEqual(Array.from(ids(contextActions('project',{signedIn:true,owner:true},{handlers}))),['edit','cover','list','projectInfo','viewProfile','pageIndex','copy','visibility','delete']);
 assert.deepEqual(Array.from(ids(contextActions('home',{signedIn:true},{handlers:{newProject:handlers.newProject,explore:handlers.explore}}))),['explore']);
});
test('shared visitor actions offer auth and preserve the existing return destination', () => {
 assert.deepEqual(Array.from(ids(contextActions('shared',{signedIn:false},{handlers}))),['savePage','share','signIn','createAccount','comment','copy','categories','settings']);
 const source=read('../src/presentation/mobile/SharedContextActions.tsx');
 assert.match(source,/readSharedReturnPath\(pathname \+ search\)/); assert.match(source,/requestAuthenticatedDestination\(\{ kind: 'route', path/);
});

test('owner project includes both curation actions and deletion with the relocated reader controls',()=>{
 const owner=contextActions('project',{signedIn:true,owner:true},{handlers:{...handlers,startHere:()=>{},thenNow:()=>{}}});
 assert.deepEqual(Array.from(ids(owner)),['edit','cover','list','projectInfo','viewProfile','startHere','thenNow','pageIndex','visibility','delete']);
 for(const viewer of [{signedIn:false},{signedIn:true,owner:false}])assert.ok(!ids(contextActions('project',viewer,{handlers:{...handlers,startHere:()=>{},thenNow:()=>{}}})).includes('startHere'));
});

test('shared current-page registration retains auth-gated actions alongside portfolio navigation', () => {
 const calls=[];
 const page=contextActions('shared',{signedIn:false},{handlers:{savePage:()=>calls.push('auth-save'),comment:()=>calls.push('auth-comment')}});
 const shell=contextActions('shared',{signedIn:false},{handlers:{signIn:handlers.signIn,createAccount:handlers.createAccount,share:handlers.share,copy:handlers.copy,categories:handlers.categories,settings:handlers.settings}});
 const merged=mergeContextActions([page,shell]);
 assert.deepEqual(Array.from(ids(merged)),['savePage','share','signIn','createAccount','comment','copy','categories','settings']);
 for(const action of [...merged.primary,...merged.groups.flat()].filter(a=>['savePage','comment'].includes(a.id)))action.run();
 assert.deepEqual(calls,['auth-save','auth-comment']);
});
test('registration composition stays in the active route kind and keeps canonical ordering', () => {
 const project=contextActions('project',{signedIn:true,owner:true},{title:'Work',handlers:{share:handlers.share}});
 const owner=contextActions('project',{signedIn:true,owner:true},{handlers:{edit:handlers.edit,delete:handlers.delete}});
 const home=contextActions('home',{signedIn:true},{handlers});
 const merged=mergeContextActions([project,owner,home]);
 assert.deepEqual(Array.from(ids(merged)),['edit','delete']); assert.equal(merged.title,'Work');
});
const nodes = tree => React.isValidElement(tree) ? [tree,...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];

function sheetHarness({viewportHeight=800,safeTop=16,entranceOffset=0,layout,model:providedModel,presentation='mobile',onboardingFiles=false,onAction}={}) {
 const slots=[], calls=[], motions=[], effects=[], timers=new Map(), measurements={viewport:0,panel:0}; let cursor=0, escape, tree, now=0, timerId=0, disposed=false, lateWrites=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const effect=(fn,deps)=>{const index=cursor++,previous=slots[index];if(!same(previous?.deps,deps)){const slot={deps,cleanup:previous?.cleanup};slots[index]=slot;effects.push(()=>{slot.cleanup?.();slot.cleanup=fn();});}};
 const setTimer=(fn,delay=0)=>{timers.set(++timerId,{fn,at:now+delay});return timerId;};
 const clearTimer=id=>timers.delete(id);
 class ElementStub {
  constructor(kind='header') { this.kind=kind; this.captured=new Set(); }
  closest(selector) {
   if(selector==='button:not(.mobile-context-resize)')return this.kind==='button'?this:null;
   if(selector==='.mobile-context-resize')return this.kind==='resize'?this:null;
   return null;
  }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
 }
 const header=new ElementStub(), resize=new ElementStub('resize'), close=new ElementStub('button');
 header.querySelector=selector=>selector==='.mobile-context-resize'?resize:null;
 const viewport={getBoundingClientRect:()=>{measurements.viewport++;return {top:0,bottom:viewportHeight,height:viewportHeight};}};
 const dialog={getBoundingClientRect:()=>{
  measurements.panel++;
  const node=nodes(tree).find(node=>node.props.role==='dialog');
  const height=viewportHeight-Math.max(16,safeTop),rest=node?.props['data-expanded']?0:Math.max(0,height-viewportHeight*.75);
  const offset=rest+Number.parseFloat(node?.props.style?.['--sheet-drag-y']??0)+(node?.props['data-sheet-dragging']?0:entranceOffset);
  return {top:viewportHeight-height+offset,bottom:viewportHeight+offset,height};
 }};
 const react={...React,useEffect:effect,useId:()=> 'title',useRef(initial){return slots[cursor++]??={current:initial};},useState(initial){
  const index=cursor++; if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;
  return [slots[index],next=>{if(disposed)lateWrites++;slots[index]=typeof next==='function'?next(slots[index]):next;}];
 }};
 const {MobileActionSheet}=compile('../src/components/messages/MobileActionSheet.tsx',{
  react,
  '../../presentation/usePresentation':{usePresentation:()=> presentation},
  '../../presentation/motion/useSheetMotion':{useSheetMotion:onClose=>({closing:false,close(after,scope){motions.push({immediate:typeof after==='function',scope});if(after)after();else onClose();}})},
  '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:viewport})},
  '../../hooks/useModalFocus':{useModalFocus:(open,_ref,onClose,preventScroll)=>{assert.equal(open,true);assert.equal(preventScroll,true);escape=onClose;}},
 },{Element:ElementStub,setTimeout:setTimer,clearTimeout:clearTimer,window:{setTimeout:setTimer,clearTimeout:clearTimer}});
 const model=providedModel??contextActions('home',{signedIn:true},{handlers:{explore:()=>calls.push('explore'),newProject:()=>calls.push('new')}});
 const render=()=>{
  cursor=0;tree=MobileActionSheet({model,onClose:()=>calls.push('close'),onAction:onAction??(action=>action.run()),layout,onboardingFiles});
  nodes(tree).find(node=>node.props.role==='dialog').ref.current=dialog;
  effects.splice(0).forEach(run=>run());
  return tree;
 };
 const find=predicate=>nodes(render()).find(predicate);
 const pointer=(name,overrides={})=>find(node=>node.type==='header').props[name]({
  isPrimary:true,button:0,pointerId:1,clientX:100,clientY:600,target:header,currentTarget:header,...overrides,
 });
 const resizeButton=()=>find(node=>node.props.className==='mobile-context-resize');
 return {render,find,calls,motions,viewport,measurements,timers,get lateWrites(){return lateWrites;},escape:()=>escape(),pointer,header,resize,close,resizeButton,
  advance(ms){now+=ms;for(const[id,timer]of[...timers])if(timer.at<=now){timers.delete(id);timer.fn();}},
  async flush(){for(let i=0;i<5;i++)await Promise.resolve();},
  dispose(){for(const slot of slots)slot?.cleanup?.();disposed=true;},
  dialog:()=>find(node=>node.props.role==='dialog'),
  scrim:()=>find(node=>node.props.className?.includes('mobile-context-scrim')),
  clickResize:(detail=1)=>resizeButton().props.onClick({detail}),
 };
}

const deferredCopy=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const actionRow=(h,label)=>h.find(node=>node.type==='button'&&nodes(node).some(child=>child.type==='span'&&child.props.children===label));
const clickAction=(h,row)=>row.props.onClick({currentTarget:{closest:()=>h.viewport}});
const actionGlyph=row=>nodes(row).find(node=>node.type==='InterfaceIcon');
const profileCopyModel=owner=>contextActions('profile',{signedIn:true,owner},{handlers:{copy(){}}});

test('MOBILE profile and WEB owner catalogue copy confirm only success, block duplicate activation and restore the icon',async()=>{
 for(const [presentation,owner] of [['mobile',true],['mobile',false],['web',true]]){
  const copy=deferredCopy();let writes=0;
  const h=sheetHarness({presentation,model:profileCopyModel(owner),onAction:()=>{writes++;return copy.promise;}});
  const row=actionRow(h,'Copy public catalogue link');
  assert.equal(actionGlyph(row).props.icon,'CopyIcon');
  clickAction(h,row);clickAction(h,row);
  assert.equal(writes,1,'A second tap before rerender must not start another clipboard write');
  assert.equal(h.motions.length,0,'This action keeps its row visible instead of closing the sheet');
  assert.equal(actionRow(h,'Copy public catalogue link').props['aria-busy'],true);
  assert.equal(actionGlyph(actionRow(h,'Copy public catalogue link')).props.icon,'CopyIcon');
  assert.equal(h.timers.size,0,'Pending clipboard work cannot start the success timer');
  copy.resolve(true);await h.flush();
  const success=actionGlyph(actionRow(h,'Copy public catalogue link'));
  assert.equal(success.props.icon,'CheckIcon');assert.equal(success.props.keepColor,true);
  assert.equal(success.props.style.color,'var(--status-success)');
  assert.ok(nodes(h.render()).some(node=>node.props.role==='status'&&node.props['aria-live']==='polite'&&node.props.children==='Public catalogue link copied'));
  assert.equal(h.calls.includes('close'),false);
  h.advance(1999);assert.equal(actionGlyph(actionRow(h,'Copy public catalogue link')).props.icon,'CheckIcon');
  h.advance(1);assert.equal(actionGlyph(actionRow(h,'Copy public catalogue link')).props.icon,'CopyIcon');
  assert.equal(h.timers.size,0);h.dispose();
 }
});

test('MOBILE profile copy failures and non-success results never show a confirmation and remain retryable',async()=>{
 for(const result of[false,undefined,'copied']){
  let writes=0;const h=sheetHarness({model:profileCopyModel(true),onAction:()=>{writes++;return Promise.resolve(writes===1?result:true);}});
  clickAction(h,actionRow(h,'Copy public catalogue link'));await h.flush();
  assert.equal(actionGlyph(actionRow(h,'Copy public catalogue link')).props.icon,'CopyIcon');
  assert.equal(h.timers.size,0);
  clickAction(h,actionRow(h,'Copy public catalogue link'));await h.flush();
  assert.equal(writes,2);assert.equal(actionGlyph(actionRow(h,'Copy public catalogue link')).props.icon,'CheckIcon');h.dispose();
 }
 const h=sheetHarness({model:profileCopyModel(true),onAction:()=>Promise.reject(new Error('Clipboard denied'))});
 clickAction(h,actionRow(h,'Copy public catalogue link'));await h.flush();
 assert.equal(actionGlyph(actionRow(h,'Copy public catalogue link')).props.icon,'CopyIcon');assert.equal(h.timers.size,0);h.dispose();
});

test('WEB owner clipboard rejection stays in the sheet with a retryable error and no false confirmation',async()=>{
 const rejected=deferredCopy();let writes=0;
 const h=sheetHarness({presentation:'web',model:profileCopyModel(true),onAction:()=>++writes===1?rejected.promise:Promise.resolve(true)});
 const row=()=>actionRow(h,'Copy public catalogue link');
 clickAction(h,row());rejected.reject(new Error('Clipboard denied'));await h.flush();
 assert.equal(actionGlyph(row()).props.icon,'CopyIcon');
 assert.equal(row().props['aria-busy'],undefined);
 assert.match(String(nodes(h.dialog()).find(node=>node.props.role==='alert')?.props.children),/copy|clipboard/i);
 assert.equal(h.motions.length,0);assert.equal(h.timers.size,0);
 clickAction(h,row());await h.flush();
 assert.equal(writes,2);assert.equal(actionGlyph(row()).props.icon,'CheckIcon');
 assert.equal(nodes(h.dialog()).some(node=>node.props.role==='alert'),false);
 h.dispose();
});

test('closing a profile copy sheet clears its timer and ignores clipboard completion after unmount',async()=>{
 for(const [presentation,finish] of [['mobile','pending'],['mobile','copied'],['web','pending'],['web','copied'],['web','rejected']]){
  const copy=deferredCopy(),h=sheetHarness({presentation,model:profileCopyModel(true),onAction:()=>copy.promise});
  clickAction(h,actionRow(h,'Copy public catalogue link'));
  if(finish==='copied'){copy.resolve(true);await h.flush();h.render();assert.equal(h.timers.size,1);}
  h.escape();h.dispose();assert.ok(h.calls.includes('close'));assert.equal(h.timers.size,0);
  if(finish==='pending')copy.resolve(true);
  if(finish==='rejected')copy.reject(new Error('Clipboard denied after closing'));
  await h.flush();
  h.advance(3000);assert.equal(h.lateWrites,0);assert.equal(h.timers.size,0);
 }
 const reopened=sheetHarness({presentation:'web',model:profileCopyModel(true)});
 assert.equal(actionGlyph(actionRow(reopened,'Copy public catalogue link')).props.icon,'CopyIcon');reopened.dispose();
});

test('WEB visitor copy and other actions retain motion-close delegation without copy feedback',async()=>{
 for(const[presentation,kind,id,owner]of[['web','profile','copy',false],['web','profile','share',true],['mobile','shared','copy',true],['mobile','profile','share',true]]){
  let runs=0;const model=contextActions(kind,{signedIn:true,owner},{handlers:{[id](){}}});
  const action=[...model.primary,...model.groups.flat()].find(item=>item.id===id);
  const h=sheetHarness({presentation,model,onAction:()=>{runs++;return Promise.resolve(true);}});
  clickAction(h,actionRow(h,action.label));await h.flush();
  assert.equal(runs,1);assert.equal(h.motions.length,1);assert.equal(h.motions[0].immediate,true);
  assert.equal(nodes(h.render()).some(node=>node.props.role==='status'&&node.props.children==='Public catalogue link copied'),false);
  assert.equal(h.timers.size,0);h.dispose();
 }
});

function providerCopyHarness(){
 const slots=[],effects=[],calls=[];let cursor=0,tree,dirty=false,location={pathname:'/p/owner',search:''},account='me';
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const react={...React,useRef(value){return slots[cursor++]??={current:value};},useState(value){
  const index=cursor++;slots[index]??={value:typeof value==='function'?value():value};
  return[slots[index].value,next=>{const value=typeof next==='function'?next(slots[index].value):next;if(!Object.is(value,slots[index].value)){slots[index].value=value;dirty=true;}}];
 },useCallback:fn=>fn,useEffect(fn,deps){const index=cursor++,previous=slots[index];if(!same(previous?.deps,deps)){const slot={deps,cleanup:previous?.cleanup};slots[index]=slot;effects.push(()=>{slot.cleanup?.();slot.cleanup=fn();});}}};
 const {MobileContextProvider}=compile('../src/presentation/mobile/MobileContextActions.tsx',{
  react,'react-dom':{flushSync:fn=>fn()},'react-router-dom':{useLocation:()=>location},
  '../../contexts/AuthContext':{useAuth:()=>({user:{id:account}})},'../usePresentation':{usePresentation:()=> 'mobile'},
  './contextFocus':{focusMobileContextButton:()=>{calls.push('focus');return null;}},'./contextActions':{mergeContextActions},
  '../../components/messages/MobileActionSheet':{MobileActionSheet:'copy-feedback-sheet'},
 },{Error,localStorage:{getItem:()=>null,setItem(){}}});
 const render=()=>{for(let renders=0;renders<8;renders++){cursor=0;dirty=false;tree=MobileContextProvider({children:null});effects.splice(0).forEach(run=>run());if(!dirty)return tree;}assert.fail('Provider effects must settle');};
 const sheet=()=>nodes(render()).find(node=>node.type==='copy-feedback-sheet');
 render();
 return{calls,render,sheet,
  open(source){render().props.value.open(source);render();},
  run(id='copy'){const current=sheet();const action=[...current.props.model.primary,...current.props.model.groups.flat()].find(item=>item.id===id);return current.props.onAction(action);},
  close(){sheet().props.onClose();render();},
  route(path){location={pathname:path,search:''};render();},
  account(value){account=value;render();},
  notice(){return nodes(render()).find(node=>node.props.role==='alert');},
  dispose(){for(const slot of slots)slot?.cleanup?.();},
 };
}

test('provider keeps profile copy open, re-resolves its latest capability and reports clipboard success explicitly',async()=>{
 for(const owner of[true,false]){
  const copy=deferredCopy(),h=providerCopyHarness();let oldWrites=0,newWrites=0;
  let model=contextActions('profile',{signedIn:true,owner},{handlers:{copy(){oldWrites++;}}});
  h.open(()=>model);const clicked=h.sheet(),selected=[...clicked.props.model.groups.flat()].find(action=>action.id==='copy');
  model=contextActions('profile',{signedIn:true,owner},{handlers:{copy(){newWrites++;return copy.promise;}}});
  const pending=clicked.props.onAction(selected);assert.ok(pending instanceof Promise || typeof pending?.then==='function');
  assert.equal(oldWrites,0);assert.equal(newWrites,1);assert.ok(h.sheet());
  assert.deepEqual(h.calls,['focus'],'A successful copy must not close the sheet or steal row focus');
  copy.resolve();assert.equal(await pending,true);assert.ok(h.sheet());h.dispose();
 }
 const h=providerCopyHarness();let writes=0;
 let model=contextActions('profile',{signedIn:true,owner:true},{handlers:{copy(){writes++;}}});
 h.open(()=>model);const clicked=h.sheet(),selected=clicked.props.model.groups.flat().find(action=>action.id==='copy');
 model=contextActions('profile',{signedIn:true,owner:true},{handlers:{}});
 assert.equal(clicked.props.onAction(selected),false);assert.equal(writes,0);assert.equal(h.sheet(),undefined);h.dispose();
});

test('profile copy provider reports failures without confirmation and clears the notice for a successful retry',async()=>{
 const retry=deferredCopy(),h=providerCopyHarness();let writes=0;
 h.open(contextActions('profile',{signedIn:true,owner:true},{handlers:{copy(){writes++;return writes===1?Promise.reject(new Error('Clipboard denied')):retry.promise;}}}));
 assert.equal(await h.run(),false);assert.ok(h.sheet());
 assert.ok(h.notice());assert.ok(React.Children.toArray(h.notice().props.children).includes('Clipboard denied'));
 const pending=h.run();assert.equal(h.notice(),undefined,'Retry clears the previous failure instead of showing success and error together');
 retry.resolve();assert.equal(await pending,true);assert.equal(writes,2);assert.equal(h.notice(),undefined);assert.ok(h.sheet());h.dispose();
 const sync=providerCopyHarness();sync.open(contextActions('profile',{signedIn:true,owner:true},{handlers:{copy(){throw new Error('Clipboard denied');}}}));
 assert.equal(await sync.run(),false);assert.ok(sync.notice());assert.ok(sync.sheet());sync.dispose();
});

test('profile copy completion is rejected after route, account, close or reopened-sheet changes',async()=>{
 for(const change of['route','account','close','reopen'])for(const rejects of[false,true]){
  const copy=deferredCopy(),h=providerCopyHarness(),model=contextActions('profile',{signedIn:true,owner:true},{handlers:{copy:()=>copy.promise}});
  h.open(model);const pending=h.run();
  if(change==='route')h.route('/p/another');
  else if(change==='account')h.account('another-account');
  else {h.close();if(change==='reopen')h.open(model);}
  if(rejects)copy.reject(new Error('Late clipboard failure'));else copy.resolve();
  assert.equal(await pending,false,`${change} must invalidate a pending clipboard confirmation`);
  assert.equal(h.notice(),undefined,'An old clipboard failure must not appear over a different screen or new sheet');
  assert.equal(Boolean(h.sheet()),change==='reopen');h.dispose();
 }
});

test('provider keeps close-first delegation for other profile actions and non-profile copy',()=>{
 for(const[kind,id]of[['profile','share'],['shared','copy']]){
  const h=providerCopyHarness();let runs=0,openDuringRun;
  h.open(contextActions(kind,{signedIn:true,owner:true},{handlers:{[id](){runs++;openDuringRun=Boolean(h.sheet());}}}));
  h.run(id);assert.equal(runs,1);assert.equal(openDuringRun,false);assert.equal(h.sheet(),undefined);h.dispose();
 }
});

test('file-sheet opt-in provides an explicit Done action while ordinary sheets retain their existing close control',()=>{
 const files=sheetHarness({layout:'files'}),tree=files.render();
 assert.equal(files.dialog().props['data-sheet-layout'],'files');
 const done=nodes(tree).find(node=>node.props['aria-label']==='Done reordering files');
 assert.equal(done.props.children,'Done');done.props.onClick();assert.deepEqual(files.calls,['close']);
 const ordinary=sheetHarness();assert.equal(ordinary.dialog().props['data-sheet-layout'],undefined);
 assert.ok(ordinary.find(node=>node.props['aria-label']==='Close actions'));
});

test('onboarding file-sheet portals use the actual presentation and retain Done, Escape and backdrop dismissal',()=>{
 for(const presentation of ['mobile','web']){
  const h=sheetHarness({layout:'files',presentation,onboardingFiles:true});
  assert.equal(h.scrim().props['data-presentation'],presentation);
  assert.equal(h.scrim().props['data-onboarding-files-manager'],true);
  assert.equal(h.dialog().props['data-onboarding-files-manager'],true);
  const done=h.find(node=>node.props['aria-label']==='Done reordering files');
  assert.equal(done.props['data-ui-control'],'button');assert.equal(done.props['data-control-size'],'sm');
  done.props.onClick();h.escape();
  const scrim=h.scrim();scrim.props.onClick({target:scrim,currentTarget:scrim});
  assert.deepEqual(h.calls,['close','close','close']);
  const legacy=sheetHarness({layout:'files',presentation});
  assert.equal(legacy.scrim().props['data-presentation'],'mobile');
  assert.equal(legacy.scrim().props['data-onboarding-files-manager'],undefined);
  assert.equal(legacy.find(node=>node.props['aria-label']==='Done reordering files').props['data-control-size'],'md');
 }
});

test('onboarding WEB file manager omits mobile detents and never begins a header drag',()=>{
 const web=sheetHarness({layout:'files',presentation:'web',onboardingFiles:true});
 assert.equal(web.resizeButton(),undefined);
 web.pointer('onPointerDown');web.pointer('onPointerMove',{clientY:450});web.pointer('onPointerUp',{clientY:450});
 assert.equal(web.dialog().props['data-expanded'],false);
 assert.equal(web.dialog().props['data-sheet-dragging'],undefined);
 assert.equal(web.dialog().props.style['--sheet-drag-y'],'0px');
 assert.deepEqual(web.measurements,{viewport:0,panel:0});assert.deepEqual(web.calls,[]);
 for(const options of [{presentation:'mobile',onboardingFiles:true},{presentation:'web',onboardingFiles:false}]){
  const retained=sheetHarness({layout:'files',...options});assert.ok(retained.resizeButton());
  const startsExpanded=options.presentation==='mobile';
  assert.equal(retained.dialog().props['data-expanded'],startsExpanded);
  assert.equal(retained.resizeButton().props['aria-expanded'],startsExpanded);
  retained.clickResize();
  assert.equal(retained.dialog().props['data-expanded'],!startsExpanded);
  assert.equal(retained.resizeButton().props['aria-expanded'],!startsExpanded);
 }
});

test('mobile owner profile actions open compact and expand only after an explicit swipe or keyboard activation',()=>{
 const actionIds=['newProject','editProfile','share','thenNow','reorder','insights','bookmarks','copy','settings'];
 const model=contextActions('profile',{signedIn:true,owner:true},{handlers:Object.fromEntries(actionIds.map(id=>[id,()=>id]))});
 const h=sheetHarness({model}),labels=()=>nodes(h.render()).filter(node=>node.type==='button').flatMap(node=>nodes(node).filter(child=>child.type==='span'&&typeof child.props.children==='string').map(child=>child.props.children));
 assert.equal(h.dialog().props['data-expanded'],false);
 assert.equal(h.resizeButton().props['aria-label'],'Expand actions');assert.equal(h.resizeButton().props['aria-expanded'],false);
 const initialLabels=labels();assert.equal(initialLabels.length,9);assert.equal(initialLabels.at(-1),'Settings');
 assert.ok(initialLabels.includes('New project'));assert.ok(initialLabels.includes('Copy public catalogue link'));
 h.pointer('onPointerDown',{target:h.resize});h.pointer('onPointerMove',{clientY:450});h.pointer('onPointerUp',{clientY:450});
 assert.equal(h.dialog().props['data-expanded'],true);assert.equal(h.resizeButton().props['aria-label'],'Collapse actions');
 assert.deepEqual(labels(),initialLabels);assert.deepEqual(h.calls,[]);
 h.clickResize();assert.equal(h.dialog().props['data-expanded'],true,'The swipe-generated handle click cannot undo expansion');
 h.pointer('onPointerDown');h.pointer('onPointerMove',{clientY:690});h.pointer('onPointerUp',{clientY:690});
 assert.equal(h.dialog().props['data-expanded'],false);assert.equal(h.resizeButton().props['aria-label'],'Expand actions');
 assert.deepEqual(labels(),initialLabels);
 h.clickResize(0);assert.equal(h.dialog().props['data-expanded'],true);assert.equal(h.resizeButton().props['aria-expanded'],true);
 assert.deepEqual(labels(),initialLabels);assert.deepEqual(h.calls,[]);
 h.find(node=>node.props['aria-label']==='Close actions').props.onClick();assert.deepEqual(h.calls,['close']);
 const reopened=sheetHarness({model});assert.equal(reopened.dialog().props['data-expanded'],false);assert.equal(reopened.resizeButton().props['aria-expanded'],false);
});

test('WEB owner profile actions open expanded without resize controls or header drag',()=>{
 const model=contextActions('profile',{signedIn:true,owner:true},{handlers});
 const h=sheetHarness({model,presentation:'web'});
 assert.equal(h.dialog().props['data-expanded'],true);
 assert.equal(h.resizeButton(),undefined);
 h.pointer('onPointerDown');h.pointer('onPointerMove',{clientY:690});h.pointer('onPointerUp',{clientY:690});
 assert.equal(h.dialog().props['data-expanded'],true);
 assert.equal(h.dialog().props['data-sheet-dragging'],undefined);
 assert.deepEqual(h.measurements,{viewport:0,panel:0});
});

test('expanded profile New project and last Settings row delegate the same real context callbacks',()=>{
 for(const actionId of ['newProject','settings']){
  const delegated=[],model=contextActions('profile',{signedIn:true,owner:true},{handlers:{newProject:()=>delegated.push('newProject'),editProfile(){},share(){},thenNow(){},reorder(){},insights(){},bookmarks(){},copy(){},settings:()=>delegated.push('settings')}});
  const h=sheetHarness({model}),action=[...model.primary,...model.groups.flat()].find(item=>item.id===actionId);
  assert.equal(h.dialog().props['data-expanded'],false);
  h.pointer('onPointerDown');h.pointer('onPointerMove',{clientY:450});h.pointer('onPointerUp',{clientY:450});
  assert.equal(h.dialog().props['data-expanded'],true);
  h.find(node=>node.type==='button'&&nodes(node).some(child=>child.type==='span'&&child.props.children===action.label)).props.onClick({currentTarget:{closest:()=>h.viewport}});
  assert.deepEqual(delegated,[actionId]);assert.equal(h.motions.length,1);
  assert.equal(h.motions[0].immediate,true);assert.equal(h.motions[0].scope,h.viewport);
 }
});

test('owner profile scrim follows the measured visual viewport origin and height through both detents',()=>{
 const model=contextActions('profile',{signedIn:true,owner:true},{handlers});
 for(const viewportHeight of [912,684,600]){
  const h=sheetHarness({model,viewportHeight,safeTop:59});
  for(const expanded of [false,true,false]){
   assert.equal(h.dialog().props['data-expanded'],expanded);
   const style=h.scrim().props.style;
   assert.equal(style.top,'var(--dialog-viewport-top, 0px)');
   assert.equal(style.bottom,'auto','The owner sheet must not remain anchored to the taller layout viewport');
   assert.equal(style.height,'var(--dialog-viewport-height, 100dvh)');
   h.clickResize(0);
  }
 }
});

test('visitor, project and ordinary action sheets retain their collapsed entry',()=>{
 for(const options of [
  {},
  {model:contextActions('profile',{signedIn:false,owner:false},{handlers})},
  {model:contextActions('profile',{signedIn:true,owner:false},{handlers})},
  {model:contextActions('project',{signedIn:true,owner:true},{handlers})},
 ]){
  const h=sheetHarness(options);assert.equal(h.dialog().props['data-expanded'],false);
  assert.equal(h.resizeButton().props['aria-expanded'],false);assert.equal(h.resizeButton().props['aria-label'],'Expand actions');
  assert.equal(h.scrim().props.style.top,undefined);assert.equal(h.scrim().props.style.bottom,0);
  assert.equal(h.scrim().props.style.height,'var(--dialog-viewport-height, 100dvh)');
 }
});

test('mobile file management starts expanded without inheriting the owner profile action layout',()=>{
 const model=contextActions('profile',{signedIn:true,owner:true},{handlers});
 const h=sheetHarness({model,layout:'files'});
 assert.equal(h.dialog().props['data-expanded'],true);
 assert.equal(h.dialog().props['data-sheet-layout'],'files');
 assert.equal(h.dialog().props['data-owner-profile-actions'],undefined);
 assert.equal(h.resizeButton().props['aria-expanded'],true);
 assert.equal(h.resizeButton().props['aria-label'],'Collapse actions');
 assert.equal(h.scrim().props.style.top,undefined);
 assert.equal(h.scrim().props.style.bottom,0);
 assert.equal(h.scrim().props.style.height,'var(--dialog-viewport-height, 100dvh)');
});

test('the common sheet supports close, backdrop, Escape, swipe and action delegation without placeholders', () => {
 const h=sheetHarness(),list=nodes(h.render());
 const close=list.find(n=>n.props['aria-label']==='Close actions'),scrim=list.find(n=>n.props.className?.includes('mobile-context-scrim'));
 close.props.onClick();h.escape();const background={};scrim.props.onClick({target:background,currentTarget:background});
 assert.deepEqual(h.calls,['close','close','close']);
 assert.ok(h.motions.every(motion=>motion.immediate&&motion.scope===h.viewport),'Ordinary Actions dismissals release the real sheet synchronously and give the decorative exit the viewport root');
 scrim.props.onClick({target:{},currentTarget:background});assert.equal(h.calls.length,3,'Clicks inside the sheet do not dismiss it');
 list.find(n=>n.type==='button'&&nodes(n).some(x=>x.type==='span'&&x.props.children==='Explore')).props.onClick();assert.equal(h.calls.at(-1),'explore');
 h.pointer('onPointerDown');h.pointer('onPointerUp',{clientY:690});
 assert.equal(h.calls.at(-1),'close');assert.equal(h.calls.length,5);
 assert.deepEqual(h.motions.at(-1),{immediate:true,scope:h.viewport},'Swipe dismissal follows the same interruptible exit path');
 h.pointer('onPointerDown',{target:h.close});h.pointer('onPointerUp',{clientY:690});
 assert.equal(h.calls.length,5,'A close-button press cannot also trigger a drag');
 assert.ok(list.every(n=>n.type!=='button'||n.props.disabled===undefined));
});

test('the resize button exposes expansion to keyboard users without changing available actions',()=>{
 const h=sheetHarness(),labels=()=>nodes(h.render()).filter(node=>node.type==='span').map(node=>node.props.children);
 const initialLabels=labels();
 assert.equal(h.dialog().props['data-expanded'],false);
 assert.equal(h.resizeButton().props['aria-label'],'Expand actions');
 assert.equal(h.resizeButton().props['aria-expanded'],false);
 assert.equal(h.dialog().props['data-sheet-interacted'],undefined);
 h.clickResize(0);
 assert.equal(h.dialog().props['data-expanded'],true);
 assert.equal(h.resizeButton().props['aria-label'],'Collapse actions');
 assert.equal(h.resizeButton().props['aria-expanded'],true);
 assert.equal(h.dialog().props['data-sheet-interacted'],true,'A keyboard expansion ends entrance animation for this mount');
 assert.deepEqual(labels(),initialLabels);
 assert.equal(h.dialog().props['aria-labelledby'],'title');
 h.clickResize(0);
 assert.equal(h.dialog().props['data-expanded'],false);
 assert.deepEqual(h.calls,[]);
});

test('stationary taps, release and cancellation never re-enable the entrance animation',()=>{
 const h=sheetHarness();
 assert.equal(h.dialog().props['data-sheet-interacted'],undefined);
 h.pointer('onPointerDown');
 assert.equal(h.dialog().props['data-sheet-interacted'],true);
 h.pointer('onPointerUp');
 assert.equal(h.dialog().props['data-sheet-dragging'],undefined);
 assert.equal(h.dialog().props['data-sheet-interacted'],true);
 h.pointer('onPointerDown');h.pointer('onPointerMove',{clientY:550});h.pointer('onPointerCancel');
 assert.equal(h.dialog().props['data-sheet-interacted'],true);
 assert.equal(h.dialog().props['data-sheet-dragging'],undefined);
 h.clickResize(0);h.clickResize(0);
 assert.equal(h.dialog().props['data-sheet-interacted'],true);
 assert.equal(h.dialog().props['data-expanded'],false);
});

test('vertical dragging translates a fixed panel, expands, collapses and suppresses its follow-up click',()=>{
 const h=sheetHarness();
 h.pointer('onPointerDown',{target:h.resize});
 assert.equal(h.resize.hasPointerCapture(1),true);
 assert.equal(h.dialog().props['data-sheet-dragging'],true);
 h.pointer('onPointerMove',{clientY:500});
 assert.equal(h.dialog().props.style['--sheet-drag-y'],'-100px');
 assert.equal(h.dialog().props.style.height,undefined,'Dragging never writes panel height');
 assert.deepEqual(h.measurements,{viewport:1,panel:1},'Move events reuse the start measurement');
 h.pointer('onPointerMove',{clientY:-500});
 assert.equal(h.dialog().props.style['--sheet-drag-y'],'-184px','The translated panel stops at its safe top edge');
 assert.deepEqual(h.measurements,{viewport:1,panel:1});
 h.pointer('onPointerUp',{clientY:450});
 assert.equal(h.resize.hasPointerCapture(1),false);
 assert.equal(h.dialog().props.style.height,undefined);
 assert.equal(h.dialog().props.style['--sheet-drag-y'],'0px');
 assert.equal(h.dialog().props['data-sheet-dragging'],undefined);
 assert.equal(h.dialog().props['data-expanded'],true);
 h.clickResize();assert.equal(h.dialog().props['data-expanded'],true,'The drag-generated click does not undo expansion');
 assert.deepEqual(h.calls,[]);
 h.pointer('onPointerDown');h.pointer('onPointerMove',{clientY:690});h.pointer('onPointerUp',{clientY:690});
 assert.equal(h.dialog().props['data-expanded'],false);
 assert.deepEqual(h.calls,[],'Dragging an expanded sheet down collapses it before dismissal');
 h.pointer('onPointerDown');h.pointer('onPointerUp',{clientY:690});
 assert.deepEqual(h.calls,['close']);
});

test('simple resize taps remain clicks; cancelled, horizontal and unrelated pointers cannot resize or dismiss',()=>{
 const h=sheetHarness();
 h.pointer('onPointerDown',{target:h.resize});h.pointer('onPointerUp',{clientY:602});h.clickResize();
 assert.equal(h.dialog().props['data-expanded'],true,'A stationary handle press still activates its button');
 h.clickResize(0);
 for(const ignored of [{isPrimary:false},{button:2},{target:h.close}]){
  h.pointer('onPointerDown',ignored);h.pointer('onPointerMove',{clientY:450});h.pointer('onPointerUp',{clientY:450});
  assert.equal(h.dialog().props['data-expanded'],false);assert.equal(h.dialog().props.style.height,undefined);
 }
 h.pointer('onPointerDown',{target:h.resize});h.pointer('onPointerMove',{pointerId:2,clientY:450});h.pointer('onPointerUp',{pointerId:2,clientY:450});
 assert.equal(h.dialog().props.style.height,undefined);
 h.pointer('onPointerMove',{clientX:180,clientY:450});h.pointer('onPointerUp',{clientX:180,clientY:450});
 h.clickResize();
 assert.equal(h.dialog().props['data-expanded'],false);assert.equal(h.dialog().props.style.height,undefined);
 h.pointer('onPointerDown',{target:h.resize});h.pointer('onPointerUp',{clientX:180});h.clickResize();
 assert.equal(h.dialog().props['data-expanded'],false,'Horizontal handle drags cannot become toggle clicks, even without a move event');
 for(const cancel of ['onPointerCancel','onLostPointerCapture']){
  h.pointer('onPointerDown');h.pointer('onPointerMove',{clientY:450});assert.equal(h.dialog().props.style['--sheet-drag-y'],'-150px');
  h.pointer(cancel);h.pointer('onPointerUp',{clientY:450});
  assert.equal(h.dialog().props['data-expanded'],false);assert.equal(h.dialog().props.style.height,undefined);
  assert.equal(h.dialog().props.style['--sheet-drag-y'],'0px');assert.equal(h.dialog().props['data-sheet-dragging'],undefined);
 }
 assert.deepEqual(h.calls,[]);
});

test('a drag catches its visible entrance position and respects a taller safe-top inset',()=>{
 const entering=sheetHarness({entranceOffset:90});
 entering.pointer('onPointerDown');
 assert.equal(entering.dialog().props.style['--sheet-drag-y'],'90px','Disabling entrance motion preserves the currently painted offset');
 entering.pointer('onPointerMove',{clientY:570});
 assert.equal(entering.dialog().props.style['--sheet-drag-y'],'60px');
 const inset=sheetHarness({viewportHeight:600,safeTop:80});
 inset.pointer('onPointerDown');inset.pointer('onPointerMove',{clientY:300});
 assert.equal(inset.dialog().props.style['--sheet-drag-y'],'-70px','The expanded canvas cannot move above its safe top');
 inset.pointer('onPointerCancel');
 assert.equal(inset.dialog().props.style['--sheet-drag-y'],'0px');
 assert.equal(inset.dialog().props['data-expanded'],false);
});

test('fast swipe thresholds and cancelled expanded gestures preserve the settled state',()=>{
 const h=sheetHarness();
 h.pointer('onPointerDown');h.pointer('onPointerUp',{clientY:561});
 assert.equal(h.dialog().props['data-expanded'],false);
 h.pointer('onPointerDown');h.pointer('onPointerUp',{clientY:560});
 assert.equal(h.dialog().props['data-expanded'],true);
 h.pointer('onPointerDown');h.pointer('onPointerMove',{clientY:670});h.pointer('onPointerCancel');
 assert.equal(h.dialog().props['data-expanded'],true);assert.equal(h.dialog().props.style['--sheet-drag-y'],'0px');
 h.pointer('onPointerDown');h.pointer('onPointerUp',{clientY:640});
 assert.equal(h.dialog().props['data-expanded'],false);
 h.pointer('onPointerDown');h.pointer('onPointerUp',{clientY:664});
 assert.deepEqual(h.calls,[],'The existing dismissal boundary remains strictly greater than64px');
 h.pointer('onPointerDown');h.pointer('onPointerUp',{clientY:665});
 assert.deepEqual(h.calls,['close']);
 assert.equal(h.dialog().props.style['--sheet-drag-y'],'65px','Exit starts at the released drag position');
});

test('public action sheets retain intrinsic geometry and immediately release ordinary dismissals into decorative slide motion',()=>{
 const calls=[],root={},motion={closing:false,close(after,scope){calls.push(['motion',Boolean(after),scope]);if(after)after();else calls.push('close');}};
 let escape;
 const {PublicActionSheet}=compile('../src/visitor/mobile/PublicActionSheet.tsx',{
  react:{...React,useRef:()=>({current:null}),useId:()=> 'public-title'},
  '../../presentation/motion/useSheetMotion':{useSheetMotion:()=>motion},
  '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:root})},
  '../../hooks/useModalFocus':{useModalFocus:(open,_dialog,close,preventScroll)=>{assert.equal(open,true);assert.equal(preventScroll,true);escape=close;}},
 });
 const model={title:'Public actions',primary:[{id:'share',label:'Share',run(){}}],groups:[]};
 const render=()=>PublicActionSheet({model,onClose:()=>calls.push('close'),onAction:action=>calls.push(['action',action.id]),children:React.createElement('button',{id:'extra'},'Extra')});
 const list=nodes(render()),sheet=list.find(node=>node.props.role==='dialog'),overlay=list.find(node=>node.props.className==='public-actions-overlay');
 assert.equal(sheet.props['data-motion-sheet'],'');assert.equal(overlay.props['data-motion-scrim'],'');
 assert.equal(sheet.props.style,undefined,'Public sizing remains intrinsic');assert.equal(sheet.props['aria-labelledby'],'public-title');
 assert.ok(list.find(node=>node.props.id==='extra'),'Dynamic child actions remain in the scroll body');
 list.find(node=>node.props['aria-label']==='Close actions').props.onClick();escape();
 const target={};overlay.props.onClick({target,currentTarget:target});overlay.props.onClick({target:{},currentTarget:target});
 assert.equal(calls.filter(call=>call==='close').length,3,'Interior clicks do not dismiss');
 assert.ok(calls.filter(Array.isArray).every(call=>call[0]==='motion'&&call[1]===true&&call[2]===root),'Close, Escape and backdrop all remove the active modal during their original handler');
 const share=list.find(node=>node.type==='button'&&nodes(node).some(child=>child.props.children==='Share'));
 share.props.onClick({currentTarget:{closest:selector=>{assert.equal(selector,'[data-motion-scrim]');return root;}}});
 assert.deepEqual(calls.slice(-2),[['motion',true,root],['action','share']],'Native actions run in the original activation without waiting for slide exit');
 motion.closing=true;
 assert.equal(nodes(render()).find(node=>node.props.role==='dialog').props['data-motion-closing'],true);
});
test('provider re-resolves capabilities and restores context focus before handing off an action', () => {
 const slots=[]; let cursor=0, location={pathname:'/',search:''}, account='me'; const effects=[], calls=[];
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 const react={...React,useRef(value){return slots[cursor++]??={current:value};},useState(value){const i=cursor++;slots[i]??={value:typeof value==='function'?value():value};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},useCallback:fn=>fn,useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){slots[i]={deps};effects.push(fn);}}};
 const button={getClientRects:()=>[{}],focus:()=>calls.push('focus')};
 const {MobileContextProvider,MobileContextButton}=compile('../src/presentation/mobile/MobileContextActions.tsx',{
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
 tree=render();tree.props.value.open();tree=render();
 nodes(tree).find(n=>n.type==='sheet').props.onClose();
 assert.equal(nodes(render()).some(n=>n.type==='sheet'),false,'Ordinary Actions dismissal releases provider state before returning');
 assert.equal(calls.at(-1),'focus','The contextual opener regains focus without an animation wait');
 let object=contextActions('profile',{signedIn:true},{handlers:{saveCreator:()=>calls.push('save-creator')},labels:{saveCreator:'Save creator'}});
 const source=()=>object; tree=render();tree.props.value.open(source);tree=render();
 object=contextActions('profile',{signedIn:true},{handlers:{saveCreator:()=>calls.push('save-creator')},labels:{saveCreator:'Unsave creator'}});
 tree.props.value.refresh(source);tree=render();assert.equal(nodes(tree).find(n=>n.type==='sheet').props.model.primary[0].label,'Unsave creator');
 tree=render();tree.props.value.open();account='another';tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
 location={pathname:'/studio',search:''};tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
 const retired=contextActions('project',{signedIn:true,owner:true},{handlers:{edit:()=>calls.push('obsolete-edit'),delete:()=>calls.push('obsolete-delete')}});
 tree.props.value.register('fallback',{route:'/studio',priority:0,model:object});
 tree.props.value.register('project',{route:'/studio',priority:20,model:retired,onOpen:()=>calls.push('project-popup')});
 tree=render();tree.props.value.open();tree=render();
 assert.equal(calls.at(-1),'project-popup');assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
 const beforeBlocked=calls.length;
 tree.props.value.open(retired);tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false,'Explicit obsolete project options cannot reopen the retired screen');
 assert.equal(calls.length,beforeBlocked,'A blocked obsolete request must not steal focus');
 tree.props.value.open(()=>retired);tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false,'An explicit project source is blocked too');
 tree.props.value.open(source);tree=render();const stale=nodes(tree).find(n=>n.type==='sheet');assert.ok(stale);
 object=retired;tree.props.value.refresh(source);tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false,'A live source that changes to a project model cannot revive the retired screen or fall through to another registration');
 stale.props.onAction(stale.props.model.primary[0]);assert.equal(calls.includes('save-creator'),false,'A stale button must re-resolve capabilities and do nothing');
 tree.props.value.open();tree=render();
 assert.equal(calls.at(-1),'project-popup');
 assert.equal(nodes(tree).some(n=>n.type==='sheet'),false,'Opening information clears the prior options sheet instead of hiding it underneath');
 tree.props.value.register('project',{route:'/studio',priority:20,model:retired});tree=render();
 assert.equal(nodes(tree).some(n=>n.type===MobileContextButton&&n.props.floating),false,'A retired project model without a direct details opener must not leave an empty floating trigger');
 tree.props.value.open();tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false,'An implicit obsolete project registration cannot expose its own or a lower-priority fallback sheet');

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

function contextPressHarness() {
 const slots=[],timers=new Map(),listeners=new Map(),calls=[];let cursor=0,effects=[],timerId=0,mobile=true;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const actions={open:source=>calls.push(['open',source]),refresh:source=>calls.push(['refresh',source])};
 const effect=(fn,deps)=>{const i=cursor++,prior=slots[i];if(!same(prior?.deps,deps)){slots[i]={deps};effects.push(()=>{prior?.cleanup?.();slots[i].cleanup=fn();});}};
 const react={...React,useContext:()=>actions,useRef:value=>slots[cursor++]??={current:value},useEffect:effect,useLayoutEffect:effect};
 const {useMobileContextPress}=compile('../src/presentation/mobile/MobileContextActions.tsx',{
  react,'../usePresentation':{usePresentation:()=>mobile?'mobile':'web'},
 },{window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}},Element:class{},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 return {timers,listeners,calls,setMobile:value=>{mobile=value;},
  render(model,useScreen=false,onOpen=()=>calls.push(['details'])){cursor=0;effects=[];const press=useMobileContextPress(model,useScreen,onOpen);for(const fn of effects)fn();return press;},
  expire(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},
  dispose(){for(const slot of slots)slot?.cleanup?.();},
 };
}

test('retired project holds are rejected before timers, scroll listeners or click consumption exist',()=>{
 for(const useScreen of [false,true])for(const owner of [false,true]){
  const h=contextPressHarness(),model=contextActions('project',{signedIn:true,owner},{handlers:{edit(){},share(){},delete(){}}});
  const press=h.render(model,useScreen);assert.deepEqual(Object.keys(press),[]);
  assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);h.expire();
  assert.equal(h.calls.some(call=>call[0]==='open'||call[0]==='details'),false);
  h.dispose();
 }
});

test('profile and current-page shared holds remain usable, while switching to a retired project cannot swallow a card tap',()=>{
 const h=contextPressHarness(),pointer={isPrimary:true,button:0,pointerId:1,clientX:100,clientY:100,target:{}};
 const profile=contextActions('profile',{signedIn:true},{handlers:{share(){}}});
 let press=h.render(profile);press.onPointerDownCapture(pointer);assert.equal(h.timers.size,1);h.expire();
 assert.equal(h.calls.filter(call=>call[0]==='open').length,1);
 const source=h.calls.find(call=>call[0]==='open')[1];assert.equal(source().kind,'profile');
 press=h.render(contextActions('project',{signedIn:true,owner:true},{handlers:{edit(){},delete(){}}}));
 assert.deepEqual(Object.keys(press),[]);assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
 assert.equal(press.onClickCapture,undefined,'The ordinary project tap keeps native activation instead of consuming a former hold');
 const shared=contextActions('shared',{signedIn:false},{handlers:{savePage(){},cite(){},comment(){}}});
 press=h.render(shared);press.onPointerDownCapture(pointer);h.expire();
 assert.equal(h.calls.filter(call=>call[0]==='open').length,2);
 assert.equal(h.calls.filter(call=>call[0]==='open').at(-1)[1]().kind,'shared');
 const click={detail:1,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
 press.onClickCapture(click);assert.equal(click.prevented,true,'An allowed hold still consumes only its own follow-up click');
 h.dispose();h.setMobile(false);press=h.render(profile);assert.deepEqual(Object.keys(press),[]);assert.equal(h.listeners.size,0);
});

test('shared project and collaboration actions emit official links while retaining public state', async () => {
 for(const pathname of ['/share/creator/c/portal/work','/share/creator/collaboration']){
  const sent=[],copied=[],native=[];
  const location={pathname,search:'?media=file&page=7&view=page&via=friend',hash:'#references'};
  const {SharedContextActions}=compile('../src/presentation/mobile/SharedContextActions.tsx',{
   '../../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalinknetworks.com'},
   '../../features/sharing/InternalContentShare':{useInternalContentShare:()=>target=>sent.push(target)},
   'react-router-dom':{useLocation:()=>location,useNavigate:()=>()=>{}},
   '../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:true})},
   '../../features/auth/registration':{readSharedReturnPath:value=>value},
   '../../utils/copyPublicLink':{copyPublicLink:async url=>copied.push(url)},
   './MobileContextActions':{MobileScreenActions:'actions'},'./contextActions':{contextActions},
  },{URL,navigator:{share:async value=>native.push(value)},window:{location:{origin:'https://old-preview.test'}},DOMException});
  const model=SharedContextActions({title:'Work'}).props.model;
  const actions=[...model.primary,...model.groups.flat()];
  const expected='https://portalinknetworks.com'+pathname+location.search+location.hash;
  await actions.find(action=>action.id==='share').run();await actions.find(action=>action.id==='copy').run();
  assert.equal(pathname.includes('/c/')?sent[0].url:native[0].url,expected);
  assert.deepEqual(copied,[expected]);
 }
});

test('profile hold shares and copies its official public portfolio URL', async () => {
 const copied=[],shared=[];
 let model;
 const {MobileProfileContext}=compile('../src/presentation/mobile/MobileProfileContext.tsx',{
  react:React,'../../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalinknetworks.com'},
  'react-router-dom':{useLocation:()=>({pathname:'/share/creator',search:''}),useNavigate:()=>()=>{}},
  '../../app/routes':{buildPath:(_name,{profileId})=>'/share/'+profileId},
  '../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:false})},
  '../../utils/copyPublicLink':{copyPublicLink:async url=>copied.push(url)},
  './SharedContextActions':{shareContextLink:async url=>shared.push(url)},
  './contextActions':{contextActions},'./MobileContextActions':{useMobileContextPress:value=>{model=value;return{};}},
 },{URL,window:{location:{origin:'https://old-preview.test'}}});
 MobileProfileContext({profileId:'creator',name:'Creator',children:React.createElement('div')});
 const actions=[...model.primary,...model.groups.flat()];
 await actions.find(action=>action.id==='share').run();await actions.find(action=>action.id==='copy').run();
 assert.deepEqual(shared,['https://portalinknetworks.com/share/creator']);
 assert.deepEqual(copied,shared);
});

test('workbench has Drafts and Bookmarks; Select is only supplied by collection lists',()=>{const handlers={newProject(){},drafts(){},bookmarks(){},reads(){}};assert.deepEqual(Array.from(ids(contextActions('studio',{signedIn:true,owner:true},{handlers}))),['drafts','bookmarks']);assert.deepEqual(Array.from(ids(contextActions('studio',{signedIn:true,owner:true},{handlers:{...handlers,select(){}}}))),['drafts','bookmarks','select']);});

 test('Journey pair action uses the owner profile menu and remains unavailable to visitors', () => {
 const calls=[];
 const target={handlers:{thenNow:()=>calls.push('picker')},labels:{thenNow:'Choose a Then/Now pair'}};
 const owner=contextActions('profile',{signedIn:true,owner:true},target);
 const action=owner.groups.flat().find(item=>item.id==='thenNow');
 assert.equal(action.label,'Choose a Then/Now pair'); action.run();
 assert.deepEqual(calls,['picker']);
 assert.equal(ids(contextActions('profile',{signedIn:true,owner:false},target)).length,0);
 assert.equal(ids(contextActions('profile',{signedIn:true,owner:true},{handlers:{}})).length,0);
 });

 test('action sheets keep one safe panel height and reserve the visible collapsed body without layout animation', () => {
 const source = readFileSync(new URL('../src/components/messages/MobileActionSheet.tsx', import.meta.url), 'utf8');
 const css = readFileSync(new URL('../src/presentation/mobile/mobile.css', import.meta.url), 'utf8');
 assert.match(css, /mobile-context-scrim \{[^}]*top: auto; bottom: 0; padding: 0;/);
 assert.match(css, /mobile-context-sheet \{\s*position: absolute; bottom: 0; margin-block: 0;/);
 const rules=css.match(/#root \.codex-shell \[data-presentation='mobile'\] \.mobile-context-sheet[^}]+}/g).join('\n');
 assert.match(rules,/height: calc\(100% - max\(16px, var\(--safe-area-top\)\)\)/);
 assert.match(rules,/padding-bottom: calc\(max\(16px, var\(--safe-area-bottom\)\) \+ var\(--sheet-rest-y\)\)/);
 assert.match(rules,/\[data-expanded='true'\] \{ --sheet-rest-y: 0px;/);
 assert.match(rules,/\[data-sheet-dragging\] \{ padding-bottom: max\(16px, var\(--safe-area-bottom\)\);/);
 assert.doesNotMatch(rules,/transition[^;]*(?:height|padding)|height: 75%/);
 assert.doesNotMatch(source,/dragHeight|style\.height|height:drag/);
 });

test('Delete chat is a destructive signed-in conversation action', () => {
 const model = contextActions('conversation', {signedIn:true}, {handlers:{deleteChat:()=>{}}});
 const action = model.groups.flat().find(a => a.id === 'deleteChat');
 assert.equal(action.label, 'Delete chat');
 assert.equal(action.destructive, true);
 assert.equal(ids(contextActions('conversation', {signedIn:false}, {handlers:{deleteChat:()=>{}}})).includes('deleteChat'), false);
});


test('retained profile actions do not render a second ellipsis over the active screen', () => {
  let active = true;
  const actions = compile('../src/presentation/mobile/MobileContextActions.tsx', {
    react: { ...React, useContext: () => null },
    './MobileBackNavigation': { useMobileScreenActive: () => active },
  });
  assert.notEqual(actions.MobileContextButton({}), null);
  active = false;
  assert.equal(actions.MobileContextButton({}), null);
  assert.equal(actions.MobileContextButton({ floating: true }), null);
  active = true;
  assert.notEqual(actions.MobileContextButton({}), null);
});

test('App suppresses fallback actions only for ordinary mobile other-creator profiles and keeps shared, owner, reader and WEB branches', () => {
  const source = ts.createSourceFile('App.tsx', read('../src/App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fallback;
  function visit(node) {
    if (ts.isConditionalExpression(node) && node.whenTrue.kind === ts.SyntaxKind.NullKeyword
      && ts.isJsxSelfClosingElement(node.whenFalse) && node.whenFalse.tagName.getText(source) === 'MobileScreenActions') fallback = node;
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(fallback, 'The application retains its explicit fallback selection');
  const authenticated = fallback.parent;
  assert.ok(ts.isConditionalExpression(authenticated) && authenticated.whenFalse === fallback);
  assert.equal(authenticated.whenTrue.kind, ts.SyntaxKind.NullKeyword, 'Signed-out ordinary routes have no authenticated fallback actions');
  const shared = authenticated.parent;
  assert.ok(ts.isConditionalExpression(shared) && shared.whenFalse === authenticated);
  assert.ok(ts.isJsxSelfClosingElement(shared.whenTrue));
  assert.equal(shared.whenTrue.tagName.getText(source), 'SharedContextActions', 'Public shared actions take precedence over the ordinary screen gate');
  const base = { isSharedRoute: false, auth: { isAuthenticated: true }, presentation: 'mobile', route: { kind: 'profile' }, isOwnerMode: false,
    isSearchOpen: false, isMessagesOpen: false, isMobileStudioOpen: false, activeProjectId: null };
  const branch = changes => {
    const context = { ...base, ...changes };
    if (vm.runInNewContext(shared.condition.getText(source), context)) return 'shared';
    if (vm.runInNewContext(authenticated.condition.getText(source), context)) return null;
    return vm.runInNewContext(fallback.condition.getText(source), context) ? null : 'ordinary';
  };
  assert.equal(branch({}), null);
  for (const changes of [
    { isOwnerMode: true }, { presentation: 'web' },
    { route: { kind: 'category' } }, { route: { kind: 'category' }, activeProjectId: 'project' },
    { route: { kind: 'studio' }, isMobileStudioOpen: true },
    { route: { kind: 'search' }, isSearchOpen: true }, { route: { kind: 'messages' }, isMessagesOpen: true },
    { route: { kind: 'portalink', locationId: 'city' } }, { route: { kind: 'home' }, activeProjectId: 'project' },
  ]) assert.equal(branch(changes), 'ordinary', JSON.stringify(changes));
  for (const changes of [{ route: { kind: 'home' } }, { route: { kind: 'portalink', locationId: null } }]) assert.equal(branch(changes), null);
  for (const changes of [{}, { isOwnerMode: true }, { presentation: 'web' }, { route: { kind: 'sharedProfile' } }, { route: { kind: 'category' }, activeProjectId: 'project' }]) {
    assert.equal(branch({ ...changes, isSharedRoute: true }), 'shared', JSON.stringify(changes));
    assert.equal(branch({ ...changes, isSharedRoute: true, auth: { isAuthenticated: false } }), 'shared');
  }
  for (const route of [{ kind: 'profile' }, { kind: 'studio' }, { kind: 'settings' }])
    assert.equal(branch({ route, auth: { isAuthenticated: false }, presentation: 'web' }), null);
});

test('individual page Cite remains available for owners as well as visitors',()=>{
 for(const owner of [true,false]) {
  let opened=0;const cite=()=>opened++;
  const model=contextActions('project',{signedIn:true,owner},{handlers:{cite}});
  const action=[...model.primary,...model.groups.flat()].find(item=>item.id==='cite');
  assert.ok(action);action.run();assert.equal(opened,1);
 }
});
