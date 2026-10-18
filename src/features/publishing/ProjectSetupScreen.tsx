import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, PlusIcon, UsersIcon, XIcon } from 'lucide-react';
import { getCategoryIcon } from '../../components/profile/categoryIcons';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { validateTitle, TITLE_MAX_LENGTH } from './validation';
import { validateCategoryLabel, MAX_CATEGORY_LABEL } from '../profile/useCategoryManagement';
import type { PortfolioCategory } from '../../types/domain';
import './projectSetup.css';
export type ProjectSetup = { categoryId: string; categoryLabel: string; title: string; summary: string };
export function ProjectSetupScreen({categories,initialCategoryId,onCreatePortal,onConfirmPortal,onContinue,onClose}:{categories:PortfolioCategory[];initialCategoryId?:string|null;onCreatePortal:(name:string)=>Promise<PortfolioCategory|null>;onConfirmPortal?:(category:PortfolioCategory)=>Promise<void>;onContinue:(value:ProjectSetup)=>void;onClose:()=>void}) {
 const [portal,setPortal]=useState(initialCategoryId&&categories.some(c=>c.id===initialCategoryId)?initialCategoryId:categories[0]?.id??'new');
 const [retainedPortal,setRetainedPortal]=useState<PortfolioCategory|null>(categories.find(c=>c.id===portal)??null);
 const availableCategories=retainedPortal&&!categories.some(c=>c.id===retainedPortal.id)?[...categories,retainedPortal]:categories;
 const selectedPortal=availableCategories.find(c=>c.id===portal);
 const PortalIcon=portal==='new'?PlusIcon:getCategoryIcon(selectedPortal?.iconName??'globe');
 const [title,setTitle]=useState(''),[summary,setSummary]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const viewport=useDialogViewport(),panel=useRef<HTMLElement>(null),flight=useRef(false),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useModalFocus(true,panel,()=>{if(!flight.current)onClose();},true);
 async function proceed(){
  if(flight.current)return;
  const invalid=validateTitle(title)||(portal==='new'?validateCategoryLabel(name,categories,null):!availableCategories.some(c=>c.id===portal)?'Choose a portal.':null);
  if(invalid){setError(invalid);return;}
  flight.current=true;setBusy(true);setError('');
  try{const category=portal==='new'?await onCreatePortal(name.trim()):availableCategories.find(c=>c.id===portal);
   const categoryId=category?.id;
   if(!active.current)return;
   if(!categoryId){setError('The portal could not be created. Your project details are still here. Try again.');return;}
   // Keep the selected portal through refresh errors; confirmation still gates uploads.
   setPortal(categoryId);
   setRetainedPortal(category??null);
   if(category)await onConfirmPortal?.(category);
   if(!active.current)return;
   onContinue({categoryId,categoryLabel:category?.label??name.trim(),title:title.trim(),summary:summary.trim()});
  }catch(caught){if(active.current)setError((caught instanceof Error?caught.message:'Could not confirm this portal.')+' Your details are still here. Try again or choose another portal.');}
  finally{flight.current=false;if(active.current)setBusy(false);}
 }
 return <ModalPortal><div ref={viewport} className="project-setup-screen"><section ref={panel} role="dialog" aria-modal="true" data-material="content" aria-labelledby="project-setup-title" tabIndex={-1} className="project-setup-page">
  <header><button type="button" aria-label="Cancel new project" disabled={busy} onClick={onClose}><XIcon aria-hidden="true"/></button><h1 id="project-setup-title">New project</h1><button type="submit" form="project-setup-form" aria-label="Continue to upload" disabled={busy}><CheckIcon aria-hidden="true"/></button></header>
  <form id="project-setup-form" onSubmit={event=>{event.preventDefault();void proceed();}} noValidate>
   <div className="project-setup-group"><div className="project-setup-identity"><span className="project-setup-portal-icon" aria-hidden="true"><PortalIcon/></span><label><span className="sr-only">Project title</span><input autoFocus name="title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={TITLE_MAX_LENGTH} placeholder="Project title" disabled={busy} required/></label></div>
    <label className="project-setup-row"><span>Portal</span><select aria-label="Portal" value={portal} onChange={e=>setPortal(e.target.value)} disabled={busy}>{availableCategories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}<option value="new">Create new portal</option></select></label>
    {portal!=='new'&&<button type="button" className="project-setup-add-portal" disabled={busy} onClick={()=>setPortal('new')}><PlusIcon size={16} aria-hidden="true"/>Add new portal</button>}
    {portal==='new'&&<label className="project-setup-row"><span>Portal name</span><input autoFocus aria-label="New portal name" value={name} onChange={e=>setName(e.target.value)} maxLength={MAX_CATEGORY_LABEL} placeholder="Name your portal" disabled={busy}/></label>}
    <div className="project-setup-row"><span><UsersIcon size={18} aria-hidden="true"/>Collaboration</span><button type="button" disabled>Coming soon</button></div>
    <label className="project-setup-description"><span>Description (optional)</span><textarea value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Tell the story behind this project…" rows={5} disabled={busy}/></label>
   </div>
   <p className="project-setup-hint">{portal==='new'?'Continue creates this portal, then opens uploads.':'Next, choose the files and cover for this project.'} Nothing is published until you review and publish.</p>
   {error&&<p role="alert">{error}</p>}
   <button type="submit" className="project-setup-continue" disabled={busy}>{busy?'Preparing…':'Continue to upload'}</button>
  </form>
 </section></div></ModalPortal>;
}
