import React, { useId, useRef } from 'react';
import { SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import type { ContextActions, ContextAction } from '../../presentation/mobile/contextActions';

/** Shared message/context sheet: one viewport, focus, scrim and swipe lifecycle. */
export function MobileActionSheet({ model, onClose, onAction, children }: { model: ContextActions; onClose: () => void; onAction: (action: ContextAction) => void; children?: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null), viewportRef = useDialogViewport(), titleId = useId();
  const start = useRef<{x:number;y:number;id:number} | null>(null);
  useModalFocus(true, dialogRef, onClose, true);
  return <ModalPortal><div data-presentation="mobile" ref={viewportRef} className="mobile-context-scrim modal-scrim" style={{top:'var(--dialog-viewport-top, 0px)',height:'var(--dialog-viewport-height, 100dvh)'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div ref={dialogRef} className="mobile-context-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;if(e.target instanceof Element&&e.target.closest('button'))return;start.current={x:e.clientX,y:e.clientY,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{const from=start.current;start.current=null;if(from&&from.id===e.pointerId&&e.clientY-from.y>64&&Math.abs(e.clientX-from.x)<60)onClose();}} onPointerCancel={()=>{start.current=null;}}>
        <div className="mobile-context-handle" aria-hidden="true" />
        <div className="mobile-context-heading"><InterfaceIcon icon={SlidersHorizontalIcon}/><div><h2 id={titleId}>{model.title}</h2></div><button type="button" onClick={onClose} aria-label="Close actions"><InterfaceIcon icon={XIcon}/></button></div>
      </header>
      <div className="mobile-context-body">
        {model.primary.length>0&&<div className="mobile-context-primary" style={{gridTemplateColumns:`repeat(${model.primary.length}, minmax(0, 1fr))`}}>{model.primary.map(action=><button type="button" key={action.id} onClick={()=>onAction(action)}><InterfaceIcon icon={action.icon}/><span>{action.label}</span></button>)}</div>}
        {model.groups.map((group,i)=><div className="mobile-context-group" key={i}>{group.map(action=><button type="button" key={action.id} data-destructive={action.destructive||undefined} data-keep-color={action.destructive?'':undefined} onClick={()=>onAction(action)}><span>{action.label}</span><InterfaceIcon icon={action.icon}/></button>)}</div>)}
        {model.primary.length === 0 && model.groups.length === 0 && !children && <p className="px-2 py-4 text-sm text-[var(--text-secondary)]">No additional actions on this screen.</p>}
        {children}
      </div>
    </div>
  </div></ModalPortal>;
}
