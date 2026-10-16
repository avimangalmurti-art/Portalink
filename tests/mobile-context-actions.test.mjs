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
const all = ['viewAsVisitor','projectInfo','deleteChat','newProject','search','explore','refresh','settings','editProfile','share','reorder','insights','copy','follow','message','saveCreator','report','saveProject','savePage','comment','pageIndex','edit','cover','visibility','delete','select','drafts','bookmarks','list','categories','newMessage','blocked','viewProfile','mute','block','yourWorld','myCity','reset','signIn','createAccount','react','editMessage','unsend','leaveLive'];
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
 assert.deepEqual(Array.from(ids(contextActions('profile',{signedIn:true,owner:true},{handlers}))),['newProject','editProfile','share','viewAsVisitor','reorder','insights','bookmarks','copy','settings']);
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

function sheetHarness({viewportHeight=800,safeTop=16,entranceOffset=0}={}) {
 const slots=[], calls=[], motions=[], measurements={viewport:0,panel:0}; let cursor=0, escape, tree;
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
 const react={...React,useId:()=> 'title',useRef(initial){return slots[cursor++]??={current:initial};},useState(initial){
  const index=cursor++; if(!(index in slots))slots[index]=initial;
  return [slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];
 }};
 const {MobileActionSheet}=compile('../src/components/messages/MobileActionSheet.tsx',{
  react,
  '../../presentation/motion/useSheetMotion':{useSheetMotion:onClose=>({closing:false,close(after,scope){motions.push({immediate:typeof after==='function',scope});if(after)after();else onClose();}})},
  '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:viewport})},
  '../../hooks/useModalFocus':{useModalFocus:(open,_ref,onClose,preventScroll)=>{assert.equal(open,true);assert.equal(preventScroll,true);escape=onClose;}},
 },{Element:ElementStub});
 const model=contextActions('home',{signedIn:true},{handlers:{explore:()=>calls.push('explore'),newProject:()=>calls.push('new')}});
 const render=()=>{
  cursor=0;tree=MobileActionSheet({model,onClose:()=>calls.push('close'),onAction:action=>action.run()});
  nodes(tree).find(node=>node.props.role==='dialog').ref.current=dialog;
  return tree;
 };
 const find=predicate=>nodes(render()).find(predicate);
 const pointer=(name,overrides={})=>find(node=>node.type==='header').props[name]({
  isPrimary:true,button:0,pointerId:1,clientX:100,clientY:600,target:header,currentTarget:header,...overrides,
 });
 const resizeButton=()=>find(node=>node.props.className==='mobile-context-resize');
 return {render,find,calls,motions,viewport,measurements,escape:()=>escape(),pointer,header,resize,close,resizeButton,
  dialog:()=>find(node=>node.props.role==='dialog'),
  clickResize:(detail=1)=>resizeButton().props.onClick({detail}),
 };
}

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
 tree=render();tree.props.value.open();tree=render();
 nodes(tree).find(n=>n.type==='sheet').props.onClose();
 assert.equal(nodes(render()).some(n=>n.type==='sheet'),false,'Ordinary Actions dismissal releases provider state before returning');
 assert.equal(calls.at(-1),'focus','The contextual opener regains focus without an animation wait');
 let object=contextActions('project',{signedIn:true},{handlers:{saveProject:()=>{}},labels:{saveProject:'Save project'}});
 const source=()=>object; tree=render();tree.props.value.open(source);tree=render();
 object=contextActions('project',{signedIn:true},{handlers:{saveProject:()=>{}},labels:{saveProject:'Unsave project'}});
 tree.props.value.refresh(source);tree=render();assert.equal(nodes(tree).find(n=>n.type==='sheet').props.model.primary[0].label,'Unsave project');
 tree=render();tree.props.value.open();account='another';tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
 location={pathname:'/studio',search:''};tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
 tree.props.value.register('project',{route:'/studio',priority:20,model:object,onOpen:()=>calls.push('project-popup')});
 tree=render();tree.props.value.open();tree=render();
 assert.equal(calls.at(-1),'project-popup');assert.equal(nodes(tree).some(n=>n.type==='sheet'),false);
 tree.props.value.open(object);tree=render();assert.equal(nodes(tree).some(n=>n.type==='sheet'),true,'Explicit project options remain available');
 tree.props.value.open();tree=render();
 assert.equal(calls.at(-1),'project-popup');
 assert.equal(nodes(tree).some(n=>n.type==='sheet'),false,'Opening information clears the prior options sheet instead of hiding it underneath');

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
  '../../features/sharing/InternalContentShare':{useInternalContentShare:()=>()=>{}},
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
 assert.match(source, /style=\{\{bottom:0,height:/);
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

test('individual page Cite remains available for owners as well as visitors',()=>{
 for(const owner of [true,false]) {
  let opened=0;const cite=()=>opened++;
  const model=contextActions('project',{signedIn:true,owner},{handlers:{cite}});
  const action=[...model.primary,...model.groups.flat()].find(item=>item.id==='cite');
  assert.ok(action);action.run();assert.equal(opened,1);
 }
});
