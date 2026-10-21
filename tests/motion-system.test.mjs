import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import React from 'react';
import postcss from 'postcss';
import {sourceModule} from './helpers/source-module.mjs';
const cssFiles=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?cssFiles(dir+'/'+e.name):e.name.endsWith('.css')?[dir+'/'+e.name]:[]);
test('finite stylesheet motion is capped at260ms and every authored opacity fade at180ms',()=>{
 const sheets=cssFiles('src').map(file=>({file,root:postcss.parse(readFileSync(file,'utf8'))}));
 const keyframes=new Map(),tokens={fast:120,base:180,slow:260};
 for(const {root} of sheets)root.walkAtRules(/keyframes$/,rule=>{let opacity=false;rule.walkDecls('opacity',()=>{opacity=true;});keyframes.set(rule.params,{opacity});});
 const milliseconds=value=>{const token=/var\(--m-(fast|base|slow)\)/.exec(value);assert.ok(token,`Unrecognized motion duration: ${value}`);return tokens[token[1]];};
 for(const {file,root} of sheets)root.walkRules(rule=>{
  const declarations=rule.nodes.filter(node=>node.type==='decl'),lookup=property=>declarations.findLast(node=>node.prop===property)?.value;
  for(const declaration of declarations.filter(node=>node.prop==='animation'))for(const value of postcss.list.comma(declaration.value)){
   if(value==='none'||/\binfinite\b/.test(value))continue;
   const name=[...keyframes.keys()].find(name=>new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(value));
   assert.ok(name,`${file}: ${value}`);const duration=milliseconds(value);
   assert.ok(duration<=260,`${file}: ${name} exceeds screen motion cap`);
   if(keyframes.get(name).opacity)assert.ok(duration<=180,`${file}: ${name} exceeds fade cap`);
  }
  const names=lookup('animation-name'),duration=lookup('animation-duration');
  if(names&&names!=='none'&&duration&&lookup('animation-iteration-count')!=='infinite')for(const name of postcss.list.comma(names)){
   if(keyframes.get(name)?.opacity)assert.ok(milliseconds(duration)<=180,`${file}: ${name} exceeds fade cap`);
  }
  for(const declaration of declarations.filter(node=>node.prop==='transition'))for(const value of postcss.list.comma(declaration.value)){
   if(value==='none')continue;
   if(/^opacity\b/.test(value))assert.ok(milliseconds(value)<=180,`${file}: ${value} exceeds fade cap`);
  }
 });
 const motion=sheets.find(({file})=>file.endsWith('/motion/motion.css')).root;
 for(const selector of ['::view-transition-old(*)','::view-transition-new(*)']){
  const rules=motion.nodes.filter(node=>node.type==='rule'&&node.selector===selector);
  const duration=rules.at(-1).nodes.findLast(node=>node.prop==='animation-duration').value;
  assert.equal(milliseconds(duration),180,`${selector} must not override named exit fades to260ms`);
 }
});
test('authored durations use shared transition tokens and the separate loading cycle',()=>{
 const files=cssFiles('src'),definitions=[];
 for(const file of files){const css=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const values=[...css.matchAll(/(?<![\w-])(?:\d*\.\d+|\d+)(?:ms|s)\b/g)].map(m=>m[0]);
  if(file.endsWith('/motion/motion.css'))assert.deepEqual(values,['120ms','180ms','260ms','600ms','1400ms']);else assert.deepEqual(values,[],file);
  definitions.push(...[...css.matchAll(/--m-(fast|base|slow)\s*:/g)].map(m=>m[1]));
 }
 assert.deepEqual(definitions.sort(),['base','fast','slow']);
 const motion=readFileSync('src/presentation/motion/motion.css','utf8');
 assert.match(motion,/--m-enter:cubic-bezier\(\.2,\.8,\.2,1\)/);assert.match(motion,/--m-exit:cubic-bezier\(\.4,0,1,1\)/);
});
function runtime(reduce=false){
 let updates=0,native=0,finish,cleared=0;const root={dataset:{}},window={matchMedia:()=>({matches:reduce})};
 const document={documentElement:root,querySelector:()=>null,startViewTransition(update){native++;void update();return {finished:new Promise(resolve=>{finish=resolve;}),skipTransition(){}};}};
 const imports={'react-dom':{flushSync:fn=>fn()},'../../utils/projectContinuity':{beginProjectContinuity(){},isMobileProjectContinuity:()=>false,isProjectContinuityActive:()=>false,markProjectContinuityDestination(){},finishProjectContinuity(){cleared++;}}};
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
  '../../features/publishing/mobileAuthoringHistory':{replaceMobileAuthoringDestination:()=>false},
  './navigationContext':{ImmediateNavigationContext:{Provider:'immediate-provider'}},
  react,'react-dom':{flushSync:fn=>fn()},'framer-motion':{MotionConfig:'motion-config',useReducedMotion:()=>false},'react-router-dom':{UNSAFE_NavigationContext:{Provider:'provider'},useLocation:()=>({pathname:'/studio'})},
  './ImageMotion':{ImageMotion:'images'},'../../features/sharing/shareModel':{handleFromPath:()=>null},'./motion':{motionMs:()=>120,motionSeconds:()=>.18,motionCurve:()=>[.2,.8,.2,1],motionUpdate:(fn,mode)=>{modes.push(mode);fn();}},
 },{Element:ElementStub,URL,document:{addEventListener(_event,fn){click=fn},removeEventListener(){}},window:{location:{href:'https://example.test/studio'},setTimeout:fn=>timers.push(fn)}});
 const wrapper=MotionNavigation({children:'screen'}),immediate=wrapper.type(wrapper.props),tree=immediate.props.children,navigator=tree.props.value.navigator;
 assert.equal(immediate.props.value,context.navigator);
 click({target:new ElementStub()});navigator.push('/messages');assert.deepEqual(modes,['dock']);
 timers.forEach(fn=>fn());navigator.push('/p/creator');assert.deepEqual(modes,['dock','push']);
});

