import { useSheetMotion } from '../../presentation/motion/useSheetMotion';
import React, { useId, useRef, useState } from 'react';
import { SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { usePresentation } from '../../presentation/usePresentation';
import type { ContextActions, ContextAction } from '../../presentation/mobile/contextActions';

/** Shared message/context sheet: one viewport, focus, scrim and swipe lifecycle. */
export function MobileActionSheet({ model, onClose, onAction, beforeActions, children, layout = 'actions', onboardingFiles = false }: { model: ContextActions; onClose: () => void; onAction: (action: ContextAction) => void; beforeActions?: React.ReactNode; children?: React.ReactNode; layout?: 'actions' | 'files'; onboardingFiles?: boolean }) {
  const presentation = usePresentation();
  const mobile = presentation === 'mobile';
  const motion=useSheetMotion(onClose);
  const [dragY,setDragY]=useState(0);
  const [dragging,setDragging]=useState(false);
  const [interacted,setInteracted]=useState(false);
  const dialogRef = useRef<HTMLDivElement>(null), viewportRef = useDialogViewport(), titleId = useId();
  const ownerProfile = layout === 'actions' && model.kind === 'profile' && Boolean(model.viewer?.owner);
  // Phone menus start at the compact detent; expansion is an explicit action.
  const [expanded, setExpanded] = useState(ownerProfile && !mobile);
  const dismiss = () => motion.close(onClose, viewportRef.current);
  const start = useRef<{x:number;y:number;id:number;rest:number;offset:number} | null>(null);
  const dragged = useRef(false);
  const cancelDrag = () => { start.current = null; setDragging(false); setDragY(0); };
  useModalFocus(true, dialogRef, dismiss, true);
  return <ModalPortal><div data-presentation={onboardingFiles ? presentation : 'mobile'} data-onboarding-files-manager={onboardingFiles || undefined} data-sheet-layout={layout === 'files' ? layout : undefined} ref={viewportRef} data-motion-scrim="" data-motion-closing={motion.closing || undefined} className="mobile-context-scrim modal-scrim" style={{...(ownerProfile ? {top:'var(--dialog-viewport-top, 0px)',bottom:'auto'} : {bottom:0}),height:'var(--dialog-viewport-height, 100dvh)'}} onClick={e=>{if(e.target===e.currentTarget)dismiss();}}>
    <div data-ui-surface="sheet" data-onboarding-files-manager={onboardingFiles || undefined} data-sheet-layout={layout === 'files' ? layout : undefined} ref={dialogRef} className="mobile-context-sheet" data-expanded={expanded} data-motion-sheet="" data-motion-closing={motion.closing || undefined} data-sheet-dragging={dragging || undefined} data-sheet-interacted={interacted || undefined} style={{['--sheet-drag-y' as string]:`${dragY}px`}} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header onPointerDown={e=>{
        if(onboardingFiles&&!mobile)return;
        if(!e.isPrimary||e.button!==0||start.current)return;
        if(e.target instanceof Element&&e.target.closest('button:not(.mobile-context-resize)'))return;
        const dialog = dialogRef.current, viewport = viewportRef.current;
        if(!dialog||!viewport)return;
        const bounds = dialog.getBoundingClientRect(), available = viewport.getBoundingClientRect();
        const rest = expanded ? 0 : Math.max(0,bounds.height-available.height*.75);
        const offset = Math.max(0,bounds.bottom-available.bottom);
        start.current={x:e.clientX,y:e.clientY,id:e.pointerId,rest,offset};
        setInteracted(true);
        setDragging(true);
        // Catch an entrance/settle in progress without jumping to its destination.
        setDragY(offset-rest);
        dragged.current=false;
        const handle=e.target instanceof Element?e.target.closest('.mobile-context-resize'):null;
        (handle??e.currentTarget).setPointerCapture(e.pointerId);
      }} onPointerMove={e=>{
        const from=start.current;
        if(!from||from.id!==e.pointerId)return;
        if(Math.abs(e.clientX-from.x)>=60){dragged.current=true;cancelDrag();return;}
        const delta=from.y-e.clientY;
        if(Math.abs(delta)>8)dragged.current=true;
        if(dragged.current)setDragY(Math.max(0,from.offset-delta)-from.rest);
      }} onPointerUp={e=>{
        const from=start.current;
        if(!from||from.id!==e.pointerId)return;
        cancelDrag();
        const handle=e.currentTarget.querySelector('.mobile-context-resize');
        for(const target of [handle,e.currentTarget])if(target?.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);
        if(Math.abs(e.clientX-from.x)>=60){dragged.current=true;return;}
        const delta=from.y-e.clientY;
        if(Math.abs(delta)>8)dragged.current=true;
        if(delta>=40)setExpanded(true);
        else if(delta<=-40&&expanded)setExpanded(false);
        else if(delta<-64){setDragY(Math.max(0,from.offset-delta)-from.rest);dismiss();}
      }} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>
        {(!onboardingFiles||mobile)&&<button type="button" className="mobile-context-resize" aria-label={expanded?'Collapse actions':'Expand actions'} aria-expanded={expanded} onClick={e=>{
          if(dragged.current&&e.detail!==0){dragged.current=false;return;}
          dragged.current=false;
          setInteracted(true);
          setExpanded(value=>!value);
        }}><span className="mobile-context-handle" aria-hidden="true" /></button>}
        <div className="mobile-context-heading">{!mobile && model.kind !== 'home' && <InterfaceIcon icon={SlidersHorizontalIcon}/>}<div><h2 id={titleId}>{model.title}</h2></div><button type="button" data-ui-control={layout === 'files' ? 'button' : 'icon'} data-control-size={onboardingFiles ? 'sm' : 'md'} data-control-variant="secondary" onClick={dismiss} aria-label={layout === 'files' ? 'Done reordering files' : 'Close actions'}>{layout === 'files' ? 'Done' : <InterfaceIcon icon={XIcon}/>}</button></div>
      </header>
      <div className={`mobile-context-body${mobile ? ' overflow-y-auto' : ''}`}>
        {beforeActions}
        {model.primary.length>0&&<div className="mobile-context-primary" style={{gridTemplateColumns:`repeat(${model.primary.length}, minmax(0, 1fr))`}}>{model.primary.map(action=><button type="button" key={action.id} onClick={event=>motion.close(()=>onAction(action),event?.currentTarget?.closest<HTMLElement>('[data-motion-scrim]'))}><InterfaceIcon icon={action.icon}/><span>{action.label}</span></button>)}</div>}
        {model.groups.map((group,i)=><div className="mobile-context-group" key={i}>{group.map(action=><button type="button" key={action.id} data-destructive={action.destructive||undefined} data-keep-color={action.destructive?'':undefined} onClick={event=>motion.close(()=>onAction(action),event?.currentTarget?.closest<HTMLElement>('[data-motion-scrim]'))}><span>{action.label}</span><InterfaceIcon icon={action.icon}/></button>)}</div>)}
        {!beforeActions && model.primary.length === 0 && model.groups.length === 0 && !children && <p className="px-2 py-4 text-sm text-[var(--text-secondary)]">No additional actions on this screen.</p>}
        {children}
      </div>
    </div>
  </div></ModalPortal>;
}
