import React,{useEffect,useRef,useState} from 'react';
import {CitedIn} from './CitationReferences';
import {CiteSheet} from './CiteSheet';
import {resolveCitationItem,resolvePageId,resolveImageId} from './service';
import type {CitationItem} from './model';
export function useCiteTarget(attachmentId:string,pageIndex:number,visible=false) {
 const target=useRef({attachmentId,pageIndex,request:0});target.current.attachmentId=attachmentId;target.current.pageIndex=pageIndex;
 const [resolvedId,setResolvedId]=useState<string|null>(null);
 const [item,setItem]=useState<CitationItem|null>(null),[error,setError]=useState('');
 const open=async()=>{const request=++target.current.request;const current=()=>target.current.request===request&&target.current.attachmentId===attachmentId&&target.current.pageIndex===pageIndex;setError('');try{const imageId=await resolveImageId(attachmentId);let value=imageId?await resolveCitationItem(imageId):null;if(!value){const id=await resolvePageId(attachmentId,pageIndex);if(id)value=await resolveCitationItem(id);}if(!current())return;if(value)setItem(value);else setError('This item is unavailable for citation.');}catch{if(current())setError('Citation could not be loaded.');}};

 useEffect(()=>{setItem(null);setError('');return()=>{target.current.request++;};},[attachmentId,pageIndex]);
 useEffect(()=>{if(!visible)return;let live=true;setResolvedId(null);void (async()=>{const page=await resolvePageId(attachmentId,pageIndex);if(live)setResolvedId(page??await resolveImageId(attachmentId));})().catch(()=>undefined);return()=>{live=false;};},[attachmentId,pageIndex,visible]);
 return {open,citedIn:resolvedId?<CitedIn itemId={resolvedId}/>:null,surface:<>{error&&<p role="alert">{error}</p>}{item&&<CiteSheet item={item} onClose={()=>{target.current.request++;setItem(null);}}/>}</>};
}