function profileNavigation(initial='/p/creator',motion){
 const url=new URL(initial,'https://example.test'),location={pathname:url.pathname,search:url.search,hash:url.hash};
 const calls=[],modes=[],notifications=[],listeners=new Map(),timers=new Map();let timer=0,interruptions=0;
 const window={location:{href:url.href},setTimeout:(fn)=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 const href=to=>typeof to==='string'?to:`${to.pathname??location.pathname}${to.search??''}${to.hash??''}`;
 const commit=(kind,...args)=>{calls.push([kind,...args]);const next=new URL(href(args[0]),window.location.href);Object.assign(location,{pathname:next.pathname,search:next.search,hash:next.hash});window.location.href=next.href;};
 const context={navigator:{createHref:href,push:(...args)=>commit('push',...args),replace:(...args)=>commit('replace',...args),go:delta=>calls.push(['go',delta])}};
 const react={...React,useContext:()=>context,useLayoutEffect:fn=>fn(),useMemo:fn=>fn(),useRef:value=>({current:value})};
 const {MotionNavigation}=sourceModule('src/presentation/motion/MotionNavigation.tsx',{
  '../../features/publishing/mobileAuthoringHistory':{replaceMobileAuthoringDestination:()=>false},
  './navigationContext':{ImmediateNavigationContext:{Provider:'immediate-provider'}},
  react,'react-dom':{flushSync:fn=>fn()},'framer-motion':{MotionConfig:'motion-config',useReducedMotion:()=>false},'react-router-dom':{UNSAFE_NavigationContext:{Provider:'provider'},useLocation:()=>location},
  './ImageMotion':{ImageMotion:'images'},'../../features/sharing/shareModel':sourceModule('src/features/sharing/shareModel.ts'),
  './motion':{motionMs:()=>120,motionSeconds:()=>.18,motionCurve:()=>[.2,.8,.2,1],interruptNavigationMotion:()=>{interruptions++;motion?.interruptNavigationMotion();},motionUpdate:(fn,mode)=>{modes.push(mode);return motion?motion.motionUpdate(fn,mode):fn();}},
 },{URL,URLSearchParams,Event:class{constructor(type){this.type=type;}},document:{documentElement:{dataset:{}},addEventListener(){return;},removeEventListener(){return;},dispatchEvent:event=>notifications.push(event.type)},window});
 const wrapper=MotionNavigation({children:'profile'}),tree=wrapper.type(wrapper.props).props.children;
 return {navigator:tree.props.value.navigator,calls,modes,notifications,location,get interruptions(){return interruptions;},pop:()=>listeners.get('popstate')?.()};
}

test('profile count views swap immediately for push and replace, including returning to default Projects',()=>{
 for(const path of ['/p/creator','/share/creator','/avima.work'])for(const action of ['push','replace']){
  const h=profileNavigation(path);
  for(const search of ['?view=followers','?view=following','?view=portals','?view=projects',''])h.navigator[action](path+search);
  assert.deepEqual(h.modes,[],`${action} ${path} must not start a native or fallback navigation animation`);
  assert.deepEqual(h.calls.map(call=>call[0]),Array(5).fill(action));
  assert.deepEqual(h.notifications,Array(5).fill('portalink-before-navigation'));
  assert.equal(h.interruptions,5);
  assert.equal(h.location.search,'');
 }
});

test('an immediate profile view change preserves router arguments, URL data and fragment',()=>{
 for(const action of ['push','replace']){
  const h=profileNavigation('/p/creator?view=portals&fromConnections=owner#profile');
  const destination={pathname:'/p/creator',search:'?view=followers&fromConnections=owner&connectionList=following',hash:'#profile'};
  const state={profileFromDock:true},options={viewTransition:false};
  h.navigator[action](destination,state,options);
  assert.deepEqual(h.modes,[]);assert.equal(h.calls[0][0],action);assert.equal(h.calls[0][1],destination);assert.equal(h.calls[0][2],state);assert.equal(h.calls[0][3],options);
  assert.equal(h.location.search,destination.search);assert.equal(h.location.hash,destination.hash);assert.equal(h.interruptions,1);assert.deepEqual(h.notifications,['portalink-before-navigation']);
 }
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
   react:{useLayoutEffect:fn=>{cleanup=fn();}},'../usePresentation':{usePresentation:()=> 'web'},'./motion':{reducedMotion:()=>reduce},
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
 const api=sourceModule('src/presentation/motion/motion.ts',{'react-dom':{flushSync:fn=>fn()},'../../utils/projectContinuity':{isMobileProjectContinuity:()=>false,isProjectContinuityActive:()=>true,markProjectContinuityDestination(){},finishProjectContinuity(){}}},
 {document,window:{matchMedia:()=>({matches:false})},requestAnimationFrame:fn=>frames.push(fn),getComputedStyle:()=>({getPropertyValue:()=> '180ms'})});
 api.motionUpdate(()=>updates++,'push');assert.equal(attached[0].dataset.readerFrame,'');assert.equal(updates,0);
 frames.shift()();assert.equal(updates,0);frames.shift()();await Promise.resolve();assert.equal(updates,1);assert.equal(attached.length,0);
});

test('Cite dismisses a fast downward drag even before the move state renders',()=>{
 let closed=0;class ElementStub{closest(){return null;}}
 const react={...React,useEffect(){},useRef:value=>({current:value}),useState:value=>[value,()=>{}]};
 const {CiteSheet}=sourceModule('src/features/citations/CiteSheet.tsx',{
  react,'../../presentation/motion/useSheetMotion':{useSheetMotion:onClose=>({closing:false,close:onClose})},
  '../../presentation/usePresentation':{usePresentation:()=> 'web'},'lucide-react':{CheckIcon:'check-icon'},'../../components/ui/InterfaceIcon':{InterfaceIcon:'interface-icon'},
  './formats':{formatCitation:()=>'',citationFormatLabels:{mla:'MLA'}},'./publicOrigin':{PUBLIC_ORIGIN:'https://example.test'},'../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:true,viewerProfileId:'owner'})},
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
  '../../features/publishing/mobileAuthoringHistory':{replaceMobileAuthoringDestination:()=>false},
  './navigationContext':{ImmediateNavigationContext:{Provider:'immediate-provider'}},
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
 const {ImageMotion}=sourceModule('src/presentation/motion/ImageMotion.tsx',{react:{useLayoutEffect:fn=>{cleanup=fn();}},'../usePresentation':{usePresentation:()=> 'web'},'./motion':{reducedMotion:()=>false}},
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
 const {ImageMotion}=sourceModule('src/presentation/motion/ImageMotion.tsx',{react:{useLayoutEffect:fn=>{cleanup=fn();}},'../usePresentation':{usePresentation:()=> 'web'},'./motion':{reducedMotion:()=>false}},
 {document:{documentElement:root,addEventListener(name,fn){assert.equal(name,'portalink-motion-finished');done=fn;},removeEventListener(){}},Element:ElementStub,HTMLImageElement:ImageStub,MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.push(fn);return 1;},cancelAnimationFrame(){}});
 ImageMotion();assert.equal(image.dataset.motionImageReady,undefined);assert.equal(frames.length,0);
 delete root.dataset.motionUpdating;done();frames.forEach(fn=>fn());assert.equal(image.dataset.motionImageReady,'');
 delete image.dataset.motionImageReady;image.naturalWidth=0;image.handlers.get('error')();assert.equal(image.dataset.motionImageReady,'');cleanup();assert.equal(image.handlers.size,0);
});

function mobileImageMotion({cached=false,reduce=false,navigating=false}={}){
 let observe,cleanup,disconnected=false;const frames=[],events=new Map();
 class ElementStub{
  dataset={};attributes=new Map();children=[];
  querySelectorAll(){return this.children;}
  querySelector(){return null;}
  matches(){return false;}
  setAttribute(name,value){this.attributes.set(name,value);}
 }
 class ImageStub extends ElementStub{
  naturalWidth=0;complete=false;width=80;height=120;currentSrc='/art-one.jpg';src='/art-one.jpg';listeners=new Map();writes=[];
  constructor(){super();this.dataset=new Proxy({}, {set:(target,name,value)=>{this.writes.push(name);target[name]=value;return true;}});}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name);}
 }
 const image=new ImageStub(),root=new ElementStub();root.children=[image];
 if(cached){image.complete=true;image.naturalWidth=800;}
 if(navigating)root.dataset.motionUpdating='true';
 const {ImageMotion}=sourceModule('src/presentation/motion/ImageMotion.tsx',{
  react:{useLayoutEffect:fn=>{cleanup=fn();}},'../usePresentation':{usePresentation:()=> 'mobile'},'./motion':{reducedMotion:()=>reduce},
 },{document:{documentElement:root,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}},Element:ElementStub,HTMLImageElement:ImageStub,
  MutationObserver:class{constructor(fn){observe=fn;}observe(){}disconnect(){disconnected=true;}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},
 });
 ImageMotion();
 const mutate=(target,attributeName)=>observe([{type:'attributes',target,attributeName,removedNodes:[],addedNodes:[]}]);
 const load=(target=image)=>{target.complete=true;target.naturalWidth=800;target.listeners.get('load')?.();};
 return {image,root,frames,events,ElementStub,ImageStub,load,mutate,
  remove(target=image){root.children=root.children.filter(node=>node!==target);observe([{type:'childList',target:root,removedNodes:[target],addedNodes:[]}]);},
  append(target){root.children.push(target);observe([{type:'childList',target:root,removedNodes:[],addedNodes:[target]}]);},
  removeSkeleton(){const skeleton=new ElementStub();skeleton.matches=()=>true;observe([{type:'childList',target:root,removedNodes:[skeleton],addedNodes:[]}]);},
  dispose(){cleanup();},get disconnected(){return disconnected;},
 };
}

