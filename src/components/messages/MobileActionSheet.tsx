import { useSheetMotion } from '../../presentation/motion/useSheetMotion';
import React, { useId, useRef, useState } from 'react';
import { SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import type { ContextActions, ContextAction } from '../../presentation/mobile/contextActions';

/** Shared message/context sheet: one viewport, focus, scrim and swipe lifecycle. */
export function MobileActionSheet({ model, onClose, onAction, children }: { model: ContextActions; onClose: () => void; onAction: (action: ContextAction) => void; children?: React.ReactNode }) {
  const motion=useSheetMotion(onClose);
  const [dragY,setDragY]=useState(0);
  const dialogRef = useRef<HTMLDivElement>(null), viewportRef = useDialogViewport(), titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const start = useRef<{x:number;y:number;id:number;height:number;min:number;max:number} | null>(null);
  const dragged = useRef(false);
  const cancelDrag = () => { start.current = null; setDragHeight(null); setDragY(0); };
  useModalFocus(true, dialogRef, ()=>motion.close(), true);
  return <ModalPortal><div data-presentation="mobile" ref={viewportRef} data-motion-scrim="" data-motion-closing={motion.closing || undefined} className="mobile-context-scrim modal-scrim" style={{bottom:0,height:'var(--dialog-viewport-height, 100dvh)'}} onClick={e=>{if(e.target===e.currentTarget)motion.close();}}>
    <div ref={dialogRef} className="mobile-context-sheet" data-expanded={expanded} data-motion-sheet="" data-motion-closing={motion.closing || undefined} data-sheet-dragging={Boolean(start.current) || undefined} style={{height:dragHeight??undefined,['--sheet-drag-y' as string]:`${dragY}px`}} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header onPointerDown={e=>{
        if(!e.isPrimary||e.button!==0||start.current)return;
        if(e.target instanceof Element&&e.target.closest('button:not(.mobile-context-resize)'))return;
        const dialog = dialogRef.current, viewport = viewportRef.current;
        if(!dialog||!viewport)return;
        const available = viewport.getBoundingClientRect().height;
        start.current={x:e.clientX,y:e.clientY,id:e.pointerId,height:dialog.getBoundingClientRect().height,min:available*.75,max:available-16};
        dragged.current=false;
        const handle=e.target instanceof Element?e.target.closest('.mobile-context-resize'):null;
        (handle??e.currentTarget).setPointerCapture(e.pointerId);
      }} onPointerMove={e=>{
        const from=start.current;
        if(!from||from.id!==e.pointerId)return;
        if(Math.abs(e.clientX-from.x)>=60){dragged.current=true;cancelDrag();return;}
        const delta=from.y-e.clientY;
        if(Math.abs(delta)>8)dragged.current=true;
        // Resize upward inside the viewport; never translate the bottom edge.
        if(dragged.current&&delta<0)setDragY(-delta);
        else if(dragged.current)setDragHeight(Math.max(from.min,Math.min(from.max,from.height+delta)));
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
        else if(delta<-64){setDragY(-delta);motion.close();}
      }} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>
        <button type="button" className="mobile-context-resize" aria-label={expanded?'Collapse actions':'Expand actions'} aria-expanded={expanded} onClick={e=>{
          if(dragged.current&&e.detail!==0){dragged.current=false;return;}
          dragged.current=false;
          setExpanded(value=>!value);
        }}><span className="mobile-context-handle" aria-hidden="true" /></button>
        <div className="mobile-context-heading">{model.kind !== 'home' && <InterfaceIcon icon={SlidersHorizontalIcon}/>}<div><h2 id={titleId}>{model.title}</h2></div><button type="button" onClick={()=>motion.close()} aria-label="Close actions"><InterfaceIcon icon={XIcon}/></button></div>
      </header>
      <div className="mobile-context-body">
        {model.primary.length>0&&<div className="mobile-context-primary" style={{gridTemplateColumns:`repeat(${model.primary.length}, minmax(0, 1fr))`}}>{model.primary.map(action=><button type="button" key={action.id} onClick={event=>motion.close(()=>onAction(action),event?.currentTarget?.closest<HTMLElement>('[data-motion-scrim]'))}><InterfaceIcon icon={action.icon}/><span>{action.label}</span></button>)}</div>}
        {model.groups.map((group,i)=><div className="mobile-context-group" key={i}>{group.map(action=><button type="button" key={action.id} data-destructive={action.destructive||undefined} data-keep-color={action.destructive?'':undefined} onClick={event=>motion.close(()=>onAction(action),event?.currentTarget?.closest<HTMLElement>('[data-motion-scrim]'))}><span>{action.label}</span><InterfaceIcon icon={action.icon}/></button>)}</div>)}
        {model.primary.length === 0 && model.groups.length === 0 && !children && <p className="px-2 py-4 text-sm text-[var(--text-secondary)]">No additional actions on this screen.</p>}
        {children}
      </div>
    </div>
  </div></ModalPortal>;
}
