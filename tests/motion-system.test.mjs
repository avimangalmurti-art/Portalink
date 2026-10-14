import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const cssFiles=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?cssFiles(dir+'/'+e.name):e.name.endsWith('.css')?[dir+'/'+e.name]:[]);
test('all authored stylesheet durations come from the one three-token motion scale',()=>{
 const files=cssFiles('src'),definitions=[];
 for(const file of files){const css=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const values=[...css.matchAll(/(?<![\w-])(?:\d*\.\d+|\d+)(?:ms|s)\b/g)].map(m=>m[0]);
  if(file.endsWith('/motion/motion.css'))assert.deepEqual(values,['120ms','180ms','260ms']);else assert.deepEqual(values,[],file);
  definitions.push(...[...css.matchAll(/--m-(fast|base|slow)\s*:/g)].map(m=>m[1]));
 }
 assert.deepEqual(definitions.sort(),['base','fast','slow']);
 const motion=readFileSync('src/presentation/motion/motion.css','utf8');
 assert.match(motion,/--m-enter:cubic-bezier\(\.2,\.8,\.2,1\)/);assert.match(motion,/--m-exit:cubic-bezier\(\.4,0,1,1\)/);
});
function runtime(reduce=false){
 let updates=0,native=0,finish,cleared=0;const root={dataset:{}},window={matchMedia:()=>({matches:reduce})};
 const document={documentElement:root,querySelector:()=>null,startViewTransition(update){native++;void update();return {finished:new Promise(resolve=>{finish=resolve;}),skipTransition(){}};}};
 const imports={'react-dom':{flushSync:fn=>fn()},'../../utils/projectContinuity':{beginProjectContinuity(){},isProjectContinuityActive:()=>false,markProjectContinuityDestination(){},finishProjectContinuity(){cleared++;}}};
 const api=sourceModule('src/presentation/motion/motion.ts',imports,{document,window,getComputedStyle:()=>({getPropertyValue:name=>({'--m-fast':'120ms','--m-base':'180ms','--m-slow':'260ms','--m-enter':'cubic-bezier(.2,.8,.2,1)','--m-exit':'cubic-bezier(.4,0,1,1)'}[name]||'')})});
 return {api,root,document,window,get updates(){return updates},get native(){return native},get cleared(){return cleared},update:()=>{updates++},finish:async()=>{finish?.();await Promise.resolve();}};
}
test('dock and push invoke the native API once, commit synchronously and finish their marks',async()=>{
 for(const mode of ['dock','push','back','tabs']){const r=runtime();r.api.motionUpdate(r.update,mode);assert.equal(r.native,1);assert.equal(r.updates,1);assert.equal(r.root.dataset.motionNavigation,mode);await r.finish();assert.equal(r.root.dataset.motionUpdating,undefined);}
});
test('nested tab routing cannot start a second transition',()=>{const r=runtime();r.api.motionUpdate(()=>r.api.motionUpdate(r.update,'tabs'),'tabs');assert.equal(r.native,1);assert.equal(r.updates,1);});
test('reduced motion performs the navigation with no native animation or duration',()=>{const r=runtime(true);r.api.motionUpdate(r.update,'push');assert.equal(r.native,0);assert.equal(r.updates,1);assert.equal(r.api.motionMs('slow'),0);});
test('reader skeleton reserves the reader frame without any spinner',()=>{
 const {LoadingSkeleton}=sourceModule('src/components/ui/StateViews.tsx',{react:React,'lucide-react':{},'./Button':{},'./InterfaceIcon':{},'../../utils/projectContinuity':{projectContinuityStyle:()=>({viewTransitionName:'portalink-project'})}});
 const tree=LoadingSkeleton({kind:'reader',projectId:'work',label:'Opening'});assert.equal(tree.props['data-reader-frame'],'');assert.equal(tree.props['data-premium-project-viewer'],'');assert.equal(tree.props.role,'status');
 const text=readFileSync('src/components/media/AttachmentRenderer.tsx','utf8');assert.match(text,/LoadingSkeleton kind="reader"/);assert.doesNotMatch(text,/LoadingState/);
});

