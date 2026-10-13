import { imageDimensions } from '../presentation/motion/imageDimensions';
import { ImageMotion } from '../presentation/motion/ImageMotion';
import { LoadingSkeleton } from '../components/ui/StateViews';
import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {readPublicCitation,readCitationAppearance,readCitedIn} from './publicRead';
import {plainCitation,bibCitation,type CitationItem} from '../features/citations/model';
import { CitationCards } from './CitationCards';
import { RouteError, routeErrorKind, type RouteErrorKind } from '../components/ui/RouteError';
import type { PublicAppearance } from '../types/domain';
import '../features/citations/citations.css';
import './citation-entry.css';
const CitationPagePreview=lazy(()=>import('./CitationDocument'));
const CitationInteraction=lazy(()=>import('./CitationInteraction'));
declare global { interface Window { __PORTALINK_CITATION_ERROR__?: 'not-found' | 'network'; } }
function CitationApp(){
 const [item,setItem]=useState<CitationItem|null>(null),[phase,setPhase]=useState<'loading'|'ready'|RouteErrorKind>('loading'),[open,setOpen]=useState(false),[status,setStatus]=useState('');
 const [previewSize,setPreviewSize]=useState<{width:number;height:number}|null>(null);
 const [appearance,setAppearance]=useState<PublicAppearance|null>(null);
 useEffect(()=>{if(window.__PORTALINK_CITATION_ERROR__){setPhase(window.__PORTALINK_CITATION_ERROR__);return;}let live=true;let id:string;try{id=decodeURIComponent(location.pathname.slice(6));if(!id)throw Error();}catch{setPhase('not-found');return;}
 readPublicCitation(id).then(async result=>{if(!live)return;if(!result){setPhase('not-found');return;}setItem(result);
 const [style,size]=await Promise.all([readCitationAppearance(result.creatorId).catch(()=>null),result.sourceUrl?imageDimensions(result.sourceUrl):Promise.resolve(null)]);if(live){setPreviewSize(size);setAppearance(style);setPhase('ready');}
 }).catch(error=>{if(live)setPhase(routeErrorKind(error instanceof Error ? error.message : null));});return()=>{live=false;};},[]);
 const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)'),update=()=>setSystemDark(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const theme=appearance?.mode==='auto' ? (systemDark?'dark':'light') : appearance?.mode??'dark';
 useEffect(()=>{document.documentElement.style.colorScheme=theme;document.title=item?`${item.projectTitle} — Citation | Portalink`:'Citation | Portalink';},[theme,item]);
 const [cited,setCited]=useState<Awaited<ReturnType<typeof readCitedIn>>>([]);
 useEffect(()=>{if(!item)return;let live=true;void readCitedIn(item.id).then(rows=>{if(live)setCited(rows);}).catch(()=>undefined);if(new URLSearchParams(location.search).get('cite')==='1'||sessionStorage.getItem('portalink:cite-intent')===item.id){sessionStorage.removeItem('portalink:cite-intent');setOpen(true);}return()=>{live=false;};},[item]);
 const copy=async(bib:boolean)=>{if(!item)return;try{await navigator.clipboard.writeText(bib?bibCitation(item,PUBLIC_ORIGIN):plainCitation(item,PUBLIC_ORIGIN));setStatus('Citation copied.');}catch{setStatus('Citation could not be copied.');}};
 const share=async()=>{if(!item)return;try{if(navigator.share)await navigator.share({url:location.href,title:item.projectTitle});else{await navigator.clipboard.writeText(location.href);setStatus('Link copied.');}}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setStatus('Link could not be shared.');}};
 return <main className="app-shell citation-entry" data-theme={theme}><ImageMotion/>{phase==='loading'?<LoadingSkeleton label="Loading citation…"/>:phase!=='ready'?<RouteError kind={phase} onBack={()=>history.length>1?history.back():location.assign('/')} onHome={()=>location.assign('/')} />:item&&<><CitationCards item={item} onCopy={bib=>void copy(bib)} onCite={()=>setOpen(true)} onShare={()=>void share()} status={status}
 preview={item.sourceUrl?<img src={item.sourceUrl} width={previewSize?.width} height={previewSize?.height} alt={`${item.projectTitle}, ${item.kind} ${item.number}`}/>:item.kind==='page'?<Suspense fallback={<LoadingSkeleton kind="reader" label="Loading page…"/>}><CitationPagePreview item={item}/></Suspense>:<p>Image preview is not available.</p>}
 citedIn={cited.length>0?<section className="citation-cited-card"><h2>Cited in {cited.length} {cited.length===1?'project':'projects'}</h2><ul>{cited.map(row=><li key={row.id}><a href={`/share/${encodeURIComponent(row.project.profileId)}/c/${encodeURIComponent(row.project.categoryId)}/${encodeURIComponent(row.project.id)}`}>{row.project.title} · {row.project.creator}</a><time>{row.created_at.slice(0,10)}</time></li>)}</ul></section>:null}/>{open&&<Suspense fallback={<LoadingSkeleton label="Opening Cite…"/>}><CitationInteraction item={item} onClose={()=>setOpen(false)}/></Suspense>}</>}</main>;
}
const root=document.getElementById('root');if(root)createRoot(root).render(<CitationApp/>);
