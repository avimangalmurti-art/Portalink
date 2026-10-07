import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { NewChatPanel } from '../../components/messages/NewChatPanel';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import '../../components/ui/confirmation-dialog.css';

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
 const content = <> <h2 id="internal-share-title">{sent?'Sent':'Send content'}</h2>
 <p className="portalink-confirmation-description">{target.title}</p>
 {sent?<p role="status">Sent in Portalink.</p>:<div className="min-h-0 flex-1 overflow-y-auto"><NewChatPanel selectedCreatorId={recipient} showHeader={false} onClose={onClose} startingCreatorId={busy?recipient:null} onSelectCreator={id=>{if(!busy){setRecipient(id);setError(null);}}} /></div>}
 {recipient && !sent && <p role="status">Recipient selected</p>}
 {error && <p role="alert">{error}</p>}
 <div className="portalink-confirmation-actions"><button type="button" disabled={busy} onClick={onClose}>{sent?'Done':'Cancel'}</button>{!sent && <button type="button" disabled={!recipient || busy} onClick={()=>void send()}>{busy?'Sending…':'Send'}</button>}</div></>;
 if (inline) return <div className="project-inline-share">{content}</div>;
 return <ModalPortal><div ref={viewport} className="portalink-confirmation-overlay modal-scrim" style={{zIndex:150}} onClick={event=>{if(event.target===event.currentTarget && !busy)onClose();}}><section ref={panel} role="dialog" aria-modal="true" aria-labelledby="internal-share-title" tabIndex={-1} className="portalink-confirmation" style={{display:'flex',flexDirection:'column',maxHeight:'min(70dvh, 640px)',width:'min(420px, calc(100vw - 32px))'}}>
 {content}
 </section></div></ModalPortal>;
}
