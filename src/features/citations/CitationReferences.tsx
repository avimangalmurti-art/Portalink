import React,{useEffect,useState} from 'react';
import { listCitations,removeCitation,resolveCitationItem,publicCitedIn,citingProjectPath,type CitingProject } from './service';
import { citationPath,type CitationItem,type CitationRecord } from './model';
import './citations.css';
export function CitationReferences({projectId,owner=false}:{projectId:string;owner?:boolean}) {
 const [rows,setRows]=useState<Array<{citation:CitationRecord;item:CitationItem|null}>>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState<string|null>(null);
 useEffect(()=>{let live=true;listCitations({projectId}).then(records=>Promise.all(records.map(async citation=>({citation,item:await resolveCitationItem(citation.cited_item_id)})))).then(result=>{if(live)setRows(result);}).catch(()=>{if(live)setError('References could not be loaded.');});return()=>{live=false;};},[projectId,revision]);
 if(!rows.length&&!error)return null;
 return <section id="references" aria-label="References"><h2>References</h2>{error&&<p role="status">{error}</p>}<div className="citation-rows">{rows.map(({citation,item})=><div className="citation-row" key={citation.id}>{(item?.sourceUrl||item?.coverSourceUrl)&&<img src={item.sourceUrl||item.coverSourceUrl} alt=""/>}{item?<a href={citationPath(item.id)}><strong>{item.projectTitle}</strong><small>{item.creator} · {item.kind==='page'?'Page':'Image'} {item.number}</small>{citation.note&&<p>{citation.note}</p>}</a>:<span>Reference unavailable</span>}{owner&&<button disabled={busy===citation.id} onClick={async()=>{setBusy(citation.id);try{await removeCitation(citation.id);setRevision(v=>v+1);}catch{setError('Reference could not be removed.');}finally{setBusy(null);}}}>Remove</button>}</div>)}</div></section>;
}
export function CitedIn({itemId}:{itemId:string}) {
 const [rows,setRows]=useState<Array<{citation:CitationRecord;project:CitingProject}>>([]),[open,setOpen]=useState(false);
 useEffect(()=>{let live=true;publicCitedIn(itemId).then(data=>{if(live)setRows(data.map(row=>({citation:{id:row.id,created_at:row.created_at} as CitationRecord,project:row.project})));}).catch(()=>undefined);return()=>{live=false;};},[itemId]);
 if(!rows.length)return null;
 return <section><button onClick={()=>setOpen(v=>!v)} aria-expanded={open}>Cited in {rows.length} {rows.length===1?'project':'projects'}</button>{open&&<ul>{rows.map(({citation,project})=><li key={citation.id}><a href={citingProjectPath(project)}>{project.title} · {project.creator}</a><time>{citation.created_at.slice(0,10)}</time></li>)}</ul>}</section>;
}
