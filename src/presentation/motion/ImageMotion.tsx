import {useLayoutEffect} from 'react';
import {reducedMotion} from './motion';
/** Keep geometry in the existing layout; reveal loaded paint after snapshot travel. */
export function ImageMotion(){
 useLayoutEffect(()=>{
  const seen=new WeakSet<HTMLImageElement>(),frames=new Set<number>(),pending=new Set<HTMLImageElement>();
  const listeners=new Map<HTMLImageElement,{load:()=>void;error:()=>void}>();
  const reveal=(image:HTMLImageElement)=>{
   if(image.naturalWidth<=0)return;
   if(reducedMotion()){image.dataset.motionImageReady='';return;}
   if(document.documentElement.dataset?.motionUpdating==='true'){pending.add(image);return;}
   const frame=requestAnimationFrame(()=>{image.dataset.motionImageReady='';frames.delete(frame);});frames.add(frame);
  };
  const finished=()=>{for(const image of pending){pending.delete(image);reveal(image);}};
  document.addEventListener?.('portalink-motion-finished',finished);
  const watch=(image:HTMLImageElement)=>{
   if(seen.has(image))return;seen.add(image);image.dataset.motionImage='';
   const load=()=>reveal(image),error=()=>{pending.delete(image);image.dataset.motionImageReady='';};
   image.addEventListener('load',load);image.addEventListener('error',error);listeners.set(image,{load,error});
   if(image.complete){if(image.naturalWidth>0)load();else error();}
  };
  const scan=(node:Node)=>{if(node instanceof HTMLImageElement)watch(node);if(node instanceof Element)node.querySelectorAll('img').forEach(watch);};
  const unwatch=(node:Node)=>{
   const images=node instanceof HTMLImageElement?[node]:node instanceof Element?[...node.querySelectorAll('img')]:[];
   for(const image of images){const handlers=listeners.get(image);if(handlers){image.removeEventListener('load',handlers.load);image.removeEventListener('error',handlers.error);}listeners.delete(image);pending.delete(image);seen.delete(image);}
  };
  scan(document.documentElement);
  const observer=new MutationObserver(records=>{for(const record of records){
   if(record.type==='attributes'&&record.target instanceof HTMLImageElement){delete record.target.dataset.motionImageReady;if(record.target.complete)listeners.get(record.target)?.[record.target.naturalWidth>0?'load':'error']();}
   record.removedNodes.forEach(unwatch);record.addedNodes.forEach(scan);
   if(!reducedMotion()&&document.documentElement.dataset?.motionUpdating!=='true'&&[...record.removedNodes].some(node=>node instanceof Element&&(node.matches('[data-loading-layout],[data-reader-frame]')||node.querySelector('[data-loading-layout],[data-reader-frame]')))){
    const content=record.target instanceof Element?record.target:null;content?.setAttribute('data-motion-content-ready','');
   }
  }});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset']});
  return()=>{observer.disconnect();document.removeEventListener?.('portalink-motion-finished',finished);frames.forEach(cancelAnimationFrame);listeners.forEach((handlers,image)=>{image.removeEventListener('load',handlers.load);image.removeEventListener('error',handlers.error);});pending.clear();};
 },[]);return null;
}