test('deferred dock handlers retain dock motion and other links use push motion',()=>{
 let click;const modes=[],timers=[];
 const context={navigator:{createHref:to=>typeof to==='string'?to:to.pathname,push(){},replace(){},go(){}}};
 class ElementStub{closest(selector){return selector==='.mobile-navigation-dock'?this:null;}}
 const react={...React,useContext:()=>context,useLayoutEffect:fn=>fn(),useMemo:fn=>fn(),useRef:value=>({current:value})};
 const {MotionNavigation}=sourceModule('src/presentation/motion/MotionNavigation.tsx',{
  react,'react-dom':{flushSync:fn=>fn()},'framer-motion':{MotionConfig:'motion-config',useReducedMotion:()=>false},'react-router-dom':{UNSAFE_NavigationContext:{Provider:'provider'},useLocation:()=>({pathname:'/studio'})},
  './ImageMotion':{ImageMotion:'images'},'../../features/sharing/shareModel':{handleFromPath:()=>null},'./motion':{motionMs:()=>120,motionSeconds:()=>.18,motionCurve:()=>[.2,.8,.2,1],motionUpdate:(fn,mode)=>{modes.push(mode);fn();}},
 },{Element:ElementStub,URL,document:{addEventListener(_event,fn){click=fn},removeEventListener(){}},window:{location:{href:'https://example.test/studio'},setTimeout:fn=>timers.push(fn)}});
 const wrapper=MotionNavigation({children:'screen'}),tree=wrapper.type(wrapper.props),navigator=tree.props.value.navigator;
 click({target:new ElementStub()});navigator.push('/messages');assert.deepEqual(modes,['dock']);
 timers.forEach(fn=>fn());navigator.push('/p/creator');assert.deepEqual(modes,['dock','push']);
});

