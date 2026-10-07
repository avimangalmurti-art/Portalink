import { PUBLIC_ORIGIN } from './publicOrigin';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { requireSupabase } from '../../services/supabase/client';
import { bibCitation, plainCitation, citationPath, type CitationItem, type CitationRecord } from './model';
import { citeItem, citationNote } from './service';
import './citations.css';
import { useModalFocus } from '../../hooks/useModalFocus';
export function CiteSheet({item,onClose,onCited}:{item:CitationItem;onClose:()=>void;onCited?:()=>void}) {
 const dialog=useRef<HTMLElement>(null);
 useModalFocus(true,dialog,()=>{if(!busy)onClose();},true);
 const auth=useAuth(),[projects,setProjects]=useState<Array<{id:string;title:string}>>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[chosen,setChosen]=useState<{record:CitationRecord;title:string}|null>(null),[note,setNote]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{if(!auth.viewerProfileId)return;let live=true;requireSupabase().from('projects').select('id,title').eq('profile_id',auth.viewerProfileId).order('updated_at',{ascending:false}).then(({data,error})=>{if(live){if(error)setError('Projects could not be loaded.');else setProjects(data??[]);}});return()=>{live=false;};},[auth.viewerProfileId]);
 const pick=async(project:{id:string;title:string})=>{if(busy||!auth.viewerProfileId)return;setBusy(true);setError('');try{const record=await citeItem(item,project.id,auth.viewerProfileId);setChosen({record,title:project.title});onCited?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const copy=async(bib:boolean)=>{try{await navigator.clipboard.writeText(bib?bibCitation(item,PUBLIC_ORIGIN):plainCitation(item,PUBLIC_ORIGIN));setStatus('Citation copied.');}catch{setError('Citation could not be copied.');}};
 return <ModalPortal><div className="citation-backdrop"><section ref={dialog} tabIndex={-1} className="cite-sheet" role="dialog" aria-modal="true" aria-labelledby="cite-heading"><header><h2 id="cite-heading">Cite</h2><button disabled={busy} aria-label="Close" onClick={onClose}>×</button></header>
 {!auth.isAuthenticated?<button onClick={()=>{sessionStorage.setItem('portalink:cite-intent',item.id);auth.requestAuthenticatedDestination({kind:'route',path:citationPath(item.id)+'?cite=1',label:'cite this item'},'signUp');onClose();}}>Create account</button>:auth.viewerProfileId===item.creatorId?<p>You cannot cite your own work.</p>:chosen?<><p role="status">Cited in «{chosen.title}»</p><label>Note<input maxLength={140} value={note} onChange={e=>setNote(e.target.value)} /></label><button disabled={busy} onClick={async()=>{setBusy(true);try{await citationNote(chosen.record.id,note);setStatus('Note saved.');onCited?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Save note</button></>:<div className="citation-projects">{projects.map(project=><button disabled={busy} key={project.id} onClick={()=>void pick(project)}>{project.title}</button>)}<button onClick={()=>{sessionStorage.setItem('portalink:cite-intent',item.id);location.assign('/studio?newProject=1');}}>New project</button></div>}
 {<div className="citation-copy"><span>Copy citation</span><button onClick={()=>void copy(false)}>Plain text</button><button onClick={()=>void copy(true)}>BibTeX</button></div>}{error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}</section></div></ModalPortal>;
}
