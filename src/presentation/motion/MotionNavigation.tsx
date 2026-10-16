import {flushSync} from 'react-dom';
import {MotionConfig,useReducedMotion} from 'framer-motion';
import React,{useContext,useLayoutEffect,useMemo,useRef} from 'react';
import {UNSAFE_NavigationContext,useLocation} from 'react-router-dom';
import {ImageMotion} from './ImageMotion';
import {motionUpdate,interruptNavigationMotion,motionMs,motionSeconds,motionCurve,type NavigationMotion} from './motion';
import {handleFromPath} from '../../features/sharing/shareModel';
/** One adapter preserves the router's URLs, history and permission decisions. */
export function MotionNavigation({children}:{children:React.ReactNode}){
 const context=useContext(UNSAFE_NavigationContext);
 return context?<RoutedMotionNavigation>{children}</RoutedMotionNavigation>:<MotionDefaults>{children}</MotionDefaults>;
}
function MotionDefaults({children}:{children:React.ReactNode}){
 const reduce=useReducedMotion();
 return <MotionConfig reducedMotion="user" transition={{duration:reduce?0:motionSeconds('base'),ease:motionCurve()}}><ImageMotion/>{children}</MotionConfig>;
}
function RoutedMotionNavigation({children}:{children:React.ReactNode}){
 const context=useContext(UNSAFE_NavigationContext),location=useLocation(),latest=useRef(location),dock=useRef(false);
 latest.current=location;
 useLayoutEffect(()=>{
  const click=(event:MouseEvent)=>{dock.current=event.target instanceof Element&&Boolean(event.target.closest('.mobile-navigation-dock'));window.setTimeout(()=>{dock.current=false;},motionMs('fast'));};
  document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true);
 },[]);
 const navigator=useMemo(()=>{
  const original=context.navigator;
  function before(direction:NavigationMotion='push'){if(document.documentElement)document.documentElement.dataset.mobileStackNavigation=direction;document.dispatchEvent?.(new Event('portalink-before-navigation'));}
  function profileViewChange(destination:URL){
   const current=latest.current;
   if(destination.origin!==new URL(window.location.href).origin||destination.pathname!==current.pathname||destination.hash!==(current.hash??''))return false;
   const profileRoot=/^\/(?:p|share)\/[^/]+\/?$/.test(current.pathname)||(/^\/[^/]+\/?$/.test(current.pathname)&&Boolean(handleFromPath(current.pathname)));
   if(!profileRoot)return false;
   const from=new URLSearchParams(current.search),to=new URLSearchParams(destination.search);
   if(from.getAll('view').length>1||to.getAll('view').length>1)return false;
   const views=['projects','portals','followers','following'];
   return views.includes(from.get('view')??'projects')&&views.includes(to.get('view')??'projects')&&from.get('view')!==to.get('view');
  }
  function mode(to:Parameters<typeof original.push>[0]):NavigationMotion{const destination=new URL(original.createHref(to),window.location.href);if(dock.current){dock.current=false;return 'dock';}return destination.pathname===latest.current.pathname&&new URLSearchParams(destination.search).has('collection')?'tabs':'push';}
  return {...original,push:(...args:Parameters<typeof original.push>)=>{
   const destination=new URL(original.createHref(args[0]),window.location.href);
   if(profileViewChange(destination)){dock.current=false;interruptNavigationMotion();before('tabs');return original.push(...args);}
   const direction=mode(args[0]);return motionUpdate(()=>{before(direction);original.push(...args);},direction);
  },replace:(...args:Parameters<typeof original.replace>)=>{
   const destination=new URL(original.createHref(args[0]),window.location.href);
   if(profileViewChange(destination)){dock.current=false;interruptNavigationMotion();before('tabs');return original.replace(...args);}
   // Search typing and automatic route canonicalisation must stay immediate.
   if(!new URLSearchParams(destination.search).has('collection')&&!new URLSearchParams(destination.search).has('section')){before();return original.replace(...args);}
   const direction=mode(args[0]);motionUpdate(()=>{before(direction);original.replace(...args);},direction);
  },go:(delta:number)=>{before();return motionUpdate(()=>new Promise<void>(resolve=>{const done=()=>{window.removeEventListener('popstate',onPop);window.clearTimeout(timer);resolve();};const onPop=()=>{flushSync(()=>undefined);done();};const timer=window.setTimeout(done,motionMs('slow'));window.addEventListener('popstate',onPop,{once:true});original.go(delta);}),delta<0?'back':'push');}};
 },[context.navigator]);
 return <UNSAFE_NavigationContext.Provider value={{...context,navigator}}><MotionDefaults>{children}</MotionDefaults></UNSAFE_NavigationContext.Provider>;
}
