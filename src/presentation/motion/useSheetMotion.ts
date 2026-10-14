import {useCallback,useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {motionMs} from './motion';

let finishExitClone:(()=>void)|undefined;

/** Decorative exits never retain modal state or hold up the next interaction. */
function retainExitClone(root:HTMLElement,duration:number){
 finishExitClone?.();
 const scope=root.closest<HTMLElement>('[data-themed-portal]')??root;
 const sourceSheet=root.matches('[data-motion-sheet]')?root:root.querySelector<HTMLElement>('[data-motion-sheet]');
 const transform=sourceSheet?getComputedStyle(sourceSheet).transform:undefined;
 const sourceScrim=root.matches('[data-motion-scrim]')?root:root.querySelector<HTMLElement>('[data-motion-scrim]');
 const opacity=sourceScrim?getComputedStyle(sourceScrim).opacity:undefined;
 const clone=scope.cloneNode(true) as HTMLElement;
 clone.inert=true;clone.setAttribute('aria-hidden','true');clone.style.pointerEvents='none';
 clone.removeAttribute('aria-modal');
 clone.querySelectorAll('[aria-modal]').forEach(element=>element.removeAttribute('aria-modal'));
 const scrim=clone.matches('[data-motion-scrim]')?clone:clone.querySelector<HTMLElement>('[data-motion-scrim]');
 const sheet=clone.matches('[data-motion-sheet]')?clone:clone.querySelector<HTMLElement>('[data-motion-sheet]');
 scrim?.setAttribute('data-motion-closing','true');sheet?.setAttribute('data-motion-closing','true');
 if(scrim){scrim.style.viewTransitionName='portalink-scrim-exit';if(opacity!==undefined)scrim.style.setProperty('--motion-exit-opacity',opacity);}
 if(sheet){sheet.style.viewTransitionName='portalink-sheet-exit';sheet.style.transition='none';if(transform&&transform!=='none')sheet.style.setProperty('--sheet-exit-transform',transform);}
 (scope.parentElement??document.body).append(clone);
 const finish=()=>{
  clearTimeout(timer);
  document.removeEventListener('pointerdown',finish,true);document.removeEventListener('keydown',finish,true);
  clone.remove();if(finishExitClone===finish)finishExitClone=undefined;
 };
 finishExitClone=finish;
 document.addEventListener('pointerdown',finish,true);document.addEventListener('keydown',finish,true);
 const timer=setTimeout(finish,duration);
}

/** Callbacks release the real sheet immediately; ordinary editor closes keep their focus until exit. */
export function useSheetMotion(onClose:()=>void){
 const [closing,setClosing]=useState(false),pending=useRef(false),timer=useRef<ReturnType<typeof setTimeout>>(),latest=useRef(onClose);latest.current=onClose;
 const settle=useRef<(()=>void)>(),releaseInterrupt=useRef<(()=>void)>();
 useEffect(()=>{
  finishExitClone?.();
  // Register before the modal focus effect: a later input releases its trap first.
  const interrupt=()=>{if(settle.current)flushSync(settle.current);};
  let released=false;
  const release=()=>{if(released)return;released=true;document.removeEventListener('pointerdown',interrupt,true);document.removeEventListener('keydown',interrupt,true);releaseInterrupt.current=undefined;};
  releaseInterrupt.current=release;
  document.addEventListener('pointerdown',interrupt,true);document.addEventListener('keydown',interrupt,true);
  return()=>{settle.current=undefined;if(timer.current!==undefined)clearTimeout(timer.current);release();};
 },[]);
 const close=useCallback((after?:()=>void,root?:HTMLElement|null)=>{if(pending.current)return;pending.current=true;const duration=motionMs('slow');if(after){
  // Keep native clipboard/share inside this tap; retain only an inert exit bitmap.
  releaseInterrupt.current?.();
  if(root&&duration)retainExitClone(root,duration);
  after();return;
 }let completed=false;const done=()=>{if(completed)return;completed=true;clearTimeout(timer.current);timer.current=undefined;settle.current=undefined;releaseInterrupt.current?.();latest.current();};if(!duration){done();return;}setClosing(true);settle.current=done;timer.current=setTimeout(done,duration);},[]);
 return {closing,close};
}
