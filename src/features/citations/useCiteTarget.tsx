import React,{useCallback,useEffect,useRef,useState} from 'react';
import {CitedIn} from './CitationReferences';
import {CiteSheet} from './CiteSheet';
import {resolveCitationItem,resolvePageId,resolveImageId} from './service';
import type {CitationItem} from './model';
import {usePresentation} from '../../presentation/usePresentation';

type MobileOpening = {attachmentId:string;pageIndex:number;item:CitationItem|null;error:string};

export function useCiteTarget(attachmentId:string,pageIndex:number,visible=false) {
 const isMobile=usePresentation()==='mobile';
 const target=useRef({attachmentId,pageIndex,isMobile,request:0,active:true});
 target.current.attachmentId=attachmentId;target.current.pageIndex=pageIndex;target.current.isMobile=isMobile;
 const [resolvedId,setResolvedId]=useState<string|null>(null);
 const [item,setItem]=useState<CitationItem|null>(null),[error,setError]=useState('');
 const [mobileOpening,setMobileOpening]=useState<MobileOpening|null>(null);
 const close=useCallback(()=>{
  // Invalidate at the user's dismissal, before any decorative exit can finish.
  target.current.request++;
  setMobileOpening(null);setItem(null);
 },[]);
 const open=async()=>{
  if(!target.current.active||target.current.attachmentId!==attachmentId||target.current.pageIndex!==pageIndex||target.current.isMobile!==isMobile)return;
  const request=++target.current.request;
  const current=()=>target.current.active&&target.current.request===request&&target.current.attachmentId===attachmentId&&target.current.pageIndex===pageIndex&&target.current.isMobile===isMobile;
  const show=(value:CitationItem|null,message='')=>{
   if(!current())return;
   if(isMobile)setMobileOpening({attachmentId,pageIndex,item:value,error:message});
   else if(value)setItem(value);else setError(message);
  };
  setError('');
  if(isMobile)setMobileOpening({attachmentId,pageIndex,item:null,error:''});
  try{
   const imageId=await resolveImageId(attachmentId);
   if(!current())return;
   let value=imageId?await resolveCitationItem(imageId):null;
   if(!current())return;
   if(!value){
    const id=await resolvePageId(attachmentId,pageIndex);
    if(!current())return;
    if(id)value=await resolveCitationItem(id);
   }
   show(value,value?'':'This item is unavailable for citation.');
  }catch{show(null,isMobile?'Citation could not be loaded. Check your connection and try again.':'Citation could not be loaded.');}
 };

 useEffect(()=>{
  target.current.active=true;setMobileOpening(null);setItem(null);setError('');
  return()=>{target.current.active=false;target.current.request++;};
 },[attachmentId,pageIndex,isMobile]);
 const mobileVisible=isMobile&&mobileOpening?.attachmentId===attachmentId&&mobileOpening.pageIndex===pageIndex;
 useEffect(()=>{
  if(!mobileVisible)return;
  window.addEventListener('popstate',close,true);
  return()=>window.removeEventListener('popstate',close,true);
 },[mobileVisible,close]);
 useEffect(()=>{if(!visible)return;let live=true;setResolvedId(null);void (async()=>{const page=await resolvePageId(attachmentId,pageIndex);if(live)setResolvedId(page??await resolveImageId(attachmentId));})().catch(()=>undefined);return()=>{live=false;};},[attachmentId,pageIndex,visible]);
 return {open,citedIn:resolvedId?<CitedIn itemId={resolvedId}/>:null,surface:<>{isMobile?mobileVisible&&<CiteSheet item={mobileOpening.item} opening={{error:mobileOpening.error,onRetry:()=>void open()}} onClose={close}/>:<>{error&&<p role="alert">{error}</p>}{item&&<CiteSheet item={item} onClose={close}/>}</>}</>};
}
