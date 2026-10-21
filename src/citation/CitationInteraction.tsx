import '../index.css';
import React,{lazy,Suspense,useEffect,useState} from 'react';
import {BrowserRouter} from 'react-router-dom';
import {ServicesProvider} from '../contexts/ServicesContext';
import {AuthProvider,useAuth} from '../contexts/AuthContext';
import {visitorServices} from '../services/visitorServices';
import {AppPresentationProvider} from '../presentation/AppPresentation';
import {CiteSheet} from '../features/citations/CiteSheet';
import type {CitationItem} from '../features/citations/model';
const AuthDialog=lazy(()=>import('../features/auth/AuthDialog').then(m=>({default:m.AuthDialog})));
function Interaction({item,onClose}:{item:CitationItem;onClose:()=>void}) {
 const auth=useAuth(),[sheetOpen,setSheetOpen]=useState(true);
 useEffect(()=>{
  if(auth.isInitializing||auth.pendingView)return;
  if(auth.isAuthenticated&&auth.viewerProfileId&&sessionStorage.getItem('portalink:cite-intent')===item.id){
   sessionStorage.removeItem('portalink:cite-intent');history.replaceState(null,'',location.pathname);setSheetOpen(true);return;
  }
  if(!sheetOpen)onClose();
 },[auth.isInitializing,auth.pendingView,auth.isAuthenticated,auth.viewerProfileId,item.id,sheetOpen,onClose]);
 if(auth.isInitializing)return <p role="status">Opening Cite…</p>;
 return <>{!auth.pendingView&&sheetOpen&&<CiteSheet item={item} onClose={()=>setSheetOpen(false)}/>} {auth.pendingView&&<Suspense fallback={null}><AuthDialog accentColor="#ff2d64" onAccentColorChange={()=>undefined} highContrast={false} onHighContrastChange={()=>undefined} reduceTranslucency={false} onReduceTranslucencyChange={()=>undefined} registrationReturnPath={location.pathname+location.search}/></Suspense>}</>;
}
export default function CitationInteraction(props:{item:CitationItem;onClose:()=>void}) {
 return <BrowserRouter useTransitions={false}><ServicesProvider services={visitorServices}><AuthProvider><AppPresentationProvider><Interaction {...props}/></AppPresentationProvider></AuthProvider></ServicesProvider></BrowserRouter>;
}
