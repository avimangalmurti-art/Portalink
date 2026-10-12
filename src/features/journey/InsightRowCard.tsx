import React,{useRef} from 'react';
import {ModalPortal} from '../../components/ui/ModalPortal';
import {useModalFocus} from '../../hooks/useModalFocus';
import type {WorkInsight} from './insightsModel';
import {InsightMetrics} from './InsightMetrics';
export function InsightRowCard({title,work,onClose}:{title:string;work:WorkInsight|undefined;onClose:()=>void}){
 const ref=useRef<HTMLElement>(null);useModalFocus(true,ref,onClose);const weeks=work?.weeks??[],maximum=Math.max(1,...weeks.map(row=>row.reads??0));
 return <ModalPortal><div className="journey-insight-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="journey-insight-card-title" className="journey-insight-card"><header><h2 id="journey-insight-card-title">{title}</h2><button type="button" aria-label="Close work Insights" onClick={onClose}>×</button></header><InsightMetrics work={work}/><p className="journey-insight-note">Read depth: median furthest page reached. Time on page is not available.</p><h3>Reads · last 12 weeks</h3>{weeks.some(row=>row.reads!==null)?<svg viewBox="0 0 264 64" role="img" aria-label="Reads over the last 12 weeks">{weeks.map((row,index)=>row.reads===null?null:<React.Fragment key={row.week}>{index>0&&weeks[index-1].reads!==null&&<line x1={(index-1)*24} y1={56-(weeks[index-1].reads??0)/maximum*48} x2={index*24} y2={56-row.reads/maximum*48}/>}<circle cx={index*24} cy={56-row.reads/maximum*48} r="2"><title>{row.week}: {row.reads} reads</title></circle></React.Fragment>)}</svg>:<p>—</p>}<p className="journey-insight-note">Reads use available daily history. A gap means no recorded data.</p></section></div></ModalPortal>;
}
