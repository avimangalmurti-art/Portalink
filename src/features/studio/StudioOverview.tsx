import React,{useEffect,useState} from 'react';
import type {Profile} from '../../types/domain';
import type {DraftResume} from './workbenchModel';
import {useReferences} from '../references/useReferences';
import {weekStart} from '../references/model';
import {ExportSheet} from '../references/ExportSheet';
import '../references/references.css';
export function StudioOverview({profile,draft,draftsUnavailable=false,onContinue,onNew}:{profile:Profile;draft:DraftResume|null;draftsUnavailable?:boolean;onContinue:(draft:DraftResume)=>void;onNew:()=>void}){
 const {weekReferenceCount}=useReferences();
 const [references,setReferences]=useState<number|null>(null),[error,setError]=useState(''),[exportMode,setExportMode]=useState<'bibliography'|'portfolio'|null>(null),start=weekStart();
 useEffect(()=>{let live=true;setReferences(null);setError('');void weekReferenceCount(profile.id,start).then(count=>{if(live)setReferences(count);}).catch(()=>{if(live)setError('This week’s references could not be loaded.');});return()=>{live=false;};},[profile.id,start,weekReferenceCount]);
 const published=profile.projects.filter(project=>project.publishedAt&&Date.parse(project.publishedAt)>=Date.parse(start)).length;
 return <section className="studio-overview" aria-label="Studio Overview"><section><h2>Continue</h2>{draft?<><p>{draft.metadata.title?.trim()||'Untitled draft'}</p><button data-ui-shape="action" data-control-size="md" onClick={()=>onContinue(draft)}>Continue draft</button></>:draftsUnavailable?<p>Drafts could not be loaded.</p>:<button data-ui-shape="action" data-control-size="md" onClick={onNew}>Add work</button>}</section><section><h2>This week</h2><p>{published} {published===1?'work':'works'} published · {references===null?'…':references} references added</p>{error&&<p role="status">{error}</p>}</section><section><h2>Export</h2><div className="studio-overview-export"><button data-ui-shape="action" data-control-size="md" onClick={()=>setExportMode('bibliography')}>Bibliography</button><button data-ui-shape="action" data-control-size="md" onClick={()=>setExportMode('portfolio')}>Catalogue PDF</button></div></section>{exportMode&&<ExportSheet profileId={profile.id} initial={exportMode} onClose={()=>setExportMode(null)}/>}</section>;
}
