import {useEffect,useRef,useState,type RefObject} from 'react';
/** Home alone owns this gesture. Pinch, horizontal drags and scrolled content stay native. */
export function useHomePullRefresh(ref:RefObject<HTMLElement>,enabled:boolean,busy:boolean,refresh:()=>void,onPull?:(distance:number|null,willRefresh?:boolean)=>void) {
 const latest=useRef({busy,refresh,onPull,enabled});latest.current={busy,refresh,onPull,enabled};
 const [label,setLabel]=useState('');
 const labelOwner=useRef<typeof onPull|null>(onPull);
 useEffect(()=>{
  if(!enabled||!ref.current)return;
  const surface=ref.current;
  let start:{x:number;y:number}|null=null,ready=false;
  const ownsGesture=()=>latest.current.enabled&&latest.current.onPull===onPull;
  const reset=(willRefresh=false)=>{start=null;ready=false;if(!ownsGesture())return;labelOwner.current=onPull;setLabel('');onPull?.(null,willRefresh);};
  reset();
  const atTop=()=> (document.scrollingElement?.scrollTop??window.scrollY) <= 0 && !document.querySelector('[role="dialog"][aria-modal="true"]');
  const begin=(event:TouchEvent)=>{
   if(!ownsGesture())return;
   reset();
   if(event.touches.length!==1||latest.current.busy||!atTop())return;
   if(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable],[role="dialog"]'))return;
   start={x:event.touches[0].clientX,y:event.touches[0].clientY};
  };
  const move=(event:TouchEvent)=>{
   if(!ownsGesture())return;
   if(!start)return;
   if(event.touches.length!==1||!atTop()||latest.current.busy){reset();return;}
   const dx=Math.abs(event.touches[0].clientX-start.x),dy=event.touches[0].clientY-start.y;
   if(dy<0||dx>Math.max(12,dy)){reset();return;}
   if(dy>0&&dy>=dx&&event.cancelable)event.preventDefault();
   onPull?.(dy);
   if(dy<12){ready=false;setLabel('');return;}
   ready=dy>=72;setLabel(ready?'Release to refresh':'Pull to refresh');
  };
  const end=()=>{if(!ownsGesture())return;const run=ready&&atTop()&&!latest.current.busy;reset(run);if(run)latest.current.refresh();};
  const cancel=()=>reset();
  surface.addEventListener('touchstart',begin,{passive:true});
  surface.addEventListener('touchmove',move,{passive:false});
  surface.addEventListener('touchend',end,{passive:true});
  surface.addEventListener('touchcancel',cancel,{passive:true});
  return()=>{start=null;ready=false;labelOwner.current=null;surface.removeEventListener('touchstart',begin);surface.removeEventListener('touchmove',move);surface.removeEventListener('touchend',end);surface.removeEventListener('touchcancel',cancel);};
 },[enabled,ref,onPull]);
 return enabled&&labelOwner.current===onPull?label:'';
}
