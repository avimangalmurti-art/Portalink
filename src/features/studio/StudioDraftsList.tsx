import { ModalPortal } from '../../components/ui/ModalPortal';
import { ProjectDiscardConfirmation } from '../../components/publishing/ProjectFormDialog';
import React, { useState } from 'react';
import { MobileContextButton, useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import type { DraftResume } from './workbenchModel';
export function StudioDraftsList({drafts,onBack,onResume,onDiscard,onNew,onBookmarks,onReads}:{drafts:DraftResume[];onBack:()=>void;onResume:(draft:DraftResume)=>void;onDiscard:(ids:string[])=>Promise<void>;onNew?:()=>void;onBookmarks:()=>void;onReads:()=>void}) {
 const [selecting,setSelecting]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set()),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const finishSelection=()=>{if(busy)return;setSelecting(false);setSelected(new Set());setError('');};
 useMobileScreenActions(contextActions('studio',{signedIn:true,owner:true},{handlers:{newProject:onNew,drafts:finishSelection,bookmarks:onBookmarks,reads:onReads,select:drafts.length?()=>setSelecting(true):undefined}}));
 const selectedDrafts=drafts.filter(d=>selected.has(d.id));
 const toggle=(id:string)=>setSelected(v=>{const next=new Set(v);if(next.has(id))next.delete(id);else next.add(id);return next;});
 return <section className="mobile-studio studio-workbench" data-studio-selecting={selecting?'true':'false'} aria-label="Drafts">
  <header className="studio-workbench-header">
   <div className="studio-drafts-heading"><button type="button" className="studio-drafts-back" disabled={busy} onClick={()=>selecting?finishSelection():onBack()}>← {selecting?'Done':'Studio'}</button>
   <button type="button" className="studio-drafts-control" disabled={busy||!drafts.length} aria-pressed={selecting} onClick={()=>selecting?finishSelection():setSelecting(true)}>{selecting?'Done':'Select'}</button><div data-inline-screen-actions=""><MobileContextButton /></div></div><h1 className="studio-drafts-title">Drafts</h1>
   <p>{selecting?'Tap drafts to select them for removal.':'Tap a draft to continue editing.'}</p>
   {selecting&&<div className="studio-selection-summary"><span role="status">{selectedDrafts.length} selected</span><button type="button" disabled={busy} onClick={()=>setSelected(selectedDrafts.length===drafts.length?new Set():new Set(drafts.map(d=>d.id)))}>{selectedDrafts.length===drafts.length?'Deselect all':'Select all'}</button></div>}
  </header>
  <div className="studio-workbench-scroll"><ul className="studio-drafts-list inset-row-group">{drafts.map(d=><li key={d.id} data-selected={selecting&&selected.has(d.id)}>
   <button type="button" disabled={busy} aria-pressed={selecting?selected.has(d.id):undefined} onClick={()=>selecting?toggle(d.id):onResume(d)}>
    {selecting&&<span className="studio-draft-check" aria-hidden="true">{selected.has(d.id)?'✓':''}</span>}
    <span className="studio-draft-copy"><strong>{d.metadata.title.trim()||'Untitled'}</strong><span>{({files:'Files',details:'Details',review:'Review'})[d.stage]} · {new Date(d.updatedAt??d.createdAt).toLocaleDateString()}</span></span>
    {!selecting&&<span aria-hidden="true">→</span>}
   </button>
  </li>)}</ul>{!drafts.length&&<p>No drafts to continue.</p>}</div>
  {selecting&&<div className="studio-selection-toolbar studio-draft-toolbar" role="toolbar" aria-label="Selected draft actions"><span role="status">{selectedDrafts.length} selected</span><button type="button" disabled={busy||!selectedDrafts.length} onClick={()=>{setError('');setConfirm(true);}}>Discard {selectedDrafts.length||''} {selectedDrafts.length===1?'draft':'drafts'}</button></div>}
  {confirm&&<ModalPortal><ProjectDiscardConfirmation title="Discard selected drafts?" description="This removes the selected drafts and their uploaded files. This cannot be undone." error={error} busy={busy} onKeep={()=>{if(!busy)setConfirm(false);}} onDiscard={async()=>{if(busy)return;setBusy(true);setError('');try{await onDiscard(selectedDrafts.map(d=>d.id));setSelected(new Set());setConfirm(false);setSelecting(false);}catch(e){setError(e instanceof Error?e.message:'Drafts could not be discarded.');}finally{setBusy(false);}}}/></ModalPortal>}
 </section>;
}