test('MOBILE complete cached artwork is visible immediately even during navigation',()=>{
 const h=mobileImageMotion({cached:true,navigating:true});
 assert.equal(h.image.dataset.motionImageMobile,'');
 assert.equal(h.image.dataset.motionImageReady,'');
 assert.equal(h.image.dataset.motionImageReveal,undefined);
 assert.equal(h.frames.length,0);
 assert.deepEqual([h.image.width,h.image.height],[80,120]);
 h.events.get('portalink-motion-finished')();
 assert.equal(h.image.dataset.motionImageReveal,undefined,'Navigation completion must not replay already cached paint');
 h.dispose();
});

test('MOBILE newly loaded artwork reveals once without waiting for animation frames or navigation',()=>{
 const h=mobileImageMotion({navigating:true});
 assert.equal(h.image.dataset.motionImageReady,undefined);
 h.load();
 assert.equal(h.image.dataset.motionImageReady,'');
 assert.equal(h.image.dataset.motionImageReveal,'');
 assert.equal(h.frames.length,0);
 const writes=h.image.writes.length;
 h.load();h.events.get('portalink-motion-finished')();
 assert.equal(h.image.writes.length,writes,'Duplicate load and transition completion cannot restart the reveal');
 assert.deepEqual([h.image.width,h.image.height],[80,120]);h.dispose();
});

