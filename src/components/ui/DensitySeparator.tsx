import React, { startTransition, useEffect, useLayoutEffect, useRef } from 'react';
import { MIN_PROJECT_GRID_COLUMNS, MAX_PROJECT_GRID_COLUMNS, normalizeProjectGridColumns } from '../../utils/projectGridDensity';
import { usePresentation } from '../../presentation/usePresentation';
import './density-separator.css';

/** The thumb moves freely between nearby magnetic stops; saves use whole columns. */
export function DensitySeparator({columns,onChange,onPreview,label}:{columns:number;onChange:(value:number)=>void;onPreview?:(value:number)=>void;label:string}) {
  const presentation=usePresentation(),mobile=presentation==='mobile';
  const scope=useRef({presentation});
  if(scope.current.presentation!==presentation)scope.current={presentation};
  const currentScope=scope.current;
  const input=useRef<HTMLInputElement>(null), frame=useRef<number|null>(null);
  const rawValue=useRef(columns);
  const dragging=useRef(false), pending=useRef<number|null>(null);
  const magneticStop=useRef<number|null>(null);
  const touch=useRef<{id:number;x:number;y:number;value:number;axis:'pending'|'horizontal'|'vertical'}|null>(null);
  const gesture=useRef<{scope:object;value:number;previewed:boolean;onPreview:typeof onPreview}|null>(null);
  const suppressUntilRelease=useRef(false);
  const callbacks=useRef({onChange,onPreview}); callbacks.current={onChange,onPreview};
  const thumbPosition=(value:number)=>(value-MIN_PROJECT_GRID_COLUMNS)/(MAX_PROJECT_GRID_COLUMNS-MIN_PROJECT_GRID_COLUMNS);
  const syncThumb=(element:HTMLInputElement,value:number)=>{
    rawValue.current=Number.isFinite(value)?Math.min(MAX_PROJECT_GRID_COLUMNS,Math.max(MIN_PROJECT_GRID_COLUMNS,value)):columns;
    if(mobile)element.style.setProperty('--density-position',String(thumbPosition(rawValue.current)));
  };
  const snapPointerValue=(raw:number)=>{
    if(!Number.isFinite(raw))return raw;
    const value=Math.min(MAX_PROJECT_GRID_COLUMNS,Math.max(MIN_PROJECT_GRID_COLUMNS,raw));
    // A wider release zone prevents jitter while moving across a stop's edge.
    if(magneticStop.current!==null&&Math.abs(value-magneticStop.current)<=.2+1e-6)return magneticStop.current;
    const nearest=Math.round(value);
    magneticStop.current=Math.abs(value-nearest)<=.12+1e-6?nearest:null;
    return magneticStop.current??value;
  };
  const cancelPending=(value:number)=>{
    const origin=gesture.current;
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;pending.current=null;dragging.current=false;magneticStop.current=null;touch.current=null;gesture.current=null;
    if(origin?.previewed)startTransition(()=>origin.onPreview?.(origin.value));
    if(input.current){input.current.value=String(value);syncThumb(input.current,value);}
  };
  useLayoutEffect(()=>{
    if(gesture.current&&gesture.current.scope!==currentScope){
      suppressUntilRelease.current=true;
      cancelPending(columns);
    }
    if(input.current){input.current.value=String(columns);syncThumb(input.current,columns);}
    // A presentation switch cancels only the departing interaction; ordinary
    // column refreshes must not interrupt a native thumb being dragged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[presentation]);
  useEffect(()=>{if(!dragging.current&&pending.current===null&&input.current){input.current.value=String(columns);rawValue.current=columns;}},[columns,presentation]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
  const beginGesture=(value=columns)=>{gesture.current??={scope:currentScope,value:normalizeProjectGridColumns(value),previewed:false,onPreview:callbacks.current.onPreview};};
  const preview=()=>{
    if(frame.current!==null)return;
    frame.current=requestAnimationFrame(()=>{
      if(scope.current!==currentScope||gesture.current?.scope!==currentScope)return;
      frame.current=null;const value=pending.current,origin=gesture.current;
      if(value!==null){origin.previewed=true;startTransition(()=>origin.onPreview?.(value));}
    });
  };
  const cancelTouch=()=>{
    if(scope.current!==currentScope)return;
    const origin=touch.current;
    if(origin)cancelPending(origin.value);
  };
  const commit=()=>{
    if(scope.current!==currentScope)return;
    magneticStop.current=null;
    if(suppressUntilRelease.current){suppressUntilRelease.current=false;if(input.current){input.current.value=String(columns);syncThumb(input.current,columns);}return;}
    if(gesture.current&&gesture.current.scope!==currentScope){cancelPending(columns);return;}
    if(touch.current?.axis==='vertical'){cancelTouch();return;}
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;dragging.current=false;touch.current=null;gesture.current=null;
    if(pending.current===null)return;
    const value=pending.current;pending.current=null;
    if(input.current){input.current.value=String(value);syncThumb(input.current,value);}
    callbacks.current.onChange(value);
  };
  return <><input ref={input} className="density-separator" type="range" min={MIN_PROJECT_GRID_COLUMNS} max={MAX_PROJECT_GRID_COLUMNS} step="any" defaultValue={columns}
    style={mobile?{'--density-position':thumbPosition(dragging.current||pending.current!==null?rawValue.current:columns)} as React.CSSProperties:undefined}
    aria-valuetext={`${columns} per row`}
    aria-label={label} onChange={event=>{
      if(scope.current!==currentScope)return;
      if(suppressUntilRelease.current){event.currentTarget.value=String(columns);syncThumb(event.currentTarget,columns);return;}
      beginGesture();
      if(touch.current?.axis==='vertical'){event.currentTarget.value=String(touch.current.value);syncThumb(event.currentTarget,touch.current.value);return;}
      if(dragging.current)event.currentTarget.value=String(snapPointerValue(Number(event.currentTarget.value)));
      syncThumb(event.currentTarget,Number(event.currentTarget.value));
      const value=normalizeProjectGridColumns(Number(event.currentTarget.value));
      if(pending.current===value)return;
      pending.current=value;
      // Native ranges may change on touch-down, before scroll intent is known.
      if(touch.current?.axis!=='pending')preview();
    }} onKeyDown={event=>{
      if(scope.current!==currentScope)return;
      suppressUntilRelease.current=false;
      magneticStop.current=null;
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      beginGesture();
      event.preventDefault();
      const current=normalizeProjectGridColumns(Number(event.currentTarget.value));
      const direction=event.key==='ArrowRight'||event.key==='ArrowUp'?1:-1;
      const rtl=(event.key==='ArrowLeft'||event.key==='ArrowRight')&&getComputedStyle(event.currentTarget).direction==='rtl';
      const value=normalizeProjectGridColumns(current+(rtl?-direction:direction));
      if(value===current)return;
      event.currentTarget.value=String(value);
      syncThumb(event.currentTarget,value);
      if(pending.current===value)return;
      pending.current=value;preview();
    }} onPointerDown={event=>{
      if(scope.current!==currentScope)return;
      suppressUntilRelease.current=false;
      magneticStop.current=null;
      beginGesture(Number(event.currentTarget?.value??input.current?.value??columns));
      dragging.current=true;event.stopPropagation();
      if(mobile&&event.pointerType==='touch')touch.current={id:event.pointerId,x:event.clientX,y:event.clientY,value:normalizeProjectGridColumns(Number(event.currentTarget.value)),axis:'pending'};
    }} onPointerMove={event=>{
      if(scope.current!==currentScope||suppressUntilRelease.current)return;
      const origin=touch.current;
      if(!origin||origin.id!==event.pointerId||origin.axis!=='pending')return;
      const dx=Math.abs(event.clientX-origin.x),dy=Math.abs(event.clientY-origin.y);
      if(Math.max(dx,dy)<8)return;
      if(dy>=dx){origin.axis='vertical';pending.current=null;magneticStop.current=null;event.currentTarget.value=String(origin.value);syncThumb(event.currentTarget,origin.value);}
      else {origin.axis='horizontal';if(pending.current!==null)preview();}
      // No preventDefault or pointer capture: native vertical panning wins.
    }} onPointerUp={event=>{event.stopPropagation();commit();}}
    onPointerCancel={()=>{if(touch.current)cancelTouch();else commit();}} onKeyUp={commit} onBlur={()=>{if(touch.current)cancelTouch();else commit();}}
    onClick={event=>event.stopPropagation()} /><span className="density-separator-ticks" aria-hidden="true">{Array.from({length:MAX_PROJECT_GRID_COLUMNS-MIN_PROJECT_GRID_COLUMNS+1},(_,index)=><span key={index} data-density-tick={MIN_PROJECT_GRID_COLUMNS+index} style={{'--density-tick-position':index/(MAX_PROJECT_GRID_COLUMNS-MIN_PROJECT_GRID_COLUMNS)} as React.CSSProperties} />)}</span></>;
}
