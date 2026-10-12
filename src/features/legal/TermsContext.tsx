import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { needsTermsAcceptance, type LegalDocument, type LegalVersion, type TermsAcceptance } from './model';
import { TermsSheet } from './TermsSheet';
import { SignupTermsContext } from './signupTermsContext';
import { useRequiredTermsBackGuard } from './useRequiredTermsBackGuard';
const AgreementCheckLoader=React.lazy(()=>import('../../components/ui/PortalinkSplashLoader').then(module=>({default:module.PortalinkSplashLoader})));
export function TermsProvider({children}:{children:React.ReactNode}){
  const auth=useAuth(),{legal}=useServices(),location=useLocation(),navigate=useNavigate();
  const accountId=auth.user?.id??null;
  const [documents,setDocuments]=useState<LegalDocument[]>([]),[accepted,setAccepted]=useState<TermsAcceptance[]>([]);
  const [checkedAccount,setCheckedAccount]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
  const [releasedAccount,setReleasedAccount]=useState<string|null>(null);
  const [signupEmail,setSignupEmail]=useState<string|null>(null);
  const resolver=useRef<((versions:LegalVersion[]|null)=>void)|null>(null),generation=useRef(0),mutation=useRef(false),content=useRef<HTMLDivElement>(null);
  const signupAccount=useRef<string|null>(null);
  const invalidateRequests=useCallback(()=>{generation.current++;},[]);
  const readOnlyRequested=location.pathname.replace(/\/+$/,'')==='/settings'&&new URLSearchParams(location.search).get('terms')==='1';
  const checkingAccount=Boolean(accountId&&checkedAccount!==accountId);
  const mandatory=Boolean(accountId&&checkedAccount===accountId&&needsTermsAcceptance(documents,accepted));
  const open=mandatory||signupEmail!==null||readOnlyRequested||Boolean(checkingAccount&&error);
  const readOnly=readOnlyRequested&&!mandatory&&!checkingAccount&&signupEmail===null;
  const releaseBackGuard=useRequiredTermsBackGuard(open&&!readOnly);
  const displayedDocuments=useRef<LegalDocument[]>([]),reviewing=useRef(false);
  displayedDocuments.current=documents;reviewing.current=open;
  const reload=useCallback(async()=>{
    if(mutation.current)return;
    if(!legal){setError('The agreements are temporarily unavailable. Please try again.');return;}
    const request=++generation.current;setLoading(true);setError(null);
    try{
      const latest=await legal.documents();
      let history=accountId?await legal.acceptances(accountId):[];
      if(accountId&&needsTermsAcceptance(latest,history)){
        const staged=await legal.signupConsent(accountId);
        // Carry only the exact signup consent. Never silently accept a bump.
        if(staged&&latest.every(row=>staged.some(item=>item.key===row.key&&item.version===row.version))){
          await legal.accept(accountId,staged);history=await legal.acceptances(accountId);
        }
      }
      if(request!==generation.current)return;
      const changedDuringReview=reviewing.current&&displayedDocuments.current.length>0&&latest.some(row=>!displayedDocuments.current.some(previous=>previous.key===row.key&&previous.version===row.version));
      setDocuments(latest);setAccepted(history);setCheckedAccount(accountId);
      if(accountId&&!needsTermsAcceptance(latest,history))setReleasedAccount(accountId);
      if(changedDuringReview)setError('An agreement changed. Review the updated text, then try again.');
    }catch(caught){if(request===generation.current)setError(caught instanceof Error?caught.message:'The agreements could not be read.');}
    finally{if(request===generation.current)setLoading(false);}
  },[legal,accountId]);
  useEffect(()=>{
    if(resolver.current&&accountId!==signupAccount.current){resolver.current(null);resolver.current=null;setSignupEmail(null);}
  },[accountId]);
  useEffect(()=>{
    if(!accountId){setCheckedAccount(null);setReleasedAccount(null);}
    if(accountId||readOnlyRequested||signupEmail!==null)void reload();
    return invalidateRequests;
  },[reload,accountId,readOnlyRequested,signupEmail,invalidateRequests]);
  useEffect(()=>{
    if(!accountId)return;
    const check=()=>{if(document.visibilityState==='visible')void reload();};
    window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
    const timer=window.setInterval(check,60_000);
    return()=>{window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);window.clearInterval(timer);};
  },[accountId,reload]);
  useLayoutEffect(()=>{if(content.current)content.current.inert=open||checkingAccount;},[open,checkingAccount]);
  useEffect(()=>()=>{resolver.current?.(null);resolver.current=null;},[]);
  const requestConsent=useCallback((email:string)=>{
    if(resolver.current)return Promise.reject(new Error('An agreement review is already open.'));
    setDocuments([]);setSignupEmail(email);setAccepted([]);setError(null);
    signupAccount.current=accountId;
    return new Promise<LegalVersion[]|null>(resolve=>{resolver.current=resolve;});
  },[accountId]);
  async function agree(){
    if(mutation.current||loading||error||documents.length!==4)return;
    if(signupEmail!==null){mutation.current=true;setBusy(true);await releaseBackGuard();const resolve=resolver.current;resolver.current=null;setSignupEmail(null);resolve?.(documents.map(({key,version})=>({key,version})));mutation.current=false;setBusy(false);return;}
    if(!accountId||!legal)return;
    mutation.current=true;setBusy(true);setError(null);const request=generation.current;
    try{await legal.accept(accountId,documents.map(({key,version})=>({key,version})));const history=await legal.acceptances(accountId);if(request===generation.current){await releaseBackGuard();if(request!==generation.current)return;setAccepted(history);setCheckedAccount(accountId);if(!needsTermsAcceptance(documents,history))setReleasedAccount(accountId);}}
    catch(caught){if(request===generation.current)setError(caught instanceof Error?caught.message:'Your agreement could not be saved.');}
    finally{mutation.current=false;setBusy(false);}
  }
  async function disagree(){
    if(mutation.current)return;mutation.current=true;setBusy(true);
    try{
      if(auth.isAuthenticated&&!await auth.signOut('local'))throw new Error('This session could not be ended. Please try again.');
      await releaseBackGuard();
      resolver.current?.(null);resolver.current=null;
      window.location.assign('/?welcome=1');
    }catch(caught){setError(caught instanceof Error?caught.message:'Could not return to welcome.');mutation.current=false;setBusy(false);}
  }
  const close=useCallback(()=>{const search=new URLSearchParams(location.search);search.delete('terms');navigate({pathname:location.pathname,search:search.toString()},{replace:true});},[location,navigate]);
  return <SignupTermsContext.Provider value={{requestConsent}}><div ref={content} data-terms-content style={{display:'contents'}} aria-hidden={open||checkingAccount?true:undefined}>{!accountId||releasedAccount===accountId?children:null}</div>{checkingAccount&&!open&&<React.Suspense fallback={null}><AgreementCheckLoader stillOnly/></React.Suspense>}{open&&<TermsSheet key={accountId??signupEmail??'guest'} documents={documents} accepted={accepted} loading={loading} error={error} busy={busy} readOnly={readOnly} onClose={close} onAgree={()=>void agree()} onDisagree={()=>void disagree()} onRetry={()=>void reload()} onEmail={()=>legal?legal.sendEmail():Promise.reject(new Error('Email not available yet'))}/>}</SignupTermsContext.Provider>;
}