test('MOBILE resolution candidate upgrades preserve ready artwork without another reveal',()=>{
 const h=mobileImageMotion({cached:true});
 h.image.complete=false;h.mutate(h.image,'srcset');
 assert.equal(h.image.dataset.motionImageReady,'');
 const writes=h.image.writes.length;
 h.image.currentSrc='/art-one-high-resolution.jpg';
 h.load();
 assert.equal(h.image.writes.length,writes);
 assert.equal(h.image.dataset.motionImageReveal,undefined);
 h.remove();const upgraded=new h.ImageStub();upgraded.currentSrc='/art-one-high-resolution.jpg';h.append(upgraded);h.load(upgraded);
 assert.equal(upgraded.dataset.motionImageReveal,undefined,'The successfully displayed resolution candidate is recognized on reuse');h.dispose();
});

test('MOBILE changing artwork distinguishes a cached replacement from a delayed replacement',()=>{
 const h=mobileImageMotion({cached:true,navigating:true});
 h.image.currentSrc='/art-two.jpg';
 h.mutate(h.image,'src');
 assert.equal(h.image.dataset.motionImageReady,'');
 assert.equal(h.image.dataset.motionImageReveal,undefined);
 h.image.currentSrc='/art-three.jpg';h.image.complete=false;h.image.naturalWidth=0;h.mutate(h.image,'src');
 assert.equal(h.image.dataset.motionImageReady,undefined);
 h.load();
 assert.equal(h.image.dataset.motionImageReady,'');
 assert.equal(h.image.dataset.motionImageReveal,'');
 h.image.currentSrc='/art-four.jpg';h.image.complete=true;h.mutate(h.image,'src');
 assert.equal(h.image.dataset.motionImageReady,'');
 assert.equal(h.image.dataset.motionImageReveal,undefined,'A later cached source must not inherit the previous reveal');
 assert.equal(h.frames.length,0);h.dispose();
});

