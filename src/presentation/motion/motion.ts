import { flushSync } from 'react-dom';
import {beginProjectContinuity,isProjectContinuityActive,markProjectContinuityDestination,finishProjectContinuity} from '../../utils/projectContinuity';
export type MotionScale = 'fast' | 'base' | 'slow';
export type NavigationMotion = 'dock' | 'push' | 'back' | 'tabs';
let generation=0;
let updating=false;
let active: {skipTransition?:()=>void}|undefined;
let navigationAnimations: Animation[] = [];
const navigationFrames=new Set<number>();
let pendingNavigation:(()=>void|Promise<void>)|undefined;
function cancelNavigationVisuals(){
 active?.skipTransition?.();active=undefined;
 navigationAnimations.forEach(animation=>animation.cancel());navigationAnimations=[];
 if(typeof cancelAnimationFrame==='function')navigationFrames.forEach(cancelAnimationFrame);navigationFrames.clear();
 document.querySelectorAll?.('[data-motion-snapshot], [data-motion-pending-reader]').forEach(node=>node.remove());
}
/** Cancel the presentation, never an already requested router/history operation. */
function commitPendingNavigation(){const commit=pendingNavigation;pendingNavigation=undefined;if(commit)void Promise.resolve(commit()).catch(()=>undefined);}
/** Direct manipulation takes ownership from an unfinished navigation snapshot. */
export function interruptNavigationMotion() {
 if(typeof document==='undefined')return;
 ++generation;cancelNavigationVisuals();commitPendingNavigation();
 delete document.documentElement.dataset.motionUpdating;delete document.documentElement.dataset.motionNavigation;
 finishProjectContinuity();document.dispatchEvent?.(new Event('portalink-motion-finished'));
}
export function reducedMotion() { return typeof window==='undefined' || typeof document==='undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true || document.querySelector('.reduce-motion, .app-viewport--reduce-motion')!==null; }
export function motionMs(scale:MotionScale) { if(reducedMotion())return 0;return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--m-${scale}`))||0; }
export function motionSeconds(scale:MotionScale) {return motionMs(scale)/1000;}
export function motionEase(direction:'enter'|'exit'='enter') { return typeof document==='undefined'?'linear':getComputedStyle(document.documentElement).getPropertyValue(`--m-${direction}`).trim()||'linear'; }
export function motionCurve(direction:'enter'|'exit'='enter') { const values=motionEase(direction).match(/[\d.]+/g)?.map(Number);return values?.length===4?values as [number,number,number,number]:'linear' as const; }
function bodySurface(){return document.querySelector<HTMLElement>('.app-screen-layer.screen-active > main')??document.querySelector<HTMLElement>('[data-visitor-main]')??document.querySelector<HTMLElement>('main');}
/** Native snapshots see the committed route, not a scheduled React update. */
export function motionUpdate(update:()=>void|Promise<void>, mode:NavigationMotion='push') {
 if(updating){void update();return;}
 if(typeof document==='undefined'){void update();finishProjectContinuity();return;}
 const root=document.documentElement,revision=++generation;
 cancelNavigationVisuals();commitPendingNavigation();
 if(root.dataset.mobilePullDismiss||reducedMotion()){
  delete root.dataset.motionUpdating;delete root.dataset.motionNavigation;
  flushSync(()=>{void update();});if(!root.dataset.mobilePullDismiss)finishProjectContinuity();return;
 }
 if(mode==='back'){const project=document.querySelector<HTMLElement>('[data-project-stage][data-project-continuity-id]');if(project?.dataset.projectContinuityId)beginProjectContinuity(project.dataset.projectContinuityId,'return');}
 const pending=mode==='push'&&isProjectContinuityActive()?pendingReader():undefined;
 root.dataset.motionNavigation=mode;root.dataset.motionUpdating='true';
 let called=false,finished=false,released=false,completion:void|Promise<void>=undefined;
 const markDestination=()=>{if(revision===generation)markProjectContinuityDestination();};
 const commit=()=>{
  if(called)return completion;called=true;if(pendingNavigation===commit)pendingNavigation=undefined;pending?.remove();
  let result:void|Promise<void>=undefined;updating=true;
  try{flushSync(()=>{result=update();});}catch(error){completion=Promise.reject(error);return completion;}finally{updating=false;}
  const operation=result as Promise<void>|undefined;
  if(operation&&typeof operation.then==='function')completion=new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(resolve,motionMs('slow'));void operation.then(()=>{window.clearTimeout(timer);resolve();},error=>{window.clearTimeout(timer);reject(error);});}).then(markDestination);
  else markDestination();return completion;
 };
 pendingNavigation=commit;
 const release=()=>{if(released||revision!==generation)return;released=true;delete root.dataset.motionUpdating;delete root.dataset.motionNavigation;active=undefined;finishProjectContinuity();document.dispatchEvent?.(new Event('portalink-motion-finished'));};
 const finish=()=>{pending?.remove();if(finished||revision!==generation)return;finished=true;navigationAnimations=[];release();};
 if(typeof document.startViewTransition==='function'){
  try{
   let recovering=false;const transition=document.startViewTransition(commit);if(revision===generation)active=transition;else transition.skipTransition();
   void transition.ready?.catch(()=>{recovering=true;void transition.updateCallbackDone.then(()=>{
    if(finished||revision!==generation)return;transition.skipTransition();release();
    const entrance=!reducedMotion()?bodySurface()?.animate?.([{opacity:0},{opacity:1}],{duration:motionMs('base'),easing:motionEase()}):undefined;
    if(entrance){navigationAnimations.push(entrance);void entrance.finished.then(finish,finish);}else finish();
   },finish);});
   void transition.finished.then(()=>{if(!recovering)finish();},()=>{if(!recovering)finish();});return;
  }catch{if(called){void Promise.resolve(completion).catch(()=>undefined);finish();return;}}
 }
 const fallback=()=>{
 if(revision!==generation)return;
 const outgoing=bodySurface(),bounds=outgoing?.getBoundingClientRect(),old=outgoing?.cloneNode(true) as HTMLElement|undefined;
 if(old&&bounds){old.setAttribute('aria-hidden','true');old.inert=true;Object.assign(old.style,{position:'fixed',top:`${bounds.top}px`,left:`${bounds.left}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,margin:'0',zIndex:'39',pointerEvents:'none',overflow:'hidden'});old.dataset.motionSnapshot='';document.querySelector('.codex-shell')?.append(old);}
 void Promise.resolve(commit()).then(()=>{
  if(revision!==generation){old?.remove();return;}
  const duration=motionMs('base');if(!duration){old?.remove();finish();return;}
  const incoming=bodySurface(),entrance=incoming?.animate?.([{opacity:0},{opacity:1}],{duration,easing:motionEase()});
  if(entrance){navigationAnimations.push(entrance);void entrance.finished.catch(()=>undefined);}
  const exit=old?.animate?.([{opacity:1},{opacity:0}],{duration,easing:motionEase('exit')});if(exit)navigationAnimations.push(exit);
  const animation=exit??entrance,done=()=>{old?.remove();finish();};if(animation)void animation.finished.then(done,done);else done();
 },()=>{old?.remove();finish();});
 };
 const frame=(callback:()=>void)=>{const id=requestAnimationFrame(()=>{navigationFrames.delete(id);if(revision===generation)callback();});navigationFrames.add(id);};
 if(pending)frame(()=>frame(fallback));else fallback();
}

/** Paint a reserved reader frame before the browser finishes its old snapshot. */
function pendingReader(){
 const frame=document.createElement('div');
 frame.dataset.readerFrame='';frame.dataset.motionPendingReader='';
 frame.className='motion-reader-skeleton';frame.setAttribute('role','status');frame.setAttribute('aria-label','Opening');
 const counter=document.createElement('span');counter.className='motion-skeleton motion-reader-counter';
 const page=document.createElement('div');page.className='motion-reader-page motion-skeleton';
 frame.append(counter,page);document.querySelector('.codex-shell')?.append(frame);return frame;
}
