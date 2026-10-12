import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../../contexts/AuthContext';
import {useProfileData} from '../../contexts/ProfileDataContext';
import {recordApi,type RecordApi} from './service';
import {awayThreeDays,recordHref,confirmedPublicPreview,type RecordRow,type RecordStatus,type OwnerEvent} from './model';
type Value={status:RecordStatus|null;error:string;away:boolean;refresh:()=>void;remember:(event:OwnerEvent['event'],key:string)=>Promise<void>;open:(row:RecordRow)=>void};
const Context=createContext<Value|null>(null);
export function OwnerRecordProvider({children,api=recordApi}:{children:React.ReactNode;api?:RecordApi}){
 const auth=useAuth(),{revision,peekProfile,fetchProfile}=useProfileData(),location=useLocation(),navigate=useNavigate();
 const id=auth.viewerProfileId,account=auth.user?.id,identity=account+':'+id;
 const eligible=Boolean(account&&id&&!/^\/(share|@)/.test(location.pathname));
 const [loaded,setLoaded]=useState<{identity:string;status:RecordStatus;away:boolean;entry:number}|null>(null),[error,setError]=useState(''),[refreshCount,setRefreshCount]=useState(0),[entry,setEntry]=useState(0);
 const current=useRef(identity);current.current=identity;const visits=useRef(new Map<string,number>()),pendingVisit=useRef(new Set<string>());
 const refresh=useCallback(()=>setRefreshCount(value=>value+1),[]);
 useEffect(()=>{if(!eligible||!id){setLoaded(null);setError('');return;}const controller=new AbortController();setError('');void api.status(id,controller.signal,true).then(async status=>{if(controller.signal.aborted||current.current!==identity)return;setLoaded(previous=>({identity,status,entry,away:previous?.identity===identity&&previous.entry===entry?previous.away:awayThreeDays(status,Date.parse(status.generatedAt))}));if(pendingVisit.current.has(identity)||Date.now()-(visits.current.get(identity)??0)>=300000){pendingVisit.current.delete(identity);visits.current.set(identity,Date.now());try{await api.event(id,'visit','main');}catch{visits.current.delete(identity);}}}).catch(()=>{if(!controller.signal.aborted&&current.current===identity){setLoaded(null);setError('Your record could not load. Try again.');}});return()=>controller.abort();},[eligible,id,identity,api,revision,refreshCount,entry,location.pathname]);

 // Latest presence is private input to the away gate, not a completion flag.
 // Refresh before writing on return, so other-device activity is respected.
 useEffect(()=>{
  if(!eligible||!id)return;
  const wake=()=>{if(document.visibilityState!=='visible'||Date.now()-(visits.current.get(identity)??Date.now())<300000)return;visits.current.set(identity,Date.now());pendingVisit.current.add(identity);setEntry(value=>value+1);refresh();};
  const activity=()=>{if(document.visibilityState!=='visible')return;const previous=visits.current.get(identity);if(previous===undefined||Date.now()-previous<300000)return;if(Date.now()-previous>=3*86400000){wake();return;}visits.current.set(identity,Date.now());void api.event(id,'visit','main').catch(()=>undefined);};
  document.addEventListener('visibilitychange',wake);window.addEventListener('pointerdown',activity,{passive:true});window.addEventListener('keydown',activity);
  return()=>{document.removeEventListener('visibilitychange',wake);window.removeEventListener('pointerdown',activity);window.removeEventListener('keydown',activity);};
 },[eligible,id,identity,api,refresh]);
 const remember=useCallback(async(event:OwnerEvent['event'],key:string)=>{if(!eligible||!id)throw new Error('Sign in to update your record.');await api.event(id,event,key);if(current.current===identity)refresh();},[eligible,id,identity,api,refresh]);
 const open=useCallback((row:RecordRow)=>{
  if(!id||!eligible)return;
  if(row.field!=='preview'){const target=new URL(recordHref(id,row),window.location.origin);target.searchParams.set('entry',crypto.randomUUID());navigate(target.pathname+target.search+target.hash);return;}
  const popup=window.open('/share/'+id,'_blank');
  if(!popup){setError('Allow a new tab to preview your link.');return;}
  let observer:MutationObserver|undefined,finished=false;
  const stop=()=>{finished=true;observer?.disconnect();clearTimeout(timer);};
  const check=()=>{if(finished||current.current!==identity)return stop();try{const heading=popup.document.querySelector('h1'),profile=peekProfile(id);if(heading&&profile&&confirmedPublicPreview({path:popup.location.pathname,resolvedProfileId:popup.__PORTALINK_HANDLE__?.profileId,heading:heading.textContent??'',hidden:Boolean(heading.closest('[inert],[aria-hidden=true]')||popup.document.querySelector('.public-welcome-dialog'))},id,profile.name)){stop();void remember('previewed','profile').catch(()=>setError('Your preview step could not be saved.'));}}catch{stop();}};
  const timer=window.setTimeout(stop,60000);
  void fetchProfile(id).then(check).catch(stop);
  popup.addEventListener('load',()=>{try{observer=new MutationObserver(check);observer.observe(popup.document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['inert','aria-hidden']});check();}catch{stop();}},{once:true});
 },[id,eligible,navigate,peekProfile,fetchProfile,identity,remember]);
 useEffect(()=>{const shared=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.profileId===id&&['copy','share'].includes(detail.kind))void remember('shared','profile').catch(()=>setError('Your shared-link step could not be saved.'));};window.addEventListener('portalink:portfolio-shared',shared);return()=>window.removeEventListener('portalink:portfolio-shared',shared);},[id,remember]);
 const value=useMemo(()=>({status:eligible&&loaded?.identity===identity?loaded.status:null,error:eligible?error:'',away:eligible&&loaded?.identity===identity?loaded.away:false,refresh,remember,open}),[eligible,loaded,identity,error,refresh,remember,open]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useOwnerRecord(){return useContext(Context);}
