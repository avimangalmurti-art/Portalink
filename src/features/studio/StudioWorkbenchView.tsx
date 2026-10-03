import React, { useState } from 'react';
import { PlusIcon, PauseIcon } from 'lucide-react';
import { ProjectCover } from '../../components/media/ProjectCover';
import { StudioRow } from './StudioRow';
import { StudioActionSheet } from './StudioActionSheet';
import { visibleAttention, type Attention, type DraftResume, type weeklyReads } from './workbenchModel';
import type { Material } from './useWorkbench';
import type { Project } from '../../types/domain';
import './studio-workbench.css';
export type WorkbenchViewProps = {
 draft:DraftResume|null;draftCount:number;attention:Attention[];week:ReturnType<typeof weeklyReads>;publishedCount:number;material:Material[];
 onRetry?:()=>void;partial:boolean;draftsUnavailable?:boolean;cover?:{source:string;kind:Project['coverKind'];pageNumber?:number;frame?:Project['coverFrame']};
 onContinue:()=>void;onDrafts:()=>void;onBookmarks:()=>void;onReads:()=>void;onMaterial:(item:Material)=>void;onAttention:(row:Attention)=>void;onDismiss:(id:string)=>void;
};
export function StudioWorkbenchView(p:WorkbenchViewProps){
 const [all,setAll]=useState(false),[menu,setMenu]=useState<Attention|null>(null);
 const allDone=!p.partial&&!p.attention.length&&!p.material.length&&!(p.week?.opened||p.week?.finished||p.week?.saved)&&p.draftCount<=1;
 return <section className="mobile-studio studio-workbench" data-mobile-studio="" aria-label="Studio">
  <header className="studio-workbench-header"><h1>Studio</h1><p>Your next move.</p></header>
  <div className="studio-workbench-scroll">
   <section aria-labelledby="studio-continue"><h2 id="studio-continue">Continue</h2>
    <button className="studio-continue-card" type="button" disabled={p.draftsUnavailable} onClick={p.onContinue}>
     {p.cover&&p.draft?<span className="studio-continue-cover"><ProjectCover source={p.cover.source} kind={p.cover.kind} alt="Draft cover" pageNumber={p.cover.pageNumber} frame={p.cover.frame} sizes="72px" /></span>:!p.draft?<PlusIcon aria-hidden="true"/>:null}
     <span><strong>{p.draftsUnavailable?'Drafts could not load':p.draft?p.draft.metadata.title.trim()||'Untitled':'New project'}</strong>{p.draft?<><span>{({files:'Files',details:'Details',review:'Review'})[p.draft.stage]}</span><time dateTime={p.draft.updatedAt??p.draft.createdAt}>Edited {new Date(p.draft.updatedAt??p.draft.createdAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></>:<span>{p.draftsUnavailable?'Try again to continue.':'Start with your files.'}</span>}</span><span aria-hidden="true">→</span>
    </button>
    {p.draftCount>1?<button className="studio-other-drafts" onClick={p.onDrafts}>Other drafts ({p.draftCount-1}) <span aria-hidden="true">→</span></button>:null}
    {p.draftsUnavailable?<p role="status">Drafts could not load. Try again before starting another.</p>:null}
   </section>
   {p.partial?<p className="studio-workbench-note" role="status">Some workspace information could not load. Unavailable numbers are hidden.{p.onRetry?<button className="studio-workbench-link" onClick={p.onRetry}>Try again</button>:null}</p>:null}
   {allDone?<p className="studio-workbench-note" data-studio-all-done="">Nothing needs your attention.</p>:<>
    {p.attention.length?<section aria-labelledby="studio-attention"><h2 id="studio-attention">Needs attention</h2><ul className="studio-attention-list">{visibleAttention(p.attention,all).map(row=><StudioRow key={row.id} id={row.id} title={row.project.title} secondary={row.gap} actionLabel={row.label} leading={<ProjectCover source={row.project.cover} thumbnail={row.project.coverThumbnail} alt={row.project.coverAlt||row.project.title} kind={row.project.coverKind} frame={row.project.coverFrame} sizes="44px" allowPdfFallback={false} allowVideoFallback={false} />} selecting={false} selected={false} onSelect={()=>p.onAttention(row)} onOpen={()=>p.onAttention(row)} actions={[]} onMenu={()=>setMenu(row)} />)}</ul>{p.attention.length>8?<button className="studio-workbench-link" onClick={()=>setAll(v=>!v)}>{all?'Show less':`Show all (${p.attention.length})`}</button>:null}</section>:null}
    {p.publishedCount>0?<section aria-labelledby="studio-reads"><h2 id="studio-reads">Reads this week</h2>{p.week?<button className="studio-reads-card" onClick={p.onReads}><span><strong>{p.week.opened}</strong> opened</span><span><strong>{p.week.finished}</strong> read to the end</span><span><strong>{p.week.saved}</strong> pages saved</span>{p.week.top?<small>Top project · {p.week.top.title}</small>:null}</button>:<p className="studio-workbench-note">Reads could not load.</p>}</section>:null}
    {p.material.length?<section aria-labelledby="studio-material"><div className="studio-section-title"><h2 id="studio-material">Material</h2><button onClick={p.onBookmarks}>All bookmarks →</button></div><p className="studio-material-caption">Reference for your next project.</p><div className="studio-material-strip">{p.material.slice(0,3).map(item=><button key={item.id} onClick={()=>p.onMaterial(item)} aria-label={`Open reference ${item.title}`}><span><ProjectCover source={item.source??item.view.project.cover} thumbnail={item.source?undefined:item.view.project.coverThumbnail} kind={item.source?item.kind:item.view.project.coverKind} pageNumber={item.pageNumber} alt={item.title} sizes="120px" /></span><small>{item.title}</small></button>)}</div></section>:null}
   </>}
  </div>
  {menu?<StudioActionSheet title={menu.project.title} actions={[{id:'not-now',label:'Not now',icon:PauseIcon,onAction:()=>{p.onDismiss(menu.projectId);setMenu(null);}}]} onClose={()=>setMenu(null)}/>:null}
 </section>;
}
