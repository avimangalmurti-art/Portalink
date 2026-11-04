import React, { useEffect, useRef, useState } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { NewCategoryDialog } from '../../components/profile/NewCategoryDialog';
import { portalIconNames } from '../../components/profile/categoryIcons';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useAuthoringFocus } from '../../components/publishing/useAuthoringFocus';
import { usePresentation } from '../../presentation/usePresentation';
import { validateTitle, TITLE_MAX_LENGTH } from './validation';
import { validateCategoryLabel } from '../profile/useCategoryManagement';
import type { PortfolioCategory } from '../../types/domain';
import type { DraftMetadata, ProjectDraft, PublishResult } from '../../types/publishing';
import { readSetupDraft, saveSetupDraft, type SetupDraft } from './setupDraft';
import './projectSetup.css';
export type ProjectSetup = { categoryId: string; categoryLabel: string; title: string; summary: string };
const DEFAULT_PORTAL_ICON='shapes';
function projectMessage(message:string){return message.replace(/\bIdea\b/g,'Project').replace(/\bidea\b/g,'project');}
export function ProjectSetupScreen({categories,initialCategoryId,accountId,profileId,recoveryDraft,recoveryError,onResumeDraft,onCreatePortal,onConfirmPortal,onContinue,onClose}:{categories:PortfolioCategory[];initialCategoryId?:string|null;accountId?:string;profileId?:string;recoveryDraft?:{draft:ProjectDraft;metadata:DraftMetadata;committed?:PublishResult};recoveryError?:string;onResumeDraft?:(draft:ProjectDraft)=>void;onCreatePortal:(name:string,iconName:string)=>Promise<PortfolioCategory|null>;onConfirmPortal?:(category:PortfolioCategory)=>Promise<void>;onContinue:(value:ProjectSetup)=>void;onClose:()=>void}) {
 const presentation=usePresentation();
 const defaultPortal=initialCategoryId&&categories.some(c=>c.id===initialCategoryId)?initialCategoryId:categories[0]?.id??'new';
 const initial=useRef<{value:SetupDraft|null;error:string;defaultPortal:string}|null>(null);
 if(!initial.current){
  let value:SetupDraft|null=null,error='';
  if(accountId&&profileId)try{value=readSetupDraft(accountId,profileId);}catch(caught){error=caught instanceof Error?caught.message:'Saved project details could not be opened.';}
  initial.current={value,error,defaultPortal};
 }
 const [portal,setPortal]=useState(initial.current.value?.portal??defaultPortal);
 const [retainedPortal,setRetainedPortal]=useState<PortfolioCategory|null>(categories.find(c=>c.id===portal)??null);
 const availableCategories=retainedPortal&&!categories.some(c=>c.id===retainedPortal.id)?[...categories,retainedPortal]:categories;
 const selectedPortal=availableCategories.find(c=>c.id===portal);
 const [title,setTitle]=useState(initial.current.value?.title??''),[summary,setSummary]=useState(initial.current.value?.summary??''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const validationError=validateTitle(title)||(!selectedPortal?'Choose a portal.':null);
 const [portalDraft,setPortalDraft]=useState<{name:string;iconName:string}|null>(()=>{
  const saved=initial.current?.value;
  if(!saved||(saved.portal!=='new'&&!saved.creatingPortal))return null;
  return {name:saved.name,iconName:saved.iconName&&portalIconNames.includes(saved.iconName)?saved.iconName:DEFAULT_PORTAL_ICON};
 });
 const [showNewPortal,setShowNewPortal]=useState(false);
 const [portalCreateError,setPortalCreateError]=useState('');
 const [showPortals,setShowPortals]=useState(false);
 const portalsButton=useRef<HTMLButtonElement>(null);
 const newPortalButton=useRef<HTMLButtonElement>(null);
 const hasOpenedNewPortal=useRef(false);
 const [storageError,setStorageError]=useState(initial.current.error);
 const lastSaved=useRef(initial.current.value?JSON.stringify(initial.current.value):'');
 const setup:SetupDraft={title,summary,portal,name:portalDraft?.name??'',iconName:portalDraft?.iconName??DEFAULT_PORTAL_ICON,
  ...(portalDraft?{creatingPortal:true}:{})};
 function saveSetup(value:SetupDraft=setup){
  const hasDetails=Boolean(value.title||value.summary||value.name||value.iconName!==DEFAULT_PORTAL_ICON||value.portal!==initial.current?.defaultPortal||lastSaved.current);
  if(!accountId||!profileId||!hasDetails)return true;
  try{const signature=JSON.stringify(value);if(signature!==lastSaved.current){saveSetupDraft(accountId,profileId,value);lastSaved.current=signature;}setStorageError('');return true;}
  catch(caught){setStorageError(caught instanceof Error?caught.message:'Project details could not be saved on this device. Keep this screen open.');return false;}
 }
 function requestClose(){if(saveSetup())onClose();}
 const mobileAuthoring=presentation==='mobile';
 const viewport=useDialogViewport(!showNewPortal,mobileAuthoring),panel=useRef<HTMLElement>(null),flight=useRef(false),active=useRef(true);
 function closePortalChoices(){setShowPortals(false);portalsButton.current?.focus({preventScroll:true});}
 function openNewPortal(){
  if(flight.current)return;
  hasOpenedNewPortal.current=true;
  setShowPortals(false);
  setPortalCreateError('');
  setShowNewPortal(true);
 }
 function closeNewPortal(){
  setPortalDraft(null);
  setShowNewPortal(false);
 }
 useAuthoringFocus(viewport,!showNewPortal);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useModalFocus(!showNewPortal,panel,()=>{
  if(mobileAuthoring&&showPortals)closePortalChoices();
  else if(!flight.current)requestClose();
 },true);
 useEffect(()=>{
  if(!showNewPortal&&hasOpenedNewPortal.current)newPortalButton.current?.focus({preventScroll:true});
 },[showNewPortal]);
 useEffect(()=>{saveSetup();},[accountId,profileId,title,summary,portal,portalDraft]); // eslint-disable-line react-hooks/exhaustive-deps -- save the current authored fields, not status updates.
 async function createPortal(name:string,iconName:string){
  if(flight.current)return;
  const invalid=validateCategoryLabel(name,availableCategories,null);
  if(invalid){setPortalCreateError(invalid.replace(/\bcategory\b/g,'portal'));return;}
  flight.current=true;setBusy(true);setPortalCreateError('');
  try{
   const category=await onCreatePortal(name.trim(),iconName);
   if(!active.current)return;
   if(!category){setPortalCreateError('The portal could not be created. Try again.');return;}
   setRetainedPortal(category);
   setPortal(category.id);
   setError('');
   saveSetup({title,summary,portal:category.id,name:'',iconName:DEFAULT_PORTAL_ICON});
   closeNewPortal();
  }catch(caught){if(active.current)setPortalCreateError(caught instanceof Error?caught.message:'The portal could not be created. Try again.');}
  finally{flight.current=false;if(active.current)setBusy(false);}
 }
 async function proceed(){
  if(flight.current||showNewPortal)return;
  if(validationError||!selectedPortal){setError(validationError??'Choose a portal.');return;}
  flight.current=true;setBusy(true);setError('');
  try{
   // Keep the chosen portal available if the confirmation refresh fails.
   setRetainedPortal(selectedPortal);
   saveSetup();
   await onConfirmPortal?.(selectedPortal);
   if(!active.current)return;
   onContinue({categoryId:selectedPortal.id,categoryLabel:selectedPortal.label,title:title.trim(),summary:summary.trim()});
  }catch(caught){if(active.current)setError((caught instanceof Error?caught.message:'Could not confirm this portal.')+' Your details are still here. Try again or choose another portal.');}
  finally{flight.current=false;if(active.current)setBusy(false);}
 }
 if(showNewPortal)return <NewCategoryDialog itemName="portal" initialLabel={portalDraft?.name} initialIconName={portalDraft?.iconName}
  onDraftChange={(name,iconName)=>{setPortalDraft({name,iconName});setPortalCreateError('');}}
  onCancel={()=>{if(!flight.current)closeNewPortal();}} onCreate={createPortal} isSaving={busy} error={portalCreateError||storageError}/>;

 return <ModalPortal><div ref={viewport} className="project-setup-screen modal-scrim" data-presentation={presentation} data-ui-modal-backdrop={mobileAuthoring?'authoring':undefined}><section ref={panel} role="dialog" aria-modal="true" data-material="content" data-ui-shape="screen" aria-labelledby="project-setup-title" tabIndex={-1} className="project-setup-page">
  <header><button type="button" aria-label="Cancel new project" disabled={busy} onClick={requestClose}><XIcon aria-hidden="true"/></button><h1 id="project-setup-title">New project</h1><span className="project-setup-header-balance" aria-hidden="true"/></header>
  <form id="project-setup-form" onSubmit={event=>{event.preventDefault();void proceed();}} noValidate>
   <div className="project-setup-art" aria-hidden="true"><img src="/onboarding/process.webp" alt="" width="1254" height="1254" draggable={false}/></div>
   <p className="project-setup-intro">Add to your catalogue.</p>
   {recoveryDraft&&onResumeDraft&&<div className="project-setup-recovery"><span>{recoveryDraft.metadata.title||'Your project'}</span><button type="button" disabled={busy} onClick={()=>{if(saveSetup())onResumeDraft(recoveryDraft.draft);}}>{recoveryDraft.committed?'Finish published project':'Continue draft'}</button></div>}
   {recoveryError&&<p role="alert">{projectMessage(recoveryError)}</p>}
   <div className="project-setup-group"><label className="project-setup-identity"><span>Title</span><input autoFocus={!hasOpenedNewPortal.current} name="title" data-ui-shape="field" value={title} onChange={e=>setTitle(e.target.value)} maxLength={TITLE_MAX_LENGTH} placeholder="Enter a title" disabled={busy} required/></label>
    {mobileAuthoring ? <div className="project-setup-mobile-portals">
     <div className="project-setup-portal-buttons">
      <button type="button" ref={portalsButton} data-ui-control="button" data-control-size="lg" data-control-variant="secondary" data-ui-shape="action" aria-expanded={showPortals} aria-controls="project-setup-portal-list" aria-describedby={selectedPortal?'project-setup-selected-portal':undefined} disabled={busy} onClick={()=>setShowPortals(!showPortals)}>Portals</button>
      <button type="button" ref={newPortalButton} data-ui-control="button" data-control-size="lg" data-control-variant="secondary" data-ui-shape="action" aria-haspopup="dialog" disabled={busy} onClick={openNewPortal}>New Portal</button>
     </div>
     {selectedPortal&&<span className="sr-only" id="project-setup-selected-portal">Selected Portal: {selectedPortal.label}</span>}
     {portal!=='new'&&!selectedPortal&&<p className="project-setup-portal-error" role="status">Portal unavailable. Choose a Portal.</p>}
     <ul className="project-setup-portal-list" id="project-setup-portal-list" hidden={!showPortals}>
      {availableCategories.length ? availableCategories.map(category=><li key={category.id}><button type="button" value={category.id} data-ui-control="button" data-control-size="lg" data-control-variant="secondary" aria-pressed={portal===category.id} disabled={busy} onClick={()=>{setPortal(category.id);closePortalChoices();}}>{category.label}</button></li>) : <li>No portals yet.</li>}
     </ul>
    </div> : <div className="project-setup-portal-choice"><label className="project-setup-row"><span>Portal</span><select aria-label="Portal" data-ui-shape="field" value={portal==='new'?'':portal} onChange={e=>{if(e.target.value==='new')openNewPortal();else setPortal(e.target.value);}} disabled={busy}>{portal==='new'&&<option value="" disabled>Select a Portal</option>}{portal!=='new'&&!selectedPortal&&<option value={portal} disabled>Portal unavailable — choose another</option>}{availableCategories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}<option value="new">Create a Portal</option></select></label>
     <button type="button" ref={newPortalButton} className="project-setup-add-portal" aria-label="Create a Portal" aria-haspopup="dialog" disabled={busy} onClick={openNewPortal}><PlusIcon size={18} aria-hidden="true"/></button>
    </div>}
    <label className="project-setup-description"><span>Note <span className="project-setup-optional">(optional)</span></span><textarea data-ui-shape="composer" value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Capture a thought…" rows={2} disabled={busy}/></label>
   </div>
   {error&&<p role="alert">{projectMessage(error)}</p>}
   {storageError&&<p role="alert">{projectMessage(storageError)}</p>}
  </form>
  <footer hidden={mobileAuthoring&&Boolean(validationError)}><button type="submit" form="project-setup-form" className="project-setup-continue" disabled={busy}>{busy?'Preparing…':'Continue'}</button></footer>
 </section></div></ModalPortal>;
}
