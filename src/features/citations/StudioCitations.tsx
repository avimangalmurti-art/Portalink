import {ReferencesTab} from '../references/ReferencesTab';
import {ArrowLeftIcon} from 'lucide-react';
import {InterfaceIcon} from '../../components/ui/InterfaceIcon';
import {usePresentation} from '../../presentation/usePresentation';
import {StudioEmptyState} from '../studio/StudioEmptyState';
import React,{useEffect,useState} from 'react';
import {useAuth} from '../../contexts/AuthContext';
import {StudioRow} from '../studio/StudioRow';
import {StudioActionSheet} from '../studio/StudioActionSheet';
import {citationProject,citingProjectPath,listCitations,removeCitation,resolveCitationItem,type CitingProject} from './service';
import {citationPath,type CitationItem,type CitationRecord} from './model';
export type StudioCitationRow={citation:CitationRecord;item:CitationItem|null;project:CitingProject|null};
type CitationListProps = {mode:'cited'|'references';onBack:()=>void};
export function StudioCitations(props:CitationListProps & {headerHost?:HTMLElement|null}) {return props.mode==='references'?<ReferencesTab headerHost={props.headerHost}/>:<CitationList mode={props.mode} onBack={props.onBack}/>;}
function CitationList({mode,onBack}:CitationListProps) {
 const mobile=usePresentation()==='mobile';
 const auth=useAuth(),[rows,setRows]=useState<StudioCitationRow[]>([]),[phase,setPhase]=useState('loading'),[revision,setRevision]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(''),[menu,setMenu]=useState<StudioCitationRow|null>(null);
 useEffect(()=>{if(!auth.viewerProfileId)return;let live=true;setPhase('loading');listCitations(mode==='cited'?{incoming:auth.viewerProfileId}:{outgoing:auth.viewerProfileId}).then(records=>Promise.all(records.map(async citation=>({citation,item:await resolveCitationItem(citation.cited_item_id),project:await citationProject(citation.citing_project_id)})))).then(data=>{if(live){setRows(data);setPhase('ready');}}).catch(()=>{if(live)setPhase('error');});return()=>{live=false;};},[mode,auth.viewerProfileId,revision]);
 const grouped=mode==='references'?[...new Map(rows.map(row=>[row.citation.citing_project_id,rows.filter(r=>r.citation.citing_project_id===row.citation.citing_project_id)])).values()]:[rows];
 const remove=async(id:string)=>{if(busy)return;setBusy(id);setError('');try{await removeCitation(id);setRevision(v=>v+1);setMenu(null);}catch{setError('Reference could not be removed.');}finally{setBusy('');}};
 const href=(row:StudioCitationRow)=>mode==='cited'&&row.project?citingProjectPath(row.project):row.item?citationPath(row.item.id):undefined;
 const actions=(row:StudioCitationRow)=>[...(href(row)?[{id:'open',label:'Open',onAction:()=>location.assign(href(row)!)}]:[]),...(mode==='references'?[{id:'remove',label:'Remove reference',destructive:true,disabled:Boolean(busy),onAction:()=>void remove(row.citation.id)}]:[])];
 const content=<>{phase==='loading'?<p>Loading…</p>:phase==='error'?<p role="alert">Citations could not be loaded.</p>:!rows.length?<StudioEmptyState kind={mode}/>:grouped.map((group,i)=><section key={i}>{mode==='references'&&<h3>{group[0]?.project?.title??'Project unavailable'}</h3>}<ul>{group.map(row=><StudioRow key={row.citation.id} id={row.citation.id} title={mode==='cited'?row.project?.creator??'Project unavailable':row.item?.creator??'Reference unavailable'} secondary={[row.item?`${row.item.kind==='page'?'Page':'Image'} ${row.item.number} of ${row.item.projectTitle}`:'Reference unavailable',mode==='cited'&&row.project?`in «${row.project.title}»`:'',row.citation.note??''].filter(Boolean).join(' · ')} date={row.citation.created_at.slice(0,10)} leading={(row.item?.sourceUrl||row.item?.coverSourceUrl)?<img src={row.item.sourceUrl||row.item.coverSourceUrl} alt=""/>:undefined} selecting={false} selected={false} onSelect={()=>undefined} pending={busy===row.citation.id} onOpen={href(row)?()=>location.assign(href(row)!):undefined} actions={actions(row)} onMenu={()=>setMenu(row)}/>)}</ul></section>)}{error&&<p role="alert">{error}</p>}</>;
 return <section className={`studio-citations-list${mobile?'':' mobile-studio'}`} aria-label={mode==='cited'?'Cited':'References'}>
  {mobile?<h2>{mode==='cited'?'Cited':'References'}</h2>:<header className="studio-header">
   <div className="studio-bookmarks-navigation">
    <button type="button" className="studio-bookmarks-back" data-ui-shape="action" aria-label="Back from Cited" onClick={onBack}>
     <InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl/> Back
    </button>
   </div>
   <div className="studio-heading"><h1 className="studio-title">{mode==='cited'?'Cited':'References'}</h1></div>
  </header>}
  {mobile?content:<div className="studio-content" data-studio-scroll="">{content}</div>}
  {menu&&<StudioActionSheet title={mode==='cited'?'Cited':'References'} actions={actions(menu)} onClose={()=>{if(!busy)setMenu(null);}}/>}
 </section>;
}
