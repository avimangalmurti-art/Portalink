import React,{useCallback} from 'react';
import { useNavigate,useSearchParams } from 'react-router-dom';
import { useServices } from '../../contexts/ServicesContext';
import { useAccountQuery } from '../library/useAccountQuery';
import { bucketReach,dropSentence,type ReachSummary } from './readSignal';
import { PdfPage } from '../../components/media/PdfPage';
import { Button } from '../../components/ui/Button';
import './reads.css';
const labels:Record<string,string>={'own-link':'Your link',messages:'Messages',linkedin:'LinkedIn',other:'Other'};
function Count({label,value}:{label:string;value:number}){return <div><dd>{value.toLocaleString()}</dd><dt>{label}</dt></div>;}
export function ReadsList(){
  const {reads}=useServices(),navigate=useNavigate();
  const load=useCallback(()=>reads?reads.list():Promise.reject(new Error('Reads are not available yet.')),[reads]);
  const state=useAccountQuery(load);
  return <section className="reads-view" aria-label="Project reads"><h2>Reads</h2><p>Anonymous reach over the last 30 days. Only you can see this.</p>{state.loading?<p role="status">Loading Reads…</p>:state.error?<p>Reads are not available yet.</p>:<ul className="reads-project-list">{state.data?.map(row=><li key={row.projectId}><button onClick={()=>navigate(`/insights?project=${row.projectId}`)}><strong>{row.title}</strong><span>{row.opened} opened · {row.finished} read to the end</span></button></li>)}</ul>}</section>;
}
export function ReadsProject({projectId}:{projectId:string}){
  const {reads}=useServices(),[params,setParams]=useSearchParams();const page=params.has('page')?Number(params.get('page')):null;
  const load=useCallback(()=>reads?reads.summary(projectId):Promise.reject(new Error('Reads are not available yet.')),[reads,projectId]);const state=useAccountQuery(load);
  if(state.loading)return <p role="status" className="reads-view">Loading Reads…</p>;
  if(state.error||!state.data)return <div className="reads-view"><p role="alert">Reads could not be loaded. Only the project owner can see them.</p><Button onClick={state.retry}>Try again</Button></div>;
  const row=state.data;if(page!==null&&Number.isInteger(page)&&page>=0&&page<row.pageCount)return <ReadPageDetail summary={row} page={page} onBack={()=>setParams({project:projectId})}/>;
  const sentence=dropSentence(row.reach),bars=bucketReach(row.reach,row.savedByPage),max=Math.max(1,...row.reach);
  return <section className="reads-view" aria-label={`Reads for ${row.title}`}><h2>{row.title}</h2><p>Last 30 days · Only you can see this</p><dl className="reads-counts"><Count label="opened" value={row.opened}/><Count label="read to the end" value={row.finished}/><Count label="saved a page" value={row.saved}/></dl>
    <section className="reads-chart"><header><h3>How far people read</h3><span>{row.pageCount} pages</span></header><div className="reads-bars" role="group" aria-label="Page reach">{bars.map(bar=><button key={bar.start} className={bar.highlighted?'is-most-saved':''} style={{height:`${Math.max(4,bar.count/max*100)}%`}} onClick={()=>setParams({project:projectId,page:String(bar.detailPage)})} aria-label={`${bar.start===bar.end?`Page ${bar.start+1}`:`Pages ${bar.start+1}–${bar.end+1}`}: ${bar.count} reached${bar.highlighted?', most-saved page':''}`} />)}</div><div className="reads-axis"><span>p.1</span><span>p.{row.pageCount}</span></div>{row.pageCount>40&&<p>Bars group pages; each bar counts readers reaching its first page.</p>}{sentence&&<p>{sentence}</p>}
      <label className="reads-page-picker">Inspect a page <select value="" onChange={event=>setParams({project:projectId,page:event.target.value})}><option value="" disabled>Choose page</option>{row.pages.map(p=><option value={p.page} key={p.page}>Page {p.page+1}</option>)}</select></label>
    </section><h3>Where they came from</h3><dl className="reads-referrers">{Object.entries(labels).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{row.refs[key]??0}</dd></div>)}</dl><ReadPrivacy/></section>;
}
function ReadPrivacy(){return <p className="reads-privacy">Visitors are counted, never identified. A tab can count again on another day or after reload. Saves and comments are current totals; only members who share a save with you or comment are named.</p>;}
function ReadPageDetail({summary,page,onBack}:{summary:ReachSummary;page:number;onBack:()=>void}){
  const {reads,projects}=useServices(),navigate=useNavigate();const target=summary.pages[page];
  const load=useCallback(async()=>{if(!reads)throw new Error('Reads unavailable');const [detail,view]=await Promise.all([reads.detail(summary.projectId,page),projects.getProjectView(summary.projectId)]);return{detail,view};},[reads,projects,summary.projectId,page]);const state=useAccountQuery(load);
  const attachment=state.data?.view.project.attachments?.find(a=>a.id===target.attachmentId);
  const rendered=attachment?.metadata?.renderedPages?.[target.pageIndex];
  const path=`/p/${summary.profileId}/c/${summary.categoryId}/${summary.projectId}?${new URLSearchParams({media:target.attachmentId,page:String(target.pageIndex+1)})}`;
  return <section className="reads-view" aria-label={`Page ${page+1} reads`}><Button variant="secondary" onClick={onBack}>Back to Reads</Button><h2>Page {page+1} · {summary.title}</h2>{state.loading?<p role="status">Loading page…</p>:state.error?<p role="alert">This page’s Reads could not be loaded.</p>:state.data&&<>
    <button className="reads-page-preview" onClick={()=>navigate(path)} aria-label={`Open page ${page+1}`}>{rendered?.sourceUrl?<img src={rendered.sourceUrl} alt={`Page ${page+1}`}/>:attachment?.kind==='document'&&attachment.sourceUrl?<PdfPage source={attachment.sourceUrl} pageNumber={target.pageIndex+1} label={`Page ${page+1}`} />:attachment?.kind==='image'&&attachment.sourceUrl?<img src={attachment.sourceUrl} alt={`Page ${page+1}`}/>:<span>Open this page</span>}</button>
    <dl className="reads-counts"><Count label="saved this page" value={state.data.detail.saved}/><Count label="comments" value={state.data.detail.comments}/><Count label="reached it" value={state.data.detail.reached}/></dl>
    <ul className="reads-actors">{state.data.detail.actors.map(actor=><li key={actor.id}><strong>{actor.name}</strong> {actor.action==='save'?'shared a save of this page':'commented'}<time>{new Date(actor.at).toLocaleDateString()}</time>{actor.body&&<p>{actor.body}</p>}</li>)}</ul><ReadPrivacy/></>}</section>;
}
