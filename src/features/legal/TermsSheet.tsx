import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { contentLevels, contentLevelText, type LegalDocument, type LegalKey, type TermsAcceptance } from './model';
import { legalMarkdownHtml } from './markdown';
import './terms.css';
type Props = { documents: LegalDocument[]; accepted?: TermsAcceptance[]; readOnly?: boolean; loading?: boolean; error?: string | null; busy?: boolean; onAgree: () => void; onDisagree: () => void; onEmail: () => Promise<string>; onClose?: () => void; onRetry: () => void };
const labels = ['A. Portalink Terms of Service','B. Privacy Policy','C. Content Licence — Private, Public, Citable','D. AI Access Terms'];
const intros: Record<LegalKey,string> = {terms:'Please read these terms before using Portalink.',privacy:'How Portalink handles your information and privacy choices.','content-licence':'Every project has one of three levels. You choose it when you publish and can change it any time.','ai-access':'The permissions and limits for AI access to Citable work.'};
export function TermsSheet({documents,accepted=[],readOnly=false,loading=false,error,busy=false,onAgree,onDisagree,onEmail,onClose,onRetry}:Props) {
  const [selected,setSelected]=useState<LegalKey|null>(null), [emailMessage,setEmailMessage]=useState<string|null>(null), [sending,setSending]=useState(false);
  const [emailUnavailable,setEmailUnavailable]=useState(false);
  const panel=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),emailLock=useRef(false);
  const document=documents.find(row=>row.key===selected);
  useEffect(()=>{scroll.current?.scrollTo(0,0); panel.current?.focus();},[selected]);
  useEffect(()=>{
    const previous=globalThis.document.activeElement as HTMLElement|null;
    const overflow=globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow='hidden';panel.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      // Keep global app shortcuts behind this modal from receiving reader keys.
      // Native copy, text selection and button activation remain available.
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(readOnly)onClose?.();}
      if(event.key!=='Tab')return;
      const targets=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')??[]);
      const first=targets[0],last=targets[targets.length-1];
      if(!first){event.preventDefault();return;}
      const active=globalThis.document.activeElement;
      if(event.shiftKey&&(active===first||active===panel.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(active===last||active===panel.current)){event.preventDefault();first.focus();}
    };
    const focusin=(event:FocusEvent)=>{if(panel.current&&event.target instanceof Node&&!panel.current.contains(event.target))panel.current.focus();};
    globalThis.document.addEventListener('keydown',keydown,true);
    globalThis.document.addEventListener('focusin',focusin,true);
    return()=>{globalThis.document.body.style.overflow=overflow;globalThis.document.removeEventListener('keydown',keydown,true);globalThis.document.removeEventListener('focusin',focusin,true);previous?.focus();};
  },[readOnly,onClose]);
  async function email(){
    if(emailLock.current)return; emailLock.current=true;setSending(true);setEmailMessage(null);
    try{setEmailMessage(await onEmail());}
    catch(caught){const message=caught instanceof Error?caught.message:'Email could not be sent.';setEmailMessage(message);if(message==='Email not available yet')setEmailUnavailable(true);}
    finally{emailLock.current=false;setSending(false);}
  }
  return createPortal(<div className="terms-overlay"><div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="terms-title" className="terms-sheet" data-legal-mode={readOnly?'read-only':'required'}>
    <header className={selected?'terms-header terms-detail-header':'terms-header'}>
      {selected?<><button className="terms-back" onClick={()=>setSelected(null)}>‹ Terms and Conditions</button><h1 id="terms-title">{selected==='content-licence'?'C. Content Licence':labels[documents.findIndex(row=>row.key===selected)]}</h1><p>{intros[selected]}</p></>:<h1 id="terms-title">Terms and Conditions</h1>}
    </header>
    <div ref={scroll} className="terms-scroll">
      {!selected&&<>
        <button className="terms-email" disabled={sending||emailUnavailable||busy} onClick={()=>void email()}>{emailUnavailable?'Email not available yet':sending?'Sending…':'Send by Email'}</button>
        {emailMessage&&<p role="status" className="terms-confirmation">{emailMessage}</p>}
        {readOnly&&<p className="terms-read-only">Read-only · Your accepted versions and dates are shown below.</p>}
        <section className="terms-card terms-agreements" aria-label="Agreements">
          <h2>IMPORTANT</h2><p>Please read these terms before using Portalink. By creating an account you agree to the Portalink Terms of Service and Privacy Policy. If you make work <strong>Citable</strong>, you also agree to the Content Licence and AI Access Terms.</p>
          {documents.map((row,index)=><button className="terms-row" key={row.key} onClick={()=>setSelected(row.key)}><span>{labels[index]}{readOnly&&<small>{accepted.filter(item=>item.key===row.key).sort((a,b)=>b.accepted_at.localeCompare(a.accepted_at)).map(item=><span key={item.version}>Accepted v{item.version} · {new Date(item.accepted_at).toLocaleString()}</span>)}{!accepted.some(item=>item.key===row.key)&&<small>No acceptance recorded</small>}</small>}</span><span className="terms-chevron" aria-hidden="true">›</span></button>)}
        </section>
        <section className="terms-card terms-legal-text" aria-label="Legal text">{documents[0]&&<div dangerouslySetInnerHTML={{__html:legalMarkdownHtml(documents[0].markdown_body)}}/>}</section>
      </>}
      {selected==='content-licence'&&document&&<section className="terms-card terms-levels" aria-label="Content visibility levels">{contentLevels.map(level=><div key={level.title}><h2>{level.title}</h2><p className="terms-level-intro">{level.intro}</p><p>{contentLevelText(document,level)}</p></div>)}</section>}
      {document&&<section className="terms-card terms-legal-text"><p className="terms-version">Version {document.version} · Effective {document.effective_at.slice(0,10)}</p><div dangerouslySetInnerHTML={{__html:legalMarkdownHtml(document.markdown_body)}}/></section>}
      {loading&&<p role="status">Loading agreements…</p>}
      {error&&<div role="alert"><p>{error}</p><button className="terms-retry" onClick={onRetry}>Try again</button></div>}
    </div>
    <footer className="terms-footer">{readOnly?<button className="terms-agree" onClick={onClose}>Done</button>:<><button className="terms-agree" disabled={loading||busy||Boolean(error)||documents.length!==4} onClick={onAgree}>{busy?'Saving…':'Agree'}</button><button className="terms-disagree" disabled={busy} onClick={onDisagree}>Disagree</button></>}</footer>
  </div></div>,globalThis.document.body);
}
