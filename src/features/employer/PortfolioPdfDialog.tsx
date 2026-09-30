import React, { useEffect, useRef, useState } from 'react';
import type { Profile } from '../../types/domain';
import { useServices } from '../../contexts/ServicesContext';
import { ProjectFormDialog } from '../../components/publishing/ProjectFormDialog';
import { Button } from '../../components/ui/Button';
import { defaultExportIds, exportCoverSource, exportPageTotal, exportProjectPageCount, PORTFOLIO_PAGE_LIMIT, profileHeadline, publicProjects } from './employer';
import { portfolioPath } from '../sharing/shareModel';

export function PortfolioPdfDialog({profileId, onClose}: {profileId:string; onClose:()=>void}) {
  const services=useServices();
  const [profile,setProfile]=useState<Profile|null>(null), [selected,setSelected]=useState<string[]>([]);
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState(''), [progress,setProgress]=useState('');
  const [ready,setReady]=useState<{url:string;name:string}|null>(null);
  const active=useRef<AbortController|null>(null), resultUrl=useRef<string|null>(null);
  useEffect(()=>{
    let alive=true;
    void (async()=>{
      try {
        // This public read is intentional even for the signed-in owner.
        const value=await services.profiles.getSharedProfile?.(profileId);
        if(!value || value.isPrivate || value.allowPdfDownload===false)throw new Error('This portfolio is not available for PDF download.');
        const ids=publicProjects(value).map(project=>project.id);
        const views=await services.projects.listProjectViews(ids);
        const hydrated={...value,projects:ids.flatMap(id=>views.filter(view=>view.project.id===id && view.creator.id===profileId && !view.creator.isPrivate && view.project.isPubliclyVisible!==false && !view.project.sessionOnly).map(view=>view.project))};
        if(alive){setProfile(hydrated);setSelected(defaultExportIds(hydrated));}
      } catch(e){if(alive)setError(e instanceof Error?e.message:'The portfolio could not be loaded.');}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;active.current?.abort();if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);};
  },[profileId,services]);
  const projects=profile?publicProjects(profile):[], chosen=selected.flatMap(id=>projects.filter(project=>project.id===id));
  const total=exportPageTotal(chosen), over=total>PORTFOLIO_PAGE_LIMIT;
  const clearResult=()=>{if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);resultUrl.current=null;setReady(null);};
  const generate=async()=>{
    if(active.current || !profile || !chosen.length || over)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');clearResult();setProgress('Checking the selected public projects…');
    try {
      const fresh=await services.profiles.getSharedProfile?.(profileId);
      controller.signal.throwIfAborted();
      if(!fresh || fresh.isPrivate || fresh.allowPdfDownload===false)throw new Error('The creator has disabled portfolio downloads.');
      const visible=new Set(publicProjects(fresh).map(project=>project.id));
      if(chosen.some(project=>!visible.has(project.id)))throw new Error('The available projects have changed. Close these options and choose again.');
      const views=await services.projects.listProjectViews(chosen.map(project=>project.id));
      controller.signal.throwIfAborted();
      if(views.length!==chosen.length || views.some(view=>view.creator.id!==profileId || view.creator.isPrivate || view.project.isPubliclyVisible===false || view.project.sessionOnly))throw new Error('One of these projects is no longer public. Choose again.');
      // A downloaded file may live longer than a handle's 90-day alias window.
      const url=new URL(portfolioPath(profileId),window.location.origin).href;
      controller.signal.throwIfAborted();
      const {createPortfolioPdf}=await import('./portfolioPdf');
      const blob=await createPortfolioPdf(fresh,chosen.flatMap(project=>views.filter(view=>view.project.id===project.id).map(view=>view.project)),url,controller.signal,message=>{if(!controller.signal.aborted)setProgress(message);});
      controller.signal.throwIfAborted();
      const objectUrl=URL.createObjectURL(blob);resultUrl.current=objectUrl;
      setReady({url:objectUrl,name:`${Array.from(fresh.name).filter(char=>char.charCodeAt(0)>=32).join('').replace(/[<>:"/\\|?*]/g,'').trim() || 'Creator'} — Portfolio.pdf`});
      setProgress('Your PDF is ready.');
    } catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'The PDF could not be created. Try fewer projects.');}
    finally{if(active.current===controller){active.current=null;setBusy(false);}}
  };
  return <ProjectFormDialog title="Download portfolio PDF" titleId="portfolio-pdf-title" onClose={onClose} description="Choose the work to take with you. No account needed.">
    <div className="project-form-content portfolio-pdf-options">
      {loading && <p role="status">Loading public projects…</p>}
      {profile && <>
        <p>PDFs and images · Up to 120 pages, including the cover.</p>
        <fieldset disabled={busy} aria-label="Projects to include">{projects.map(project=><label key={project.id}>
          <input type="checkbox" checked={selected.includes(project.id)} onChange={()=>{clearResult();setSelected(ids=>ids.includes(project.id)?ids.filter(id=>id!==project.id):[...ids,project.id]);}} />
          <span>{project.title}<small>{exportProjectPageCount(project)} {exportProjectPageCount(project)===1?'page':'pages'}</small></span>
        </label>)}</fieldset>
        <p>{chosen.length} selected · {total} pages including cover{chosen.some(project=>!project.pageCount)?' (estimated)':''}</p>
        {over && <p role="alert">Choose fewer projects to stay within the 120-page limit.</p>}
        <div className="portfolio-pdf-cover-preview" aria-label="Portfolio cover preview"><small>PORTFOLIO</small><h3>{profile.name}</h3><p>{profileHeadline(profile)}</p><div className="portfolio-pdf-preview-covers">{chosen.slice(0,3).filter(project=>exportCoverSource(project)).map(project=><img key={project.id} src={exportCoverSource(project)} alt={project.title} />)}</div><small>{chosen.length} selected projects · {total} pages</small></div>
        <p>Pages are flattened for reading, at up to 150 dpi. Video, audio and interactive projects cannot be included. The live link and QR keep the original work accessible.</p>
        {!ready && <Button disabled={busy || !chosen.length || over} onClick={()=>void generate()}>{busy?'Creating PDF…':'Create PDF'}</Button>}
        {busy && <Button variant="secondary" onClick={()=>{active.current?.abort();active.current=null;setBusy(false);setProgress('Canceled. You can choose a smaller selection and try again.');}}>Cancel</Button>}
        {ready && <a href={ready.url} download={ready.name} data-ui-control="button" data-control-size="md" data-control-variant="primary">Save PDF</a>}
        {progress && <p role="status" aria-live="polite">{progress}</p>}
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  </ProjectFormDialog>;
}