function profileNavigation(initial='/p/creator'){
 const url=new URL(initial,'https://example.test'),location={pathname:url.pathname,search:url.search,hash:url.hash};
 const calls=[],modes=[],notifications=[],listeners=new Map(),timers=new Map();let timer=0;
 const window={location:{href:url.href},setTimeout:(fn)=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 const href=to=>typeof to==='string'?to:`${to.pathname??location.pathname}${to.search??''}${to.hash??''}`;
 const commit=(kind,...args)=>{calls.push([kind,...args]);const next=new URL(href(args[0]),window.location.href);Object.assign(location,{pathname:next.pathname,search:next.search,hash:next.hash});window.location.href=next.href;};
 const context={navigator:{createHref:href,push:(...args)=>commit('push',...args),replace:(...args)=>commit('replace',...args),go:delta=>calls.push(['go',delta])}};
 const react={...React,useContext:()=>context,useLayoutEffect:fn=>fn(),useMemo:fn=>fn(),useRef:value=>({current:value})};
 const {MotionNavigation}=sourceModule('src/presentation/motion/MotionNavigation.tsx',{
  react,'react-dom':{flushSync:fn=>fn()},'framer-motion':{MotionConfig:'motion-config',useReducedMotion:()=>false},'react-router-dom':{UNSAFE_NavigationContext:{Provider:'provider'},useLocation:()=>location},
  './ImageMotion':{ImageMotion:'images'},'../../features/sharing/shareModel':sourceModule('src/features/sharing/shareModel.ts'),
  './motion':{motionMs:()=>120,motionSeconds:()=>.18,motionCurve:()=>[.2,.8,.2,1],motionUpdate:(fn,mode)=>{modes.push(mode);return fn();}},
 },{URL,URLSearchParams,Event:class{constructor(type){this.type=type;}},document:{documentElement:{dataset:{}},addEventListener(){return;},removeEventListener(){return;},dispatchEvent:event=>notifications.push(event.type)},window});
 const wrapper=MotionNavigation({children:'profile'}),tree=wrapper.type(wrapper.props);
 return {navigator:tree.props.value.navigator,calls,modes,notifications,location,pop:()=>listeners.get('popstate')?.()};
}

test('profile count views swap immediately for push and replace, including returning to default Projects',()=>{
 for(const path of ['/p/creator','/share/creator','/avima.work'])for(const action of ['push','replace']){
  const h=profileNavigation(path);
  for(const search of ['?view=followers','?view=following','?view=portals','?view=projects',''])h.navigator[action](path+search);
  assert.deepEqual(h.modes,[],`${action} ${path} must not start a native or fallback navigation animation`);
  assert.deepEqual(h.calls.map(call=>call[0]),Array(5).fill(action));
  assert.deepEqual(h.notifications,Array(5).fill('portalink-before-navigation'));
  assert.equal(h.location.search,'');
 }
});

test('an immediate profile view change preserves router arguments, URL data and fragment',()=>{
 const h=profileNavigation('/p/creator?view=portals&fromConnections=owner#profile');
 const destination={pathname:'/p/creator',search:'?view=followers&fromConnections=owner&connectionList=following',hash:'#profile'};
 const state={profileFromDock:true},options={viewTransition:false};
 h.navigator.push(destination,state,options);
 assert.deepEqual(h.modes,[]);assert.equal(h.calls[0][1],destination);assert.equal(h.calls[0][2],state);assert.equal(h.calls[0][3],options);
 assert.equal(h.location.search,destination.search);assert.equal(h.location.hash,destination.hash);
});

test('real destinations and unrelated profile query changes retain their existing motion',()=>{
 for(const [from,to] of [
  ['/p/creator?view=followers','/p/other?view=following'],
  ['/p/creator?view=followers','/p/creator/c/portal'],
  ['/p/creator?view=followers','/p/creator?view=following#new-fragment'],
  ['/p/creator?view=followers','/p/creator?view=followers&sort=name'],
  ['/p/creator?view=unknown','/p/creator?view=following'],
  ['/p/creator?view=followers','/p/creator?view=following&view=portals'],
  ['/settings?view=followers','/settings?view=following'],
  ['/p/creator?view=followers','https://different.test/p/creator?view=following'],
 ]){
  const h=profileNavigation(from);h.navigator.push(to);assert.deepEqual(h.modes,['push'],`${from} -> ${to}`);
 }
 const tabs=profileNavigation('/p/creator?collection=one');tabs.navigator.replace('/p/creator?collection=two');assert.deepEqual(tabs.modes,['tabs']);
});

test('profile controls preserve directional back and forward history navigation',async()=>{
 const h=profileNavigation('/p/creator?view=followers');
 const back=h.navigator.go(-1);h.pop();await back;
 const forward=h.navigator.go(1);h.pop();await forward;
 assert.deepEqual(h.modes,['back','push']);assert.deepEqual(h.calls,[['go',-1],['go',1]]);
});

test('images reserve their existing geometry, reveal after load and release removed listeners',()=>{
 for(const reduce of [false,true]){
  let observer,cleanup;const frames=[];
  class ElementStub{querySelectorAll(){return [];}matches(){return false;}querySelector(){return null;}}
  class ImageStub extends ElementStub{dataset={};naturalWidth=800;complete=false;width=80;height=80;listeners=new Map();addEventListener(name,fn){this.listeners.set(name,fn);}removeEventListener(name){this.listeners.delete(name);}}
  const image=new ImageStub(),root=new ElementStub();root.querySelectorAll=()=>[image];const document={documentElement:root};
  const {ImageMotion}=sourceModule('src/presentation/motion/ImageMotion.tsx',{
   react:{useLayoutEffect:fn=>{cleanup=fn();}},'./motion':{reducedMotion:()=>reduce},
  },{document,Element:ElementStub,HTMLImageElement:ImageStub,MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){}});
  ImageMotion();assert.equal(image.dataset.motionImage,'');assert.equal(image.dataset.motionImageReady,undefined);
  image.listeners.get('load')();if(!reduce)assert.equal(image.dataset.motionImageReady,undefined);frames.forEach(fn=>fn());
  assert.equal(image.dataset.motionImageReady,'');assert.equal(image.width,80);assert.equal(image.height,80);
  observer([{type:'childList',target:new ElementStub(),removedNodes:[image],addedNodes:[]}]);assert.equal(image.listeners.size,0);cleanup();
 }
});

test('unsupported native API paints the reader reservation before expensive route work',async()=>{
 const frames=[],attached=[];let updates=0;
 class ElementStub{dataset={};style={};setAttribute(){}append(){}remove(){attached.splice(attached.indexOf(this),1);}}
 const document={documentElement:{dataset:{}},createElement:()=>new ElementStub(),querySelector:selector=>selector==='.codex-shell'?{append:node=>attached.push(node)}:null};
 const api=sourceModule('src/presentation/motion/motion.ts',{'react-dom':{flushSync:fn=>fn()},'../../utils/projectContinuity':{isProjectContinuityActive:()=>true,markProjectContinuityDestination(){},finishProjectContinuity(){}}},
 {document,window:{matchMedia:()=>({matches:false})},requestAnimationFrame:fn=>frames.push(fn),getComputedStyle:()=>({getPropertyValue:()=> '180ms'})});
 api.motionUpdate(()=>updates++,'push');assert.equal(attached[0].dataset.readerFrame,'');assert.equal(updates,0);
 frames.shift()();assert.equal(updates,0);frames.shift()();await Promise.resolve();assert.equal(updates,1);assert.equal(attached.length,0);
});

