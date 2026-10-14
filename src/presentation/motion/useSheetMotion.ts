import {useCallback,useEffect,useRef,useState} from 'react';
import {motionMs} from './motion';
/** Keep focus and the real sheet mounted until its reverse motion finishes. */
export function useSheetMotion(onClose:()=>void){
 const [closing,setClosing]=useState(false),pending=useRef(false),timer=useRef<ReturnType<typeof setTimeout>>(),latest=useRef(onClose);latest.current=onClose;
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const close=useCallback((after?:()=>void,root?:HTMLElement|null)=>{if(pending.current)return;pending.current=true;const duration=motionMs('slow');if(after){
  // Keep native clipboard/share inside this tap; retain only an inert exit bitmap.
  if(root&&duration){const scope=root.closest<HTMLElement>('[data-themed-portal]')??root,clone=scope.cloneNode(true) as HTMLElement;clone.inert=true;clone.setAttribute('aria-hidden','true');clone.style.pointerEvents='none';const scrim=clone.matches('[data-motion-scrim]')?clone:clone.querySelector<HTMLElement>('[data-motion-scrim]'),sheet=clone.querySelector<HTMLElement>('[data-motion-sheet]');scrim?.setAttribute('data-motion-closing','true');sheet?.setAttribute('data-motion-closing','true');if(scrim)scrim.style.viewTransitionName='portalink-scrim-exit';if(sheet)sheet.style.viewTransitionName='portalink-sheet-exit';(scope.parentElement??document.body).append(clone);setTimeout(()=>clone.remove(),duration);}
  after();return;
 }const done=()=>{latest.current();};if(!duration){done();return;}setClosing(true);timer.current=setTimeout(done,duration);},[]);
 return {closing,close};
}
