import {useEffect,useRef,useState,type RefObject} from 'react';
/** Home alone owns this gesture. Pinch, horizontal drags and scrolled content stay native. */
export function useHomePullRefresh(ref:RefObject<HTMLElement>,enabled:boolean,busy:boolean,refresh:()=>void) {
 const latest=useRef({busy,refresh});latest.current={busy,refresh};
 const [label,setLabel]=useState('');
 useEffect(()=>{
  if(!enabled||!ref.current)return;
  const surface=ref.current;
  let start:{x:number;y:number}|null=null,ready=false;
  const reset=()=>{start=null;ready=false;setLabel('');};
  const atTop=()=> (document.scrollingElement?.scrollTop??window.scrollY) <= 0 && !document.querySelector('[role="dialog"][aria-modal="true"]');
  const begin=(event:TouchEvent)=>{
   reset();
   if(event.touches.length!==1||latest.current.busy||!atTop())return;
   if(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable],[role="dialog"]'))return;
   start={x:event.touches[0].clientX,y:event.touches[0].clientY};
  };
  const move=(event:TouchEvent)=>{
   if(!start)return;
   if(event.touches.length!==1||!atTop()||latest.current.busy){reset();return;}
   const dx=Math.abs(event.touches[0].clientX-start.x),dy=event.touches[0].clientY-start.y;
   if(dy<0||dx>Math.max(12,dy)){reset();return;}
   if(dy>0&&dy>=dx&&event.cancelable)event.preventDefault();
   if(dy<12){ready=false;setLabel('');return;}
   ready=dy>=72;setLabel(ready?'Release to refresh':'Pull to refresh');
  };
  const end=()=>{const run=ready&&atTop()&&!latest.current.busy;reset();if(run)latest.current.refresh();};
  surface.addEventListener('touchstart',begin,{passive:true});
  surface.addEventListener('touchmove',move,{passive:false});
  surface.addEventListener('touchend',end,{passive:true});
  surface.addEventListener('touchcancel',reset,{passive:true});
  return()=>{surface.removeEventListener('touchstart',begin);surface.removeEventListener('touchmove',move);surface.removeEventListener('touchend',end);surface.removeEventListener('touchcancel',reset);};
 },[enabled,ref]);
 return label;
}