test('Cite dismisses a fast downward drag even before the move state renders',()=>{
 let closed=0;class ElementStub{closest(){return null;}}
 const react={...React,useEffect(){},useRef:value=>({current:value}),useState:value=>[value,()=>{}]};
 const {CiteSheet}=sourceModule('src/features/citations/CiteSheet.tsx',{
  react,'../../presentation/motion/useSheetMotion':{useSheetMotion:onClose=>({closing:false,close:onClose})},
  './publicOrigin':{PUBLIC_ORIGIN:'https://example.test'},'../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:true,viewerProfileId:'owner'})},
  '../../components/ui/ModalPortal':{ModalPortal:'portal'},'../../services/supabase/client':{},'./model':{},'./service':{},'./citations.css':{},'../../hooks/useModalFocus':{useModalFocus(){}},
 },{Element:ElementStub});
 const tree=CiteSheet({item:{creatorId:'owner'},onClose:()=>closed++});
 const header=React.Children.toArray(React.Children.toArray(tree.props.children)[0].props.children)[0].props.children[0];
 const currentTarget={setPointerCapture(){}};
 header.props.onPointerDown({isPrimary:true,target:new ElementStub(),clientY:100,pointerId:1,currentTarget});
 header.props.onPointerMove({clientY:200});header.props.onPointerUp({clientY:200});assert.equal(closed,1);
});

test('standalone citation previews get motion defaults without requiring a router',()=>{
 let locationReads=0;
 const {MotionNavigation}=sourceModule('src/presentation/motion/MotionNavigation.tsx',{
  react:{...React,useContext:()=>null},'react-dom':{},'react-router-dom':{UNSAFE_NavigationContext:{},useLocation:()=>{locationReads++;throw Error('No router');}},
  'framer-motion':{MotionConfig:'motion-config',useReducedMotion:()=>false},'./ImageMotion':{ImageMotion:'images'},
  './motion':{motionSeconds:()=>.18,motionCurve:()=>[.2,.8,.2,1]},'../../features/sharing/shareModel':{handleFromPath:()=>null},
 });
 const wrapper=MotionNavigation({children:'PDF preview'}),tree=wrapper.type(wrapper.props);
 assert.equal(locationReads,0);assert.equal(tree.type,'motion-config');assert.equal(tree.props.transition.duration,.18);
 assert.equal(tree.props.children[1],'PDF preview');
});

test('a new tap supersedes an in-flight transition without losing either navigation',async()=>{
 const r=runtime(),resolvers=[];let skipped=0;
 r.document.startViewTransition=update=>{void update();return {finished:new Promise(resolve=>resolvers.push(resolve)),skipTransition(){skipped++;}};};
 r.api.motionUpdate(r.update,'dock');r.api.motionUpdate(r.update,'push');assert.equal(r.updates,2);assert.equal(skipped,1);
 resolvers[0]();await Promise.resolve();assert.equal(r.root.dataset.motionNavigation,'push');
 resolvers[1]();await Promise.resolve();assert.equal(r.root.dataset.motionNavigation,undefined);
});

test('loading completion does not add a second shell fade during native navigation',()=>{
 let observe,cleanup;const attrs=new Map();
 class ElementStub{dataset={};querySelectorAll(){return [];}querySelector(){return null;}matches(){return false;}setAttribute(key,value){attrs.set(key,value);}}
 class ImageStub extends ElementStub{}
 const root=new ElementStub();root.dataset.motionUpdating='true';const skeleton=new ElementStub();skeleton.matches=()=>true;
 const {ImageMotion}=sourceModule('src/presentation/motion/ImageMotion.tsx',{react:{useLayoutEffect:fn=>{cleanup=fn();}},'./motion':{reducedMotion:()=>false}},
 {document:{documentElement:root},Element:ElementStub,HTMLImageElement:ImageStub,MutationObserver:class{constructor(fn){observe=fn;}observe(){}disconnect(){}},requestAnimationFrame(){},cancelAnimationFrame(){}});
 ImageMotion();observe([{type:'childList',target:root,removedNodes:[skeleton],addedNodes:[]}]);assert.equal(attrs.size,0);
 delete root.dataset.motionUpdating;observe([{type:'childList',target:root,removedNodes:[skeleton],addedNodes:[]}]);assert.equal(attrs.get('data-motion-content-ready'),'');cleanup();
});

