import {useSheetMotion} from '../../presentation/motion/useSheetMotion';
import React,{useEffect,useRef,useState} from 'react';
import {ModalPortal} from '../../components/ui/ModalPortal';
import {useModalFocus} from '../../hooks/useModalFocus';
import {useReferences} from './useReferences';
import '../citations/citations.css';
import './references.css';
import {Button} from '../../components/ui/Button';
import {downloadPortfolio} from './downloadPortfolio';
function downloadText(text:string,fileName:string,mime:string){const url=URL.createObjectURL(new Blob([text],{type:mime}));const link=document.createElement('a');link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function ExportSheet({profileId,projectId,onClose,initial}:{profileId:string;projectId?:string;onClose:()=>void;initial?:'bibliography'|'portfolio'}){
 const controller=useRef<AbortController|null>(null);
 const motion=useSheetMotion(()=>{controller.current?.abort();onClose();});
 useEffect(()=>()=>controller.current?.abort(),[]);
 const [failedAction,setFailedAction]=useState<'portfolio'|'bibtex'|'plain'|'copy'|null>(null);
 const {exportBibliography}=useReferences();
 const [mode,setMode]=useState(initial??null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),flight=useRef(false),dialog=useRef<HTMLElement>(null);
 useModalFocus(true,dialog,()=>{if(!flight.current)motion.close();});
 async function bibliography(format:'bibtex'|'plain'|'copy'){if(flight.current)return;flight.current=true;setBusy(true);setError('');setStatus('');setFailedAction(null);try{const result=await exportBibliography(profileId,projectId);if(format==='copy'){await navigator.clipboard.writeText(result.plain);setStatus('Bibliography copied.');}else{downloadText(format==='bibtex'?result.bibtex:result.plain,`portalink-bibliography.${format==='bibtex'?'bib':'txt'}`,format==='bibtex'?'application/x-bibtex':'text/plain;charset=utf-8');setStatus('Bibliography download requested. Check your browser downloads.');}}catch(caught){setFailedAction(format);setError(caught instanceof Error?caught.message:'Bibliography could not be exported.');}finally{flight.current=false;setBusy(false);}}
 async function portfolio(){
  if(flight.current)return;
  flight.current=true;setBusy(true);setError('');setStatus('');setFailedAction(null);
  const request=new AbortController();controller.current=request;
  const timeout=window.setTimeout(()=>request.abort(),30_000);
  try{
   const blob=await downloadPortfolio(profileId,request.signal);
   if(request.signal.aborted)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='portalink-catalogue.pdf';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setStatus('PDF download requested. Check your browser downloads.');
  }catch(caught){
   setFailedAction('portfolio');
   setError(request.signal.aborted?'The download took too long. Check your connection and try again.':caught instanceof Error?caught.message:'The PDF could not be downloaded. Please try again.');
  }finally{window.clearTimeout(timeout);controller.current=null;flight.current=false;setBusy(false);}
 }
 function retry(){if(failedAction==='portfolio')void portfolio();else if(failedAction)void bibliography(failedAction);}
 return <ModalPortal><div className="citation-backdrop reference-backdrop" data-motion-scrim="" data-motion-closing={motion.closing||undefined}><section ref={dialog} tabIndex={-1} data-ui-surface="sheet" className="cite-sheet reference-sheet" data-motion-sheet="" data-motion-closing={motion.closing||undefined} role="dialog" aria-modal="true" aria-labelledby="export-heading" aria-busy={busy}><header><h2 id="export-heading">{mode==='bibliography'?'Bibliography':mode==='portfolio'?'Catalogue PDF':'Export'}</h2><button data-ui-control="icon" data-control-size="md" data-control-variant="ghost" disabled={busy} aria-label="Close export" onClick={()=>motion.close()}>×</button></header>{mode==='bibliography'?<><p>{projectId?'References for this project.':'References across all your projects.'}</p><div className="reference-export-actions"><button data-ui-control="button" data-control-size="md" data-control-variant="secondary" disabled={busy} onClick={()=>void bibliography('bibtex')}>BibTeX</button><button data-ui-control="button" data-control-size="md" data-control-variant="secondary" disabled={busy} onClick={()=>void bibliography('plain')}>Plain text</button><button data-ui-control="button" data-control-size="md" data-control-variant="secondary" disabled={busy} onClick={()=>void bibliography('copy')}>Copy</button></div></>:mode==='portfolio'?<><p>A dated Timeline of public work. Private and hidden work is excluded.</p><Button isLoading={busy} onClick={()=>void portfolio()}>{busy?'Preparing PDF...':'Download Catalogue PDF'}</Button></>:<div className="reference-export-actions"><button data-ui-control="button" data-control-size="md" data-control-variant="secondary" onClick={()=>setMode('bibliography')}>Bibliography</button><button data-ui-control="button" data-control-size="md" data-control-variant="secondary" onClick={()=>setMode('portfolio')}>Catalogue PDF</button></div>}<div className="export-feedback" aria-live="polite">{busy&&<p role="status">Preparing your export...</p>}{error&&<div className="export-recovery"><p role="alert">{error}</p><Button onClick={retry} disabled={busy}>{failedAction==='copy'?'Try copying again':'Retry download'}</Button></div>}</div>{status&&<p role="status">{status}</p>}</section></div></ModalPortal>;
}
