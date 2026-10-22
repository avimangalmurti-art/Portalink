import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { NewChatPanel } from '../../components/messages/NewChatPanel';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { containModalFocus, useModalFocus } from '../../hooks/useModalFocus';
import { useSheetMotion } from '../../presentation/motion/useSheetMotion';
import { reducedMotion } from '../../presentation/motion/motion';
import { ArrowLeftIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { usePresentation } from '../../presentation/usePresentation';
import { useRecipientKeyboard } from './useRecipientKeyboard';
import { useRecipientScrollBoundary } from './useRecipientScrollBoundary';
import './internalContentShare.css';

type Target = { title: string; url: string; onSent?: () => void };
const ShareContext = createContext<((target: Target) => void) | null>(null);
export function useInternalContentShare() {
 const share = useContext(ShareContext);
 return share ?? (() => { throw new Error('Internal sharing is unavailable.'); });
}
export function InternalContentShareProvider({children}: {children: React.ReactNode}) {
 const auth = useAuth();
 const mobile=usePresentation()==='mobile';
 const [opening,setOpening] = useState<{target:Target;key?:number} | null>(null);
 const sequence=useRef(0),mobileSendLock=useRef(false);
 useEffect(()=>setOpening(null),[auth.viewerProfileId,mobile]);
 const open = (next: Target) => {
  if(!auth.isAuthenticated) { auth.requestAuthenticatedDestination({kind:'route',path:window.location.pathname+window.location.search,label:'send content in Portalink'},'signUp'); return; }
  setOpening({target:next,key:mobile?++sequence.current:undefined});
 };
 return <ShareContext.Provider value={open}>{children}{opening && <InternalContentShareDialog key={opening.key} target={opening.target} mobileSendLock={mobileSendLock} onClose={()=>setOpening(null)} />}</ShareContext.Provider>;
}
export function InternalContentShareDialog({target,onClose,inline = false,mobileSendLock}: {target:Target;onClose:()=>void;inline?:boolean;mobileSendLock?:MutableRefObject<boolean>}) {
 const presentation=usePresentation();
 const mobile= presentation==='mobile'&&!inline;
 const auth=useAuth();
 const {messaging} = useServices();
 const {close,finish}=useSheetMotion(onClose,'base');
 const viewport=useDialogViewport(), panel=useRef<HTMLElement>(null), sending=useRef(false);
 useRecipientScrollBoundary(mobile,viewport);
 const ownSendLock=useRef(false),sendLock=mobileSendLock??ownSendLock;
 // An unfinished phone send retains its guard if the viewport changes while
 // it is pending. Ordinary WEB and inline interactions keep their lifecycle.
 const guardSend=mobile||mobileSendLock!==undefined;
 const scope=JSON.stringify([auth.viewerProfileId,auth.isAuthenticated,target.title,target.url]);
 const session=useRef({active:true,scope,operation:0,confirmed:false});session.current.scope=scope;
 const [recipient,setRecipient]=useState<string | null>(null),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState<string | null>(null);
 const keyboardOpen=useRecipientKeyboard(presentation==='mobile'&&!inline&&!sent,panel);
 const invalidate=()=>{session.current.active=false;session.current.operation++;};
 const dismiss=()=>{
  if(!mobile){onClose();return;}
  if(sending.current||!session.current.active)return;
  invalidate();
  // The copied frame retains its viewport and keyboard state while the real
  // modal releases focus immediately. New input removes the inert exit.
  close(onClose,viewport.current);
 };
 const dismissRef=useRef(dismiss);dismissRef.current=dismiss;
 useEffect(()=>{
  if(!mobile)return;
  const state=session.current;
  state.active=true;state.confirmed=false;sending.current=false;
  setRecipient(null);setBusy(false);setSent(false);setError(null);
  return()=>{state.active=false;state.operation++;};
 },[mobile,scope]);
 useEffect(()=>{
  if(!mobile)return;
  const leave=()=>{invalidate();finish();};
  window.addEventListener('popstate',leave,true);
  return()=>window.removeEventListener('popstate',leave,true);
 },[mobile,finish]);
 // Register before the child search's passive autofocus, so the opener is
 // the reader control rather than the search input being removed on close.
 useLayoutEffect(()=>{
  if(mobile&&panel.current)return containModalFocus(panel.current,()=>dismissRef.current(),true);
 },[mobile]);
 useModalFocus(!inline&&!mobile,panel,()=>{if(!sending.current)onClose();},true);
 const send=async()=>{
  if(!recipient || sending.current || sent)return;
  if(mobile&&(!session.current.active||session.current.confirmed||session.current.scope!==scope))return;
  if(guardSend&&sendLock.current){setError('Your previous send is still finishing. Please wait before sending again.');return;}
  const operation=++session.current.operation;
  const current=()=>!mobile||(session.current.active&&session.current.operation===operation&&session.current.scope===scope);
  if(guardSend)sendLock.current=true;
  sending.current=true;setBusy(true);setError(null);
  try {
   const conversation=await messaging.getOrCreateConversation(recipient);
   if(!current())return;
   if(conversation.status==='request' && (!conversation.requestedByViewer || conversation.hasSentRequest)) throw new Error('This conversation must be accepted before you can send more messages.');
   await messaging.sendMessage(conversation.id, `${target.title}\n${target.url}`);
   if(!current())return;
   if(mobile){session.current.confirmed=true;panel.current?.focus({preventScroll:true});}
   setSent(true);target.onSent?.();
  } catch(caught) {if(current())setError(caught instanceof Error?caught.message:'Content could not be sent. Try again.');}
  finally {if(guardSend)sendLock.current=false;if(current()){sending.current=false;setBusy(false);}}
 };
 const content = <> <header className="internal-share-header"><button data-ui-shape="icon" data-control-size="sm" type="button" aria-label="Back" disabled={busy} onClick={dismiss} className="internal-share-back"><InterfaceIcon icon={ArrowLeftIcon} size="lg" mirroredInRtl/></button><div><h1 id="internal-share-title">{sent&&!mobile?'Sent':'Send content'}</h1>
 <p className="internal-share-source">{target.title}</p></div></header>
 {sent&&!mobile?<p className="internal-share-feedback" role="status">Sent in Portalink.</p>:<div className="internal-share-directory"><NewChatPanel key={mobile?scope:undefined} appearance="account-search" selectedCreatorId={recipient} showHeader={false} onClose={dismiss} disabled={mobile&&sent} startingCreatorId={busy?recipient:null} onSelectCreator={id=>{if(!busy&&(!mobile||(!sending.current&&session.current.active&&!session.current.confirmed&&session.current.scope===scope))){setRecipient(id);setError(null);}}} /></div>}
 {(!keyboardOpen||error)&&<footer className="internal-share-footer">
 {!keyboardOpen && recipient && (!sent||mobile) && <p role="status">{mobile&&sent?'Sent in Portalink.':'Recipient selected'}</p>}
 {error && <p role="alert">{error}</p>}
 {!keyboardOpen&&<div className="internal-share-actions"><button type="button" disabled={busy} onClick={dismiss}>{sent?'Done':'Cancel'}</button>{(!sent||mobile) && <button type="button" disabled={!recipient || busy || sent} data-send-state={mobile&&sent?'sent':undefined} data-semantic-action={mobile&&sent?'send':undefined} onClick={()=>void send()}>{sent?'Sent':busy?'Sending…':'Send'}</button>}</div>}</footer>}</>;
 if (inline) return <div className="project-inline-share">{content}</div>;
 return <ModalPortal><div ref={viewport} className="internal-share-screen" data-presentation={presentation} data-mobile-share-motion={mobile||undefined} data-motion-scrim={mobile?'':undefined} data-share-reduce-motion={mobile&&reducedMotion()||undefined} data-recipient-keyboard={keyboardOpen?'open':'closed'}><section ref={panel} role="dialog" data-material="content" aria-modal="true" aria-labelledby="internal-share-title" tabIndex={-1} className="internal-share-page">
 {content}
 </section></div></ModalPortal>;
}