test('standalone image previews reserve decoded dimensions and tolerate failed or older decoders',async()=>{
 for(const mode of ['decode','load','failure']){
  let requested;
  class ImageStub{
   naturalWidth=0;naturalHeight=0;
   constructor(){if(mode==='load')this.decode=undefined;}
   set src(value){requested=value;if(mode==='load'){this.naturalWidth=800;this.naturalHeight=600;this.onload();}}
   async decode(){if(mode==='failure')throw Error('Image unavailable');this.naturalWidth=800;this.naturalHeight=600;}
  }
  const {imageDimensions}=sourceModule('src/presentation/motion/imageDimensions.ts',{}, {Image:ImageStub});
  const size=await imageDimensions('/photo');assert.equal(requested,'/photo');
  assert.deepEqual(size===null?null:{...size},mode==='failure'?null:{width:800,height:600});
 }
});

test('loaded image paint waits for snapshot travel and failed images retain their existing fallback',()=>{
 let done,cleanup;const frames=[];
 class ElementStub{dataset={};querySelectorAll(){return [];}matches(){return false;}querySelector(){return null;}}
 class ImageStub extends ElementStub{naturalWidth=800;complete=true;handlers=new Map();addEventListener(name,fn){this.handlers.set(name,fn);}removeEventListener(name){this.handlers.delete(name);}}
 const image=new ImageStub(),root=new ElementStub();root.dataset.motionUpdating='true';root.querySelectorAll=()=>[image];
 const {ImageMotion}=sourceModule('src/presentation/motion/ImageMotion.tsx',{react:{useLayoutEffect:fn=>{cleanup=fn();}},'./motion':{reducedMotion:()=>false}},
 {document:{documentElement:root,addEventListener(name,fn){assert.equal(name,'portalink-motion-finished');done=fn;},removeEventListener(){}},Element:ElementStub,HTMLImageElement:ImageStub,MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.push(fn);return 1;},cancelAnimationFrame(){}});
 ImageMotion();assert.equal(image.dataset.motionImageReady,undefined);assert.equal(frames.length,0);
 delete root.dataset.motionUpdating;done();frames.forEach(fn=>fn());assert.equal(image.dataset.motionImageReady,'');
 delete image.dataset.motionImageReady;image.naturalWidth=0;image.handlers.get('error')();assert.equal(image.dataset.motionImageReady,'');cleanup();assert.equal(image.handlers.size,0);
});

test('an aborted native snapshot releases the screen and consumes its ready rejection',async()=>{
 const r=runtime();let skipped=0;
 r.document.startViewTransition=update=>{void update();return {ready:Promise.reject(Error('Snapshot unavailable')),updateCallbackDone:Promise.resolve(),finished:new Promise(()=>{}),skipTransition(){skipped++;}};};
 r.api.motionUpdate(r.update,'dock');await Promise.resolve();await Promise.resolve();
 assert.equal(r.updates,1);assert.equal(skipped,1);assert.equal(r.root.dataset.motionUpdating,undefined);
});
test('async history work cannot hold a native update beyond the slow motion token',async()=>{
 const r=runtime();let done,duration,committed;
 r.window.setTimeout=(fn,ms)=>{done=fn;duration=ms;return 1;};r.window.clearTimeout=()=>{};
 r.document.startViewTransition=update=>{committed=update();return {finished:new Promise(()=>{}),skipTransition(){}};};
 r.api.motionUpdate(()=>new Promise(()=>{}),'back');assert.equal(duration,260);done();await committed;
});
test('all browser router entries let the motion adapter commit synchronously',()=>{
 for(const file of ['src/index.tsx','src/visitor/index.tsx','src/citation/CitationInteraction.tsx'])assert.match(readFileSync(file,'utf8'),/<BrowserRouter useTransitions=\{false\}>/);
});

test('a pull dismissal commits history without a second native or fallback entrance',()=>{const r=runtime();r.root.dataset.mobilePullDismiss='committing';r.api.motionUpdate(r.update,'back');assert.equal(r.updates,1);assert.equal(r.native,0);assert.equal(r.root.dataset.motionNavigation,undefined);assert.equal(r.root.dataset.mobilePullDismiss,'committing');});

test('a direct gesture interrupts unfinished navigation instead of competing with its snapshot',()=>{const r=runtime();r.api.motionUpdate(r.update,'push');r.api.interruptNavigationMotion();assert.equal(r.root.dataset.motionUpdating,undefined);assert.equal(r.root.dataset.motionNavigation,undefined);assert.equal(r.native,1);});
