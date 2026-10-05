import { MobileContextButton } from '../../presentation/mobile/MobileContextActions';
import React, { useState } from 'react';
import { PauseIcon } from 'lucide-react';
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
export function StudioWorkbenchHeader({onBookmarks,onReads,workspace}:{onBookmarks:()=>void;onReads:()=>void;workspace?:WorkbenchViewProps}) {
 return <header className="studio-workbench-header"><div className="studio-drafts-heading studio-hub-heading"><h1>Studio</h1><div data-inline-screen-actions=""><MobileContextButton /></div></div>
   <nav className="studio-hub-navigation" aria-label="Studio sections">
    {workspace && <>
      <button type="button" onClick={workspace.onContinue} disabled={!workspace.draft || workspace.draftsUnavailable}><strong>Continue</strong></button>
      <button type="button" onClick={onReads}><strong>Reads this week</strong></button>
    </>}
    <button type="button" onClick={onBookmarks}><strong>Bookmarks</strong></button>
    <button type="button" onClick={onReads}><strong>Insights</strong></button>
   </nav>
  </header>;
}
export function StudioWorkbenchView(p:WorkbenchViewProps){
 const [all,setAll]=useState(false),[menu,setMenu]=useState<Attention|null>(null);
 const allDone=!p.partial&&!p.attention.length&&!p.material.length&&!(p.week?.opened||p.week?.finished||p.week?.saved)&&p.draftCount<=1;
 return <section className="mobile-studio studio-workbench" data-mobile-studio="" aria-label="Studio">
  <StudioWorkbenchHeader onBookmarks={p.onBookmarks} onReads={p.onReads} workspace={p} />
  <div className="studio-workbench-scroll">
   {p.draftCount>1?<button className="studio-other-drafts" onClick={p.onDrafts}>Other drafts ({p.draftCount-1}) <span aria-hidden="true">→</span></button>:null}
   {p.partial?<p className="studio-workbench-note" role="status">Some workspace information could not load. Unavailable numbers are hidden.{p.onRetry?<button className="studio-workbench-link" onClick={p.onRetry}>Try again</button>:null}</p>:null}
   {allDone?<p className="studio-workbench-note" data-studio-all-done="">Nothing needs your attention.</p>:<>
    {p.attention.length?<section aria-labelledby="studio-attention"><div className="studio-section-title"><h2 id="studio-attention">Needs attention</h2>{p.attention.length>5?<button type="button" aria-expanded={all} className="studio-workbench-link" onClick={()=>setAll(v=>!v)}>{all?'Show less':`Show all (${p.attention.length})`}</button>:null}</div><ul className="studio-attention-list inset-row-group inset-row-group-icons">{visibleAttention(p.attention,all).map(row=><StudioRow key={row.id} id={row.id} title={row.project.title} secondary={row.gap} actionLabel={row.label} leading={<ProjectCover source={row.project.cover} thumbnail={row.project.coverThumbnail} alt={row.project.coverAlt||row.project.title} kind={row.project.coverKind} frame={row.project.coverFrame} sizes="44px" allowPdfFallback={false} allowVideoFallback={false} />} selecting={false} selected={false} onSelect={()=>p.onAttention(row)} onOpen={()=>p.onAttention(row)} actions={[]} onMenu={()=>setMenu(row)} />)}</ul></section>:null}
    {p.material.length?<section aria-labelledby="studio-material"><div className="studio-section-title"><h2 id="studio-material">Material</h2><button onClick={p.onBookmarks}>All bookmarks →</button></div><p className="studio-material-caption">Reference for your next project.</p><div className="studio-material-strip">{p.material.slice(0,3).map(item=><button key={item.id} onClick={()=>p.onMaterial(item)} aria-label={`Open reference ${item.title}`}><span><ProjectCover source={item.source??item.view.project.cover} thumbnail={item.source?undefined:item.view.project.coverThumbnail} kind={item.source?item.kind:item.view.project.coverKind} pageNumber={item.pageNumber} alt={item.title} sizes="120px" /></span><small>{item.title}</small></button>)}</div></section>:null}
   </>}
  </div>
  {menu?<StudioActionSheet title={menu.project.title} actions={[{id:'not-now',label:'Not now',icon:PauseIcon,onAction:()=>{p.onDismiss(menu.projectId);setMenu(null);}}]} onClose={()=>setMenu(null)}/>:null}
 </section>;
}