test('MOBILE a stale load from replaced artwork cannot mark its incomplete successor ready',()=>{
 const h=mobileImageMotion({cached:true,navigating:true});
 h.image.src='/new-artwork.jpg';h.image.complete=false;
 h.mutate(h.image,'src');
 assert.equal(h.image.naturalWidth,800,'The browser can still report dimensions from the old image');
 assert.equal(h.image.dataset.motionImageReady,undefined);
 h.image.listeners.get('load')();
 assert.equal(h.image.dataset.motionImageReady,undefined);
 assert.equal(h.image.dataset.motionImageReveal,undefined);
 assert.equal(h.frames.length,0);
 h.image.currentSrc='/new-artwork.jpg';h.load();
 assert.equal(h.image.complete,true);
 assert.equal(h.image.dataset.motionImageReady,'');
 assert.equal(h.image.dataset.motionImageReveal,'');h.dispose();
});

test('MOBILE errors expose existing fallbacks and retry loads receive one fresh reveal',()=>{
 const h=mobileImageMotion();
 h.image.naturalWidth=0;h.image.listeners.get('error')();
 assert.equal(h.image.dataset.motionImageReady,'');
 assert.equal(h.image.dataset.motionImageReveal,undefined);
 h.image.complete=false;h.mutate(h.image,'src');
 assert.equal(h.image.dataset.motionImageReady,undefined);
 h.load();assert.equal(h.image.dataset.motionImageReveal,'');
 const writes=h.image.writes.length;h.load();assert.equal(h.image.writes.length,writes);h.dispose();
});

test('MOBILE reduced motion makes both cached and new artwork immediately ready without reveal',()=>{
 for(const cached of [false,true]){
  const h=mobileImageMotion({cached,reduce:true,navigating:true});
  if(!cached)h.load();
  assert.equal(h.image.dataset.motionImageReady,'');assert.equal(h.image.dataset.motionImageReveal,undefined);
  assert.equal(h.frames.length,0);h.dispose();
 }
});

test('MOBILE removal releases listeners and reveal state, while a new retry element owns its load',()=>{
 const h=mobileImageMotion();h.load();h.remove();
 assert.equal(h.image.listeners.size,0);
 assert.equal(h.image.dataset.motionImageMobile,undefined);
 assert.equal(h.image.dataset.motionImageReady,undefined);
 assert.equal(h.image.dataset.motionImageReveal,undefined);
 const retry=new h.ImageStub();retry.currentSrc='/new-retry-art.jpg';h.append(retry);h.load(retry);
 assert.equal(retry.dataset.motionImageReady,'');assert.equal(retry.dataset.motionImageReveal,'');
 h.dispose();assert.equal(retry.listeners.size,0);assert.equal(h.events.size,0);assert.equal(h.disconnected,true);
 assert.equal(retry.dataset.motionImageReveal,undefined);assert.equal(h.frames.length,0);
});

test('MOBILE previously presented artwork remounts without replay but still waits for real pixel readiness',()=>{
 const h=mobileImageMotion();h.load();
 assert.equal(h.image.dataset.motionImageReveal,'');h.remove();
 const sameArtwork=new h.ImageStub();sameArtwork.currentSrc=h.image.currentSrc;
 h.append(sameArtwork);
 assert.equal(sameArtwork.dataset.motionImageReady,undefined,'A known resource URL does not establish image readiness');
 assert.equal(sameArtwork.naturalWidth,0);
 assert.equal(sameArtwork.dataset.motionImageReveal,undefined);
 h.load(sameArtwork);
 assert.equal(sameArtwork.dataset.motionImageReady,'');
 assert.equal(sameArtwork.dataset.motionImageReveal,undefined,'A real async cached load must not replay already presented artwork');
 const unseen=new h.ImageStub();unseen.currentSrc='/not-shown-before.jpg';h.append(unseen);h.load(unseen);
 assert.equal(unseen.dataset.motionImageReveal,'');h.dispose();
});

test('MOBILE a cached source replacement remains recognized when its next element loads asynchronously',()=>{
 const h=mobileImageMotion({cached:true});h.image.currentSrc='/cached-replacement.jpg';h.mutate(h.image,'src');
 assert.equal(h.image.dataset.motionImageReady,'');assert.equal(h.image.dataset.motionImageReveal,undefined);
 h.remove();const replacement=new h.ImageStub();replacement.currentSrc='/cached-replacement.jpg';h.append(replacement);
 assert.equal(replacement.dataset.motionImageReady,undefined);h.load(replacement);
 assert.equal(replacement.dataset.motionImageReady,'');assert.equal(replacement.dataset.motionImageReveal,undefined);h.dispose();
});

