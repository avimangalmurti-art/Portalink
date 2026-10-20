import {useLayoutEffect} from 'react';
import {usePresentation} from '../usePresentation';
import {reducedMotion} from './motion';
/** Keep geometry in the existing layout; mobile ready paint never waits for navigation. */
export function ImageMotion(){
 const mobile=usePresentation()==='mobile';
 useLayoutEffect(()=>{
  const seen=new WeakSet<HTMLImageElement>(),frames=new Set<number>(),pending=new Set<HTMLImageElement>();
  // Presentation history only, not a pixel cache: readiness still comes from the
  // browser. Bound this session-local list when readers recycle image elements.
  const presented=new Set<string>();
  const remember=(image:HTMLImageElement)=>{
   const source=image.currentSrc||image.src,previous=Boolean(source&&presented.has(source));
   if(source){
    presented.delete(source);presented.add(source);
    const oldest=presented.values().next().value;
    if(presented.size>256&&oldest!==undefined)presented.delete(oldest);
   }
   return previous;
  };
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
   if(mobile)image.dataset.motionImageMobile='';
   const ready=(cached=false)=>{
    if(!mobile){reveal(image);return;}
    if(!image.complete||image.naturalWidth<=0)return;
    const previouslyPresented=remember(image);
    if(image.dataset.motionImageReady!==undefined)return;
    image.dataset.motionImageReady='';
    if(!cached&&!previouslyPresented&&!reducedMotion())image.dataset.motionImageReveal='';
   };
   const load=()=>ready(),error=()=>{pending.delete(image);delete image.dataset.motionImageReveal;image.dataset.motionImageReady='';};
   image.addEventListener('load',load);image.addEventListener('error',error);listeners.set(image,{load,error});
   if(image.complete){if(image.naturalWidth>0)ready(true);else error();}
  };
  const scan=(node:Node)=>{if(node instanceof HTMLImageElement)watch(node);if(node instanceof Element)node.querySelectorAll('img').forEach(watch);};
  const unwatch=(node:Node)=>{
   const images=node instanceof HTMLImageElement?[node]:node instanceof Element?[...node.querySelectorAll('img')]:[];
   for(const image of images){const handlers=listeners.get(image);if(handlers){image.removeEventListener('load',handlers.load);image.removeEventListener('error',handlers.error);}listeners.delete(image);pending.delete(image);seen.delete(image);if(mobile){delete image.dataset.motionImageMobile;delete image.dataset.motionImageReveal;delete image.dataset.motionImageReady;}}
  };
  scan(document.documentElement);
  const observer=new MutationObserver(records=>{for(const record of records){
   if(record.type==='attributes'&&record.target instanceof HTMLImageElement){
    const image=record.target;
    // A higher-resolution candidate is the same artwork. Keep its existing paint.
    if(!mobile||record.attributeName!=='srcset'||image.dataset.motionImageReady===undefined){
     delete image.dataset.motionImageReady;delete image.dataset.motionImageReveal;
     if(mobile&&image.complete&&image.naturalWidth>0){remember(image);image.dataset.motionImageReady='';}
     else if(image.complete)listeners.get(image)?.[image.naturalWidth>0?'load':'error']();
    }
   }
   record.removedNodes.forEach(unwatch);record.addedNodes.forEach(scan);
   if(!mobile&&!reducedMotion()&&document.documentElement.dataset?.motionUpdating!=='true'&&[...record.removedNodes].some(node=>node instanceof Element&&(node.matches('[data-loading-layout],[data-reader-frame]')||node.querySelector('[data-loading-layout],[data-reader-frame]')))){
    const content=record.target instanceof Element?record.target:null;content?.setAttribute('data-motion-content-ready','');
   }
  }});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset']});
  return()=>{observer.disconnect();document.removeEventListener?.('portalink-motion-finished',finished);frames.forEach(cancelAnimationFrame);for(const image of listeners.keys())unwatch(image);pending.clear();};
 },[mobile]);return null;
}
