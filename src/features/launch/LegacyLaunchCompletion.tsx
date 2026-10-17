import React,{useEffect,useRef,useState} from 'react';
import type {AuthService} from '../../services/interfaces';
import {AdultLaunchGate} from './AdultLaunchGate';
import {ADMISSION_KEY,clearTransientBirth} from './adultLaunch';
import {EntryAgreements} from '../../components/auth/EntryAgreements';

export function LegacyLaunchCompletion({accountId,service,onReady,onDismiss,onSignIn}:{accountId:string;service:AuthService;
 onReady:(accountId:string)=>void;onDismiss:()=>void;onSignIn:()=>void}) {
 const [status,setStatus]=useState<'loading'|'required'|'reauthenticate'|'unavailable'>('loading');
 const [revision,setRevision]=useState(0),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false),current=useRef(accountId);current.current=accountId;
 useEffect(()=>{
  let active=true;
  current.current=accountId;
  setStatus('loading');setError('');clearTransientBirth();
  try{sessionStorage.removeItem(ADMISSION_KEY);}catch{/* Missing storage fails closed at screening. */}
  void service.getLaunchCompletion?.(accountId).then(value=>{
   if(!active)return;
   if(value==='ready')onReady(accountId);else setStatus(value);
  }).catch(()=>{if(active){setStatus('unavailable');setError('Account eligibility could not be checked.');}});
  return()=>{active=false;current.current='';clearTransientBirth();try{sessionStorage.removeItem(ADMISSION_KEY);}catch{/* Storage unavailable. */}};
 },[accountId,service,attempt,onReady]);
 async function complete(request:()=>Promise<boolean>) {
  if(pending.current)return;
  const expected=accountId;pending.current=true;setBusy(true);setError('');
  try {
   if(!await request()||current.current!==expected)return;
   if(!service.completeLaunchEligibility)throw Error('Account completion is unavailable.');
   await service.completeLaunchEligibility(expected);
   if(current.current===expected)onReady(expected);
  }catch{if(current.current===expected){setError('Completion could not be verified. Check eligibility again, or sign in again if needed.');setRevision(v=>v+1);}}
  finally{pending.current=false;if(current.current===expected)setBusy(false);}
 }
 return <div className="one-screen-entry">
  <h1>Finish account eligibility</h1>
  {status==='loading'&&<p role="status">Checking your account…</p>}
  {status==='reauthenticate'&&<p>Sign in again with this account’s password, then return to finish setup.</p>}
  {status==='unavailable'&&<p>Account completion is awaiting reviewed launch safeguards. Your account has not been replaced.</p>}
  {status==='required'&&<AdultLaunchGate key={revision} onSignIn={onSignIn} onGuest={onDismiss} guestLabel="Close">
   <EntryAgreements onDisagree={()=>{setRevision(v=>v+1);onDismiss();}}>{controls=><>
    <p>Review the agreements to finish this confirmed account. Your profile will start private.</p>
    <button type="button" className="entry-email" disabled={busy} onClick={()=>void complete(controls.request)}>Review agreements and continue</button>
   </>}</EntryAgreements>
  </AdultLaunchGate>}
  {error&&<p role="alert">{error}</p>}
  {status!=='loading'&&<div className="entry-links"><button type="button" disabled={busy} onClick={onSignIn}>Sign in again</button>
   <button type="button" disabled={busy} onClick={()=>setAttempt(v=>v+1)}>Check again</button>
   <button type="button" disabled={busy} onClick={onDismiss}>Close</button></div>}
 </div>;
}
