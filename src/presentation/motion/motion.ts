import { flushSync } from 'react-dom';
import {beginProjectContinuity,isProjectContinuityActive,markProjectContinuityDestination,finishProjectContinuity} from '../../utils/projectContinuity';
export type MotionScale = 'fast' | 'base' | 'slow';
export type NavigationMotion = 'dock' | 'push' | 'back' | 'tabs';
let generation=0;
let updating=false;
let active: {skipTransition?:()=>void}|undefined;
let navigationAnimations: Animation[] = [];
/** Direct manipulation takes ownership from an unfinished navigation snapshot. */
export function interruptNavigationMotion() {
 if(typeof document==='undefined')return;
 active?.skipTransition?.();active=undefined;++generation;
 navigationAnimations.forEach(animation=>animation.cancel());navigationAnimations=[];
 document.querySelectorAll?.('[data-motion-snapshot], [data-motion-pending-reader]').forEach(node=>node.remove());
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
 if(typeof document !== 'undefined' && document.documentElement?.dataset.mobilePullDismiss){flushSync(()=>{void update();});return;}
 if(updating){void update();return;}
 if(typeof document==='undefined'||reducedMotion()){void update();finishProjectContinuity();return;}
 if(mode==='back'){const project=document.querySelector<HTMLElement>('[data-project-stage][data-project-continuity-id]');if(project?.dataset.projectContinuityId)beginProjectContinuity(project.dataset.projectContinuityId,'return');}
 const pending=mode==='push'&&isProjectContinuityActive()?pendingReader():undefined;
 const root=document.documentElement,revision=++generation;
 active?.skipTransition?.();root.dataset.motionNavigation=mode;root.dataset.motionUpdating='true';
 let called=false;
 const commit=()=>{called=true;pending?.remove();let result:void|Promise<void>=undefined;updating=true;try{flushSync(()=>{result=update();});}finally{updating=false;}const operation=result as Promise<void>|undefined;if(operation&&typeof operation.then==='function'){return new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(resolve,motionMs('slow'));void operation.then(()=>{window.clearTimeout(timer);resolve();},error=>{window.clearTimeout(timer);reject(error);});}).then(markProjectContinuityDestination);}markProjectContinuityDestination();};
 const finish=()=>{pending?.remove();if(revision!==generation)return;delete root.dataset.motionUpdating;delete root.dataset.motionNavigation;active=undefined;navigationAnimations=[];finishProjectContinuity();document.dispatchEvent?.(new Event('portalink-motion-finished'));};
 if(typeof document.startViewTransition==='function'){
  try{const transition=document.startViewTransition(commit);active=transition;void transition.ready?.catch(()=>{void transition.updateCallbackDone.then(()=>{if(revision!==generation)return;transition.skipTransition();finish();if(!reducedMotion())bodySurface()?.animate?.([{opacity:0},{opacity:1}],{duration:motionMs('base'),easing:motionEase()});},finish);});void transition.finished.then(finish,finish);return;}catch{if(called){finish();return;}}
 }
 const fallback=()=>{
 const outgoing=bodySurface(),bounds=outgoing?.getBoundingClientRect(),old=outgoing?.cloneNode(true) as HTMLElement|undefined;
 if(old&&bounds){old.setAttribute('aria-hidden','true');old.inert=true;Object.assign(old.style,{position:'fixed',top:`${bounds.top}px`,left:`${bounds.left}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,margin:'0',zIndex:'39',pointerEvents:'none',overflow:'hidden'});old.dataset.motionSnapshot='';document.querySelector('.codex-shell')?.append(old);}
 void Promise.resolve(commit()).then(()=>{const duration=motionMs('base'),incoming=bodySurface();const entrance=incoming?.animate?.([{opacity:0},{opacity:1}],{duration,easing:motionEase()});if(entrance)navigationAnimations.push(entrance);const exit=old?.animate?.([{opacity:1},{opacity:0}],{duration,easing:motionEase('exit')});if(exit){navigationAnimations.push(exit);void exit.finished.catch(()=>undefined).then(()=>{old?.remove();finish();});}else{old?.remove();finish();}},()=>{old?.remove();finish();});
 };
 if(pending)requestAnimationFrame(()=>requestAnimationFrame(fallback));else fallback();
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