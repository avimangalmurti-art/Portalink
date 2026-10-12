import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useLocation} from 'react-router-dom';
import {useProjectManagement} from '../projects/useProjectManagement';
import {ProjectEditorDialog} from '../projects/ProjectEditorDialog';
import {useOwnerRecord} from './OwnerRecordProvider';
import {recordRows} from './model';
/** Main application only. No additions to the shared reader or public payload. */
export function RecordProjectTools({profileId,projectId,owner}:{profileId:string|null;projectId:string|null;owner:boolean}){
 const record=useOwnerRecord(),location=useLocation(),management=useProjectManagement(owner?profileId:null),[host,setHost]=useState<HTMLElement|null>(null);
 const opened=useRef('');
 const requested=new URLSearchParams(location.search).get('record');
 useEffect(()=>{if(!owner||!projectId||!requested){opened.current='';return;}const token=projectId+':'+requested+':'+location.search;if(opened.current===token)return;const mode= requested==='date'||requested==='citable'?'journey':requested==='summary'?'story':requested==='cover'?'cover-choice':requested==='files'?'files':null;if(mode){opened.current=token;management.editor.open(projectId,mode);}},[owner,projectId,requested,location.search,management.editor]);
 useEffect(()=>{if(!owner||!projectId){setHost(null);return;}let node:HTMLElement|null=null;const attach=()=>{const title=document.querySelector('#follow-info-title, #project-description-title, [data-premium-project-viewer] h3[data-font-preview]');if(!title||node?.isConnected)return;node=document.createElement('div');node.dataset.ownerRecordChip='';title.after(node);setHost(node);};const observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});attach();return()=>{observer.disconnect();node?.remove();};},[owner,projectId,location.pathname]);
 useEffect(()=>{if(!owner||management.editor.phase!=='editing')return;const selector=requested==='date'?'#project-made-on':requested==='citable'?'[data-record-access]':requested==='summary'?'#project-summary':null;if(selector)document.querySelector<HTMLElement>(selector)?.focus();},[owner,requested,management.editor.phase]);
 const rows=owner&&record?.status?recordRows(record.status,'tidyups').filter(row=>row.projectId===projectId&&row.memory==='active'):[];
 return <>{host&&rows.length>0&&createPortal(<button className="owner-record-chip" onClick={()=>record?.open(rows[0])}>{rows.map(row=>row.chip).filter(Boolean).join(' · ')}</button>,host)}{owner&&management.editor.projectId&&<ProjectEditorDialog management={management}/>}</>;
}