test('MOBILE skeleton completion never starts a second ancestor fade',()=>{
 for(const navigating of [false,true]){
  const h=mobileImageMotion({navigating});h.removeSkeleton();
  assert.equal(h.root.attributes.has('data-motion-content-ready'),false);
  assert.equal(h.frames.length,0);h.dispose();
 }
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

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settleMotion=()=>new Promise(resolve=>setImmediate(resolve));
/** Controlled browser callbacks expose races without relying on animation timing. */
function navigationRuntime({native=false,continuity=false}={}){
 const root={dataset:{}},nodes=[],animations=[],nativeTransitions=[],frames=new Map(),timers=new Map(),notifications=[];
 let frameId=0,timerId=0,reduce=false,destinations=0,clears=0;
 class Surface{
  dataset={};style={};inert=false;isConnected=true;
  setAttribute(){}
  append(){}
  getBoundingClientRect(){return {top:16,left:0,width:420,height:896};}
  cloneNode(){return new Surface();}
  remove(){this.isConnected=false;const index=nodes.indexOf(this);if(index!==-1)nodes.splice(index,1);}
  animate(keyframes,options){
   const completion=deferred(),animation={keyframes,options,finished:completion.promise,canceled:0,finish:completion.resolve,cancel(){this.canceled++;completion.reject(Error('Animation canceled'));}};
   animations.push(animation);return animation;
  }
 }
 const main=new Surface(),host={append:node=>nodes.push(node)};
 const document={documentElement:root,createElement:()=>new Surface(),dispatchEvent:event=>notifications.push(event.type),
  querySelector:selector=>selector==='.codex-shell'?host:selector==='.app-screen-layer.screen-active > main'?main:null,
  querySelectorAll:()=>nodes.filter(node=>'motionSnapshot' in node.dataset||'motionPendingReader' in node.dataset),
 };
 if(native)document.startViewTransition=callback=>{
  const ready=deferred(),done=deferred(),finished=deferred();
  const transition={ready:ready.promise,updateCallbackDone:done.promise,finished:finished.promise,skips:0,skipTransition(){this.skips++;}};
  nativeTransitions.push({transition,ready,done,finished,commit(){const result=callback();void Promise.resolve(result).then(done.resolve,done.reject);return result;}});return transition;
 };
 const window={matchMedia:()=>({matches:reduce}),setTimeout:(fn,duration)=>{timers.set(++timerId,{fn,duration});return timerId;},clearTimeout:id=>timers.delete(id)};
 const api=sourceModule('src/presentation/motion/motion.ts',{'react-dom':{flushSync:fn=>fn()},'../../utils/projectContinuity':{
  beginProjectContinuity(){},isMobileProjectContinuity:()=>false,isProjectContinuityActive:()=>continuity,markProjectContinuityDestination(){destinations++;},finishProjectContinuity(){clears++;},
 }},{document,window,Event:class{constructor(type){this.type=type;}},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  getComputedStyle:()=>({getPropertyValue:name=>({'--m-fast':'120ms','--m-base':'180ms','--m-slow':'260ms','--m-enter':'linear','--m-exit':'linear'}[name]||'')})});
 const runFrame=()=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn();};
 return {api,root,document,nodes,animations,nativeTransitions,frames,timers,notifications,runFrame,setReduced:value=>{reduce=value;},get destinations(){return destinations;},get clears(){return clears;}};
}

test('interrupting an async fallback prevents its late completion from restarting motion or continuity',async()=>{
 const r=navigationRuntime(),operation=deferred();let updates=0;
 r.api.motionUpdate(()=>{updates++;return operation.promise;},'back');assert.equal(r.nodes.length,1);
 r.api.interruptNavigationMotion();assert.equal(r.nodes.length,0);assert.equal(r.root.dataset.motionUpdating,undefined);
 operation.resolve();await settleMotion();
 assert.equal(updates,1);assert.equal(r.animations.length,0);assert.equal(r.destinations,0);assert.equal(r.timers.size,0);
 assert.deepEqual(r.notifications,['portalink-motion-finished']);
});

test('an async fallback superseded by a new route cannot animate or clear the new route',async()=>{
 const r=navigationRuntime(),operation=deferred(),updates=[];
 r.api.motionUpdate(()=>{updates.push('old');return operation.promise;},'dock');const old=r.nodes[0];
 r.api.motionUpdate(()=>updates.push('new'),'push');await settleMotion();
 assert.deepEqual(updates,['old','new']);assert.equal(old.isConnected,false);assert.equal(r.nodes.length,1);assert.equal(r.animations.length,2);
 assert.equal(r.root.dataset.motionNavigation,'push');const marks=r.destinations;
 operation.resolve();await settleMotion();assert.equal(r.animations.length,2);assert.equal(r.destinations,marks);assert.equal(r.nodes.length,1);assert.equal(r.root.dataset.motionNavigation,'push');
 r.animations.at(-1).finish();await settleMotion();assert.equal(r.nodes.length,0);assert.equal(r.root.dataset.motionNavigation,undefined);
});

test('repeated fallback navigation cancels existing animations and snapshots before the next entry',async()=>{
 const r=navigationRuntime(),updates=[];
 r.api.motionUpdate(()=>updates.push('first'),'dock');await settleMotion();const old=r.nodes[0],first=r.animations.slice();
 r.api.motionUpdate(()=>updates.push('second'),'push');assert.equal(old.isConnected,false);assert.ok(first.every(animation=>animation.canceled===1));
 await settleMotion();assert.deepEqual(updates,['first','second']);assert.equal(r.nodes.length,1);assert.equal(r.animations.length,4);assert.equal(r.root.dataset.motionNavigation,'push');
 r.api.interruptNavigationMotion();await settleMotion();assert.ok(r.animations.every(animation=>animation.canceled===1));assert.equal(r.nodes.length,0);assert.equal(r.root.dataset.motionUpdating,undefined);
});

test('a new request flushes a deferred reader commit in order and cancels its stale animation frames',async()=>{
 const r=navigationRuntime({continuity:true}),updates=[];
 r.api.motionUpdate(()=>updates.push('first'),'push');const staleFrame=[...r.frames.values()][0];assert.equal(updates.length,0);assert.equal(r.nodes.length,1);
 r.api.motionUpdate(()=>updates.push('second'),'push');assert.deepEqual(updates,['first']);assert.equal(r.frames.size,1);assert.equal(r.nodes.length,1);
 staleFrame();assert.deepEqual(updates,['first']);assert.equal(r.frames.size,1);
 r.runFrame();r.runFrame();await settleMotion();assert.deepEqual(updates,['first','second']);assert.equal(r.frames.size,0);assert.equal(r.nodes.length,1);assert.equal(r.animations.length,2);
 r.api.interruptNavigationMotion();await settleMotion();assert.equal(r.nodes.length,0);
});

test('a gesture interrupt commits a reserved route once without replaying its deferred entrance',async()=>{
 const r=navigationRuntime({continuity:true});let updates=0;
 r.api.motionUpdate(()=>updates++,'push');r.runFrame();const staleFrame=[...r.frames.values()][0];
 r.api.interruptNavigationMotion();assert.equal(updates,1);assert.equal(r.frames.size,0);assert.equal(r.nodes.length,0);
 staleFrame();await settleMotion();assert.equal(updates,1);assert.equal(r.animations.length,0);assert.equal(r.destinations,0);assert.equal(r.root.dataset.motionUpdating,undefined);
});

test('late native callbacks preserve requested history work exactly once after direct interruption',async()=>{
 const r=navigationRuntime({native:true}),history=deferred(),calls=[];
 r.api.motionUpdate(()=>{calls.push(-1);return history.promise;},'back');assert.deepEqual(calls,[]);
 r.api.interruptNavigationMotion();assert.deepEqual(calls,[-1]);assert.equal(r.nativeTransitions[0].transition.skips,1);
 const result=r.nativeTransitions[0].commit();assert.deepEqual(calls,[-1]);history.resolve();await result;
 r.nativeTransitions[0].finished.resolve();await settleMotion();assert.equal(r.destinations,0);assert.equal(r.animations.length,0);assert.equal(r.root.dataset.motionNavigation,undefined);
});

test('native supersession commits pending requests in order even when the old browser callback arrives later',async()=>{
 const r=navigationRuntime({native:true}),calls=[];
 r.api.motionUpdate(()=>calls.push('first'),'dock');r.api.motionUpdate(()=>calls.push('second'),'push');
 assert.deepEqual(calls,['first']);assert.equal(r.nativeTransitions[0].transition.skips,1);
 r.nativeTransitions[0].commit();assert.deepEqual(calls,['first']);r.nativeTransitions[1].commit();assert.deepEqual(calls,['first','second']);
 r.nativeTransitions[0].finished.resolve();await settleMotion();assert.equal(r.root.dataset.motionNavigation,'push');
 r.nativeTransitions[1].finished.resolve();await settleMotion();assert.equal(r.root.dataset.motionNavigation,undefined);
});

test('reduced motion enabled during navigation cancels old feedback and retains both requests',async()=>{
 for(const native of [false,true]){
  const r=navigationRuntime({native}),calls=[];
  r.api.motionUpdate(()=>calls.push('first'),'dock');if(!native)await settleMotion();
  r.setReduced(true);r.api.motionUpdate(()=>calls.push('second'),'push');await settleMotion();
  assert.deepEqual(calls,['first','second']);assert.equal(r.root.dataset.motionUpdating,undefined);assert.equal(r.nodes.length,0);assert.equal(r.api.motionMs('slow'),0);
  if(native){assert.equal(r.nativeTransitions.length,1);assert.equal(r.nativeTransitions[0].transition.skips,1);r.nativeTransitions[0].commit();r.nativeTransitions[0].finished.resolve();await settleMotion();assert.deepEqual(calls,['first','second']);}
  else assert.ok(r.animations.every(animation=>animation.canceled===1));
 }
});

test('a native ready-rejection entrance remains cancelable after native snapshot completion',async()=>{
 for(const next of ['gesture','navigation']){
  const r=navigationRuntime({native:true});let updates=0;
  r.api.motionUpdate(()=>updates++,'dock');const first=r.nativeTransitions[0];first.commit();first.ready.reject(Error('Snapshot unavailable'));await settleMotion();
  assert.equal(updates,1);assert.equal(r.animations.length,1);assert.equal(r.animations[0].options.duration,180);assert.equal(r.root.dataset.motionUpdating,undefined);
  first.finished.resolve();await settleMotion();
  if(next==='gesture')r.api.interruptNavigationMotion();else r.api.motionUpdate(()=>updates++,'push');
  assert.equal(r.animations[0].canceled,1);await settleMotion();
  if(next==='navigation'){assert.equal(r.root.dataset.motionNavigation,'push');r.nativeTransitions[1].commit();assert.equal(updates,2);r.nativeTransitions[1].finished.resolve();await settleMotion();}
  assert.equal(r.root.dataset.motionNavigation,undefined);
 }
});

test('a native ready rejection after interruption cannot restart an entrance fade',async()=>{
 const r=navigationRuntime({native:true});let updates=0;
 r.api.motionUpdate(()=>updates++,'dock');const transition=r.nativeTransitions[0];r.api.interruptNavigationMotion();transition.commit();transition.ready.reject(Error('Snapshot unavailable'));transition.finished.resolve();await settleMotion();
 assert.equal(updates,1);assert.equal(r.animations.length,0);assert.equal(r.root.dataset.motionUpdating,undefined);
});

test('a native API error cannot duplicate a route when its retained callback runs after fallback',async()=>{
 const r=navigationRuntime();let callback,updates=0;
 r.document.startViewTransition=update=>{callback=update;throw Error('Native API unavailable');};
 r.api.motionUpdate(()=>updates++,'back');await settleMotion();assert.equal(updates,1);callback();assert.equal(updates,1);
 r.api.interruptNavigationMotion();await settleMotion();assert.equal(r.nodes.length,0);
});

test('a synchronous native callback interrupted while committing cannot reclaim motion ownership',()=>{
 const r=navigationRuntime();let skips=0,updates=0;
 r.document.startViewTransition=update=>{void update();return {ready:Promise.resolve(),updateCallbackDone:Promise.resolve(),finished:new Promise(()=>{}),skipTransition(){skips++;}};};
 r.api.motionUpdate(()=>{updates++;r.api.interruptNavigationMotion();},'push');
 assert.equal(updates,1);assert.equal(skips,1);assert.equal(r.root.dataset.motionUpdating,undefined);
 r.api.interruptNavigationMotion();assert.equal(skips,1);
});

test('deliberate profile-view swaps cancel prior native and fallback feedback without a new transition',async()=>{
 for(const native of [false,true])for(const action of ['push','replace']){
  const r=navigationRuntime({native});let priorUpdates=0;
  r.api.motionUpdate(()=>priorUpdates++,'push');if(!native)await settleMotion();
  const animationCount=r.animations.length,h=profileNavigation('/p/creator',r.api),state={fromProfile:true},options={viewTransition:false};
  h.navigator[action]('/p/creator?view=followers',state,options);await settleMotion();
  assert.equal(priorUpdates,1);assert.equal(h.interruptions,1);assert.deepEqual(h.modes,[]);assert.deepEqual(h.calls,[[action,'/p/creator?view=followers',state,options]]);assert.deepEqual(h.notifications,['portalink-before-navigation']);
  assert.equal(r.nodes.length,0);assert.equal(r.root.dataset.motionUpdating,undefined);assert.equal(r.root.dataset.motionNavigation,undefined);assert.equal(r.animations.length,animationCount);
  if(native){assert.equal(r.nativeTransitions.length,1);assert.equal(r.nativeTransitions[0].transition.skips,1);r.nativeTransitions[0].commit();r.nativeTransitions[0].finished.resolve();await settleMotion();assert.equal(priorUpdates,1);}
  else assert.ok(r.animations.every(animation=>animation.canceled===1));
 }
});

test('automatic query replacement does not acquire deliberate profile-tab interruption behavior',()=>{
 for(const [from,to] of [['/p/creator','/p/creator?sort=name'],['/search?q=a','/search?q=ab'],['/p/creator?view=followers','/p/creator?view=followers&sort=name']]){
  const h=profileNavigation(from);h.navigator.replace(to);assert.equal(h.interruptions,0);assert.deepEqual(h.modes,[]);assert.deepEqual(h.calls,[['replace',to]]);assert.deepEqual(h.notifications,['portalink-before-navigation']);
 }
});
