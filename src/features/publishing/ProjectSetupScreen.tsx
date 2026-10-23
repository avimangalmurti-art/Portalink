import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, PlusIcon, XIcon } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { PortalIconLibrary } from '../../components/profile/PortalIconLibrary';
import { getCategoryIcon, getPortalIconLabel, portalIconNames } from '../../components/profile/categoryIcons';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useAuthoringFocus } from '../../components/publishing/useAuthoringFocus';
import { usePresentation } from '../../presentation/usePresentation';
import { validateTitle, TITLE_MAX_LENGTH } from './validation';
import { validateCategoryLabel, MAX_CATEGORY_LABEL } from '../profile/useCategoryManagement';
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
 const [title,setTitle]=useState(initial.current.value?.title??''),[summary,setSummary]=useState(initial.current.value?.summary??''),[name,setName]=useState(initial.current.value?.name??''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const restoredIcon=initial.current.value?.iconName;
 const [iconName,setIconName]=useState(restoredIcon&&portalIconNames.includes(restoredIcon)?restoredIcon:DEFAULT_PORTAL_ICON);
 const [choosingIcon,setChoosingIcon]=useState(false);
 const iconButton=useRef<HTMLButtonElement>(null),wasChoosingIcon=useRef(false);
 const PortalIcon=getCategoryIcon(iconName);
 const [storageError,setStorageError]=useState(initial.current.error);
 const lastSaved=useRef(initial.current.value?JSON.stringify(initial.current.value):'');
 const setup={title,summary,portal,name,iconName};
 const hasDetails=Boolean(title||summary||name||iconName!==DEFAULT_PORTAL_ICON||portal!==initial.current.defaultPortal||lastSaved.current);
 function saveSetup(value:SetupDraft=setup){
  if(!accountId||!profileId||!hasDetails)return true;
  try{const signature=JSON.stringify(value);if(signature!==lastSaved.current){saveSetupDraft(accountId,profileId,value);lastSaved.current=signature;}setStorageError('');return true;}
  catch(caught){setStorageError(caught instanceof Error?caught.message:'Project details could not be saved on this device. Keep this screen open.');return false;}
 }
 function requestClose(){if(saveSetup())onClose();}
 const viewport=useDialogViewport(),panel=useRef<HTMLElement>(null),flight=useRef(false),active=useRef(true);
 useAuthoringFocus(viewport);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useModalFocus(true,panel,()=>{if(choosingIcon)setChoosingIcon(false);else if(!flight.current)requestClose();},true);
 useEffect(()=>{
  if(choosingIcon)panel.current?.focus({preventScroll:true});
  else if(wasChoosingIcon.current)iconButton.current?.focus({preventScroll:true});
  wasChoosingIcon.current=choosingIcon;
 },[choosingIcon]);
 useEffect(()=>{saveSetup();},[accountId,profileId,title,summary,portal,name,iconName]); // eslint-disable-line react-hooks/exhaustive-deps -- save the current authored fields, not status updates.
 async function proceed(){
  if(flight.current||choosingIcon)return;
  const invalid=validateTitle(title)||(portal==='new'?validateCategoryLabel(name,categories,null):!availableCategories.some(c=>c.id===portal)?'Choose a portal.':null);
  if(invalid){setError(invalid.replace(/\bcategory\b/g,'Portal'));return;}
  flight.current=true;setBusy(true);setError('');
  try{const category=portal==='new'?await onCreatePortal(name.trim(),iconName):availableCategories.find(c=>c.id===portal);
   const categoryId=category?.id;
   if(!active.current)return;
   if(!categoryId){setError('The Portal could not be created. Your project details are still here. Try again.');return;}
   // Keep the selected portal through refresh errors; confirmation still gates uploads.
   setPortal(categoryId);
   setRetainedPortal(category??null);
   saveSetup({title,summary,portal:categoryId,name,iconName});
   if(category)await onConfirmPortal?.(category);
   if(!active.current)return;
   onContinue({categoryId,categoryLabel:category?.label??name.trim(),title:title.trim(),summary:summary.trim()});
  }catch(caught){if(active.current)setError((caught instanceof Error?caught.message:'Could not confirm this portal.')+' Your details are still here. Try again or choose another portal.');}
  finally{flight.current=false;if(active.current)setBusy(false);}
 }
 return <ModalPortal><div ref={viewport} className="project-setup-screen modal-scrim" data-presentation={presentation}><section ref={panel} role="dialog" aria-modal="true" data-material="content" data-ui-shape={presentation==='mobile'?'sheet':'popup'} aria-labelledby="project-setup-title" tabIndex={-1} className="project-setup-page">
  <header><button type="button" aria-label={choosingIcon?'Back to new project':'Cancel new project'} disabled={busy} onClick={choosingIcon?()=>setChoosingIcon(false):requestClose}>{choosingIcon?<ArrowLeftIcon aria-hidden="true"/>:<XIcon aria-hidden="true"/>}</button><h1 id="project-setup-title">{choosingIcon?'Portal icon':'New project'}</h1><span className="project-setup-header-balance" aria-hidden="true"/></header>
  <form id="project-setup-form" hidden={choosingIcon} onSubmit={event=>{event.preventDefault();void proceed();}} noValidate>
   <div className="project-setup-art" aria-hidden="true"><img src="/onboarding/process.webp" alt="" width="1254" height="1254" draggable={false}/></div>
   <p className="project-setup-intro">Add to your catalogue.</p>
   {recoveryDraft&&onResumeDraft&&<div className="project-setup-recovery"><span>{recoveryDraft.metadata.title||'Your project'}</span><button type="button" disabled={busy} onClick={()=>{if(saveSetup())onResumeDraft(recoveryDraft.draft);}}>{recoveryDraft.committed?'Finish published project':'Continue draft'}</button></div>}
   {recoveryError&&<p role="alert">{projectMessage(recoveryError)}</p>}
   <div className="project-setup-group"><label className="project-setup-identity"><span>Title</span><input autoFocus name="title" data-ui-shape="field" value={title} onChange={e=>setTitle(e.target.value)} maxLength={TITLE_MAX_LENGTH} placeholder="Enter a title" disabled={busy} required/></label>
    {(availableCategories.length>0||portal!=='new')&&<div className="project-setup-portal-choice"><label className="project-setup-row"><span>Portal</span><select aria-label="Portal" data-ui-shape="field" value={portal} onChange={e=>setPortal(e.target.value)} disabled={busy}>{portal!=='new'&&!selectedPortal&&<option value={portal} disabled>Portal unavailable — choose another</option>}{availableCategories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}<option value="new">Create a Portal</option></select></label>
     {portal!=='new'&&<button type="button" className="project-setup-add-portal" aria-label="Create a Portal" disabled={busy} onClick={()=>setPortal('new')}><PlusIcon size={18} aria-hidden="true"/></button>}
    </div>}
    {portal==='new'&&<div className="project-setup-new-portal-row"><label className="project-setup-row project-setup-new-portal"><span>Portal name</span><input autoFocus={initial.current.defaultPortal!=='new'} aria-label="New portal name" data-ui-shape="field" value={name} onChange={e=>setName(e.target.value)} maxLength={MAX_CATEGORY_LABEL} placeholder="Name your Portal" disabled={busy}/></label><button ref={iconButton} type="button" className="project-setup-icon-choice" data-ui-control="button" data-control-size="md" data-control-variant="secondary" data-ui-shape="action" aria-label="Choose Portal icon" title={getPortalIconLabel(iconName)} disabled={busy} onClick={()=>setChoosingIcon(true)}><InterfaceIcon icon={PortalIcon} size="lg"/><span>Choose icon</span></button></div>}
    <label className="project-setup-description"><span>Note <span className="project-setup-optional">(optional)</span></span><textarea data-ui-shape="composer" value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Capture a thought…" rows={2} disabled={busy}/></label>
   </div>
   {error&&<p role="alert">{projectMessage(error)}</p>}
   {storageError&&<p role="alert">{projectMessage(storageError)}</p>}
  </form>
  {choosingIcon&&<div className="project-setup-icon-picker" data-portal-icon-scroll=""><p className="project-setup-icon-portal">{name.trim()||'Your Portal'}</p><PortalIconLibrary compact selected={iconName} disabled={busy} onSelect={selected=>{if(!busy){setIconName(selected);setChoosingIcon(false);}}}/></div>}
  <footer hidden={choosingIcon}><button type="submit" form="project-setup-form" className="project-setup-continue" disabled={busy}>{busy?'Preparing…':'Continue'}</button></footer>
 </section></div></ModalPortal>;
}
