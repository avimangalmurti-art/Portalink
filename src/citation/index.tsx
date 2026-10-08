import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
import '../index.css';
import { AppPresentationProvider } from '../presentation/AppPresentation';
import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {ServicesProvider} from '../contexts/ServicesContext';
import {AuthProvider,useAuth} from '../contexts/AuthContext';
import {visitorServices} from '../services/visitorServices';
import {resolveCitationItem} from '../features/citations/service';
import {CiteSheet} from '../features/citations/CiteSheet';
import {CitedIn} from '../features/citations/CitationReferences';
import {plainCitation,bibCitation,type CitationItem} from '../features/citations/model';
import '../features/citations/citations.css';
const CitationPagePreview=lazy(()=>import('../features/citations/CitationPagePreview'));
const AuthDialog=lazy(()=>import('../features/auth/AuthDialog').then(m=>({default:m.AuthDialog})));
function CitationApp(){const auth=useAuth(),[item,setItem]=useState<CitationItem|null>(null),[phase,setPhase]=useState('loading'),[open,setOpen]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>{let live=true;let id:string;try{id=decodeURIComponent(location.pathname.slice(6));}catch{setPhase('not-found');return;}
 resolveCitationItem(id,true).then(result=>{if(live){setItem(result);setPhase(result?'ready':'not-found');}}).catch(()=>{if(live)setPhase('error');});return()=>{live=false;};},[]);
 useEffect(()=>{if(item&&auth.isAuthenticated&&auth.viewerProfileId&&(sessionStorage.getItem('portalink:cite-intent')===item.id||new URLSearchParams(location.search).get('cite')==='1')){sessionStorage.removeItem('portalink:cite-intent');history.replaceState(null,'',location.pathname);setOpen(true);}},[item,auth.isAuthenticated,auth.viewerProfileId]);
 const copy=async(bib:boolean)=>{if(!item)return;try{await navigator.clipboard.writeText(bib?bibCitation(item,PUBLIC_ORIGIN):plainCitation(item,PUBLIC_ORIGIN));setStatus('Citation copied.');}catch{setStatus('Citation could not be copied.');}};
 return <main className="app-shell citation-entry">{phase==='loading'?<p>Loading…</p>:phase==='not-found'?<h1>Not found</h1>:phase==='error'?<p role="alert">Citation could not be loaded.</p>:item&&<><h1>{item.projectTitle}</h1>{item.citable&&<span className="citation-badge">Citable</span>}{item.sourceUrl?<img src={item.sourceUrl} alt={`${item.projectTitle}, ${item.kind} ${item.number}`}/>:item.kind==='page'?<Suspense fallback={<p>Loading page…</p>}><CitationPagePreview item={item}/></Suspense>:<p>Image preview is not available.</p>}<blockquote>{plainCitation(item,PUBLIC_ORIGIN)}</blockquote>{!item.citable&&<p>View only. The creator has not permitted AI retrieval or reproduction.</p>}<div className="citation-entry-actions">{item.citable&&<><button onClick={()=>void copy(false)}>Copy citation — Plain text</button><button onClick={()=>void copy(true)}>Copy citation — BibTeX</button></>}{auth.viewerProfileId!==item.creatorId&&<button onClick={()=>setOpen(true)}>Cite</button>}<button onClick={()=>void navigator.share?.({url:location.href,title:item.projectTitle})}>Share</button></div>{status&&<p role="status">{status}</p>}<CitedIn itemId={item.id}/>{open&&<CiteSheet item={item} onClose={()=>setOpen(false)}/>}</>}{auth.pendingView&&<Suspense fallback={null}><AuthDialog accentColor="#ff2d64" onAccentColorChange={()=>undefined} highContrast={false} onHighContrastChange={()=>undefined} reduceTranslucency={false} onReduceTranslucencyChange={()=>undefined} registrationReturnPath={location.pathname+location.search} /></Suspense>}</main>;
}
const root=document.getElementById('root');if(root)createRoot(root).render(<BrowserRouter><ServicesProvider services={visitorServices}><AuthProvider><AppPresentationProvider><CitationApp/></AppPresentationProvider></AuthProvider></ServicesProvider></BrowserRouter>);
