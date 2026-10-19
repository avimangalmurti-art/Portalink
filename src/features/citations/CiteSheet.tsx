import { useSheetMotion } from '../../presentation/motion/useSheetMotion';
import { PUBLIC_ORIGIN } from './publicOrigin';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { requireSupabase } from '../../services/supabase/client';
import { citationPath, type CitationItem, type CitationRecord } from './model';
import { citeItem, citationNote } from './service';
import './citations.css';
import {formatCitation,citationFormatLabels,type CitationFormat} from './formats';
import { useModalFocus } from '../../hooks/useModalFocus';
import { CheckIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { usePresentation } from '../../presentation/usePresentation';
export function CiteSheet({item,onClose,onCited}:{item:CitationItem;onClose:()=>void;onCited?:()=>void}) {
 const [format,setFormat]=useState<CitationFormat>('mla'),[showProjects,setShowProjects]=useState(false),[loadingProjects,setLoadingProjects]=useState(false),[projectRetry,setProjectRetry]=useState(0);
 const isMobile=usePresentation()==='mobile';
 const preview=formatCitation(item,PUBLIC_ORIGIN,format);
 const [copiedCitation,setCopiedCitation]=useState<string|null>(null),copyRequest=useRef(0);
 const copied=isMobile&&copiedCitation===preview;
 useEffect(()=>{setCopiedCitation(null);setStatus('');return()=>{copyRequest.current+=1;};},[preview]);
 const flight=useRef(false);
 const motion=useSheetMotion(onClose);
 const drag=useRef<number|null>(null),[dragY,setDragY]=useState(0);
 const dialog=useRef<HTMLElement>(null);
 useModalFocus(true,dialog,()=>{if(!busy)motion.close();},true);
 const auth=useAuth(),[projects,setProjects]=useState<Array<{id:string;title:string}>>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[chosen,setChosen]=useState<{record:CitationRecord;title:string}|null>(null),[note,setNote]=useState(''),[status,setStatus]=useState('');
 const canAttach=auth.isAuthenticated && Boolean(auth.viewerProfileId) && auth.viewerProfileId!==item.creatorId && item.citable && !auth.isInitializing && auth.phase!=='authenticating' && auth.phase!=='signing-out';
 useEffect(()=>{
  if(!showProjects||!canAttach||!auth.viewerProfileId)return;
  let live=true;setLoadingProjects(true);setProjects([]);setError('');
  void Promise.resolve().then(()=>requireSupabase().from('projects').select('id,title').eq('profile_id',auth.viewerProfileId).order('updated_at',{ascending:false})).then(({data,error})=>{if(live){if(error)setError('Your projects could not be loaded. Try again.');else setProjects(data??[]);}}).catch(()=>{if(live)setError('Your projects could not be loaded. Try again.');}).finally(()=>{if(live)setLoadingProjects(false);});
  return()=>{live=false;};
 },[showProjects,canAttach,auth.viewerProfileId,item.id,projectRetry]);

 const pick=async(project:{id:string;title:string})=>{if(flight.current||!canAttach||!auth.viewerProfileId)return;flight.current=true;setBusy(true);setError('');try{const record=await citeItem(item,project.id,auth.viewerProfileId);setChosen({record,title:project.title});onCited?.();}catch(e){setError((e as Error).message);}finally{flight.current=false;setBusy(false);}};
 const copy=async()=>{const request=++copyRequest.current;setError('');setStatus('');setCopiedCitation(null);try{await navigator.clipboard.writeText(preview);if(request!==copyRequest.current)return;setCopiedCitation(preview);setStatus(`${citationFormatLabels[format]} citation copied.`);}catch{if(request===copyRequest.current)setError('Citation could not be copied. Select the preview text to copy it manually.');}};

 return <ModalPortal><div className="citation-backdrop" data-motion-scrim="" data-motion-closing={motion.closing||undefined}><section ref={dialog} tabIndex={-1} data-ui-surface="sheet" className="cite-sheet cite-source-sheet" data-motion-sheet="" data-motion-closing={motion.closing||undefined} data-sheet-dragging={drag.current!==null||undefined} style={{['--sheet-drag-y' as string]:`${dragY}px`}} role="dialog" aria-modal="true" aria-labelledby="cite-heading"><header onPointerDown={e=>{if(!busy&&e.isPrimary&&!(e.target instanceof Element&&e.target.closest('button'))){drag.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}}} onPointerMove={e=>{if(drag.current!==null)setDragY(Math.max(0,e.clientY-drag.current));}} onPointerUp={e=>{const distance=Math.max(0,e.clientY-(drag.current??e.clientY));drag.current=null;if(distance>64)motion.close();else setDragY(0);}} onPointerCancel={()=>{drag.current=null;setDragY(0);}}><h2 id="cite-heading">Cite this work</h2><button disabled={busy} aria-label="Close" onClick={()=>motion.close()}>×</button></header>
 <div className="cite-source-summary" aria-label="Source being cited"><strong>{item.projectTitle}</strong><span>By {item.creator}</span><span>{item.kind==='page'?'Page':'Image'} {item.number}{item.madeOn?` · ${item.madeOn}`:''}</span></div>
 <label className="cite-format">Citation format<select value={format} onChange={e=>{copyRequest.current+=1;setCopiedCitation(null);setFormat(e.target.value as CitationFormat);setStatus('');}}>{Object.entries(citationFormatLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <textarea className="cite-preview" aria-label="Citation preview" readOnly value={preview}/>
 <p className="cite-format-help">Draft citation from the creator’s details. Check the author name, date and formatting required for your work.</p>
 <button type="button" className={isMobile?'cite-copy-action':undefined} data-copy-state={copied?'copied':undefined} data-semantic-action={copied?'copy-success':undefined} onClick={()=>void copy()}>{copied?<><InterfaceIcon icon={CheckIcon} size="sm" weight="semibold" keepColor/>Copied</>:<>Copy {citationFormatLabels[format]}</>}</button>
 <section className="cite-attach" aria-label="Add a project reference">
 {!auth.isAuthenticated?<button type="button" onClick={()=>{sessionStorage.setItem('portalink:cite-intent',item.id);auth.requestAuthenticatedDestination({kind:'route',path:citationPath(item.id)+'?cite=1',label:'add a reference to your project'},'signUp');motion.close();}}>Sign in to add a reference to your project</button>:canAttach?chosen?<><p role="status">Reference added to your project: {chosen.title}</p><label>Optional note<input maxLength={140} value={note} onChange={e=>setNote(e.target.value)} /></label><button disabled={busy} onClick={async()=>{setBusy(true);try{await citationNote(chosen.record.id,note);setStatus('Note saved.');onCited?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Save note</button></>:<><button type="button" aria-expanded={showProjects} disabled={busy} onClick={()=>setShowProjects(current=>!current)}>Add reference to my project</button>{showProjects&&<><p>Choose one of your projects that uses this source. These are destinations for the reference, not the work being cited.</p>{loadingProjects?<p role="status">Loading your projects…</p>:<div className="citation-projects" aria-label="Your projects to add the reference to">{projects.map(project=><button type="button" disabled={busy} key={project.id} onClick={()=>void pick(project)}>Add to «{project.title}»</button>)}{!projects.length&&!error&&<p>No projects yet. Create a project in Studio, then return here to add this reference.</p>}</div>}{error&&<button type="button" disabled={loadingProjects} onClick={()=>setProjectRetry(value=>value+1)}>Retry loading my projects</button>}</>}</>:<p>{auth.viewerProfileId===item.creatorId?'You can copy a citation of your work above.':'Project references are unavailable for this item. You can copy its citation above.'}</p>}
 </section>
 {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}</section></div></ModalPortal>;
}
