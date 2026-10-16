import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { NewChatPanel } from '../../components/messages/NewChatPanel';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ArrowLeftIcon } from 'lucide-react';
import './internalContentShare.css';

type Target = { title: string; url: string; onSent?: () => void };
const ShareContext = createContext<((target: Target) => void) | null>(null);
export function useInternalContentShare() {
 const share = useContext(ShareContext);
 return share ?? (() => { throw new Error('Internal sharing is unavailable.'); });
}
export function InternalContentShareProvider({children}: {children: React.ReactNode}) {
 const auth = useAuth();
 const [target,setTarget] = useState<Target | null>(null);
 useEffect(()=>setTarget(null),[auth.viewerProfileId]);
 const open = (next: Target) => {
  if(!auth.isAuthenticated) { auth.requestAuthenticatedDestination({kind:'route',path:window.location.pathname+window.location.search,label:'send content in Portalink'},'signUp'); return; }
  setTarget(next);
 };
 return <ShareContext.Provider value={open}>{children}{target && <InternalContentShareDialog target={target} onClose={()=>setTarget(null)} />}</ShareContext.Provider>;
}
export function InternalContentShareDialog({target,onClose,inline = false}: {target:Target;onClose:()=>void;inline?:boolean}) {
 const {messaging} = useServices();
 const viewport=useDialogViewport(), panel=useRef<HTMLElement>(null), sending=useRef(false);
 const [recipient,setRecipient]=useState<string | null>(null),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState<string | null>(null);
 useModalFocus(!inline,panel,()=>{if(!sending.current)onClose();},true);
 const send=async()=>{
  if(!recipient || sending.current || sent)return;
  sending.current=true;setBusy(true);setError(null);
  try {
   const conversation=await messaging.getOrCreateConversation(recipient);
   if(conversation.status==='request' && (!conversation.requestedByViewer || conversation.hasSentRequest)) throw new Error('This conversation must be accepted before you can send more messages.');
   await messaging.sendMessage(conversation.id, `${target.title}\n${target.url}`);
   setSent(true);target.onSent?.();
  } catch(caught) {setError(caught instanceof Error?caught.message:'Content could not be sent. Try again.');}
  finally {sending.current=false;setBusy(false);}
 };
 const content = <> <header className="internal-share-header"><button type="button" aria-label="Back" disabled={busy} onClick={onClose} className="internal-share-back"><ArrowLeftIcon aria-hidden="true" size={24}/></button><div><h1 id="internal-share-title">{sent?'Sent':'Send content'}</h1>
 <p className="internal-share-source">{target.title}</p></div></header>
 {sent?<p className="internal-share-feedback" role="status">Sent in Portalink.</p>:<div className="internal-share-directory"><NewChatPanel appearance="account-search" selectedCreatorId={recipient} showHeader={false} onClose={onClose} startingCreatorId={busy?recipient:null} onSelectCreator={id=>{if(!busy){setRecipient(id);setError(null);}}} /></div>}
 <footer className="internal-share-footer">
 {recipient && !sent && <p role="status">Recipient selected</p>}
 {error && <p role="alert">{error}</p>}
 <div className="internal-share-actions"><button type="button" disabled={busy} onClick={onClose}>{sent?'Done':'Cancel'}</button>{!sent && <button type="button" disabled={!recipient || busy} onClick={()=>void send()}>{busy?'Sending…':'Send'}</button>}</div></footer></>;
 if (inline) return <div className="project-inline-share">{content}</div>;
 return <ModalPortal><div ref={viewport} className="internal-share-screen"><section ref={panel} role="dialog" data-material="content" aria-modal="true" aria-labelledby="internal-share-title" tabIndex={-1} className="internal-share-page">
 {content}
 </section></div></ModalPortal>;
}
