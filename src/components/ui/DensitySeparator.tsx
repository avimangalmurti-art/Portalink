import React, { startTransition, useEffect, useRef } from 'react';
import { MIN_PROJECT_GRID_COLUMNS, MAX_PROJECT_GRID_COLUMNS, normalizeProjectGridColumns } from '../../utils/projectGridDensity';
import { usePresentation } from '../../presentation/usePresentation';
import './density-separator.css';

/** Desktop thumb tracks the pointer continuously; grid previews and saves use whole columns. */
export function DensitySeparator({columns,onChange,onPreview,label}:{columns:number;onChange:(value:number)=>void;onPreview?:(value:number)=>void;label:string}) {
  const mobile=usePresentation()==='mobile';
  const input=useRef<HTMLInputElement>(null), frame=useRef<number|null>(null);
  const dragging=useRef(false), pending=useRef<number|null>(null);
  const touch=useRef<{id:number;x:number;y:number;value:number;axis:'pending'|'horizontal'|'vertical';previewed:boolean}|null>(null);
  const callbacks=useRef({onChange,onPreview}); callbacks.current={onChange,onPreview};
  const thumbPosition=(value:number)=>(value-MIN_PROJECT_GRID_COLUMNS)/(MAX_PROJECT_GRID_COLUMNS-MIN_PROJECT_GRID_COLUMNS);
  const syncThumb=(element:HTMLInputElement,value:number)=>{if(mobile)element.style.setProperty('--density-position',String(thumbPosition(value)));};
  useEffect(()=>{if(!dragging.current&&pending.current===null&&input.current)input.current.value=String(columns);},[columns]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
  const preview=()=>{
    if(frame.current!==null)return;
    frame.current=requestAnimationFrame(()=>{
      frame.current=null;const value=pending.current;
      if(value!==null){if(touch.current)touch.current.previewed=true;startTransition(()=>callbacks.current.onPreview?.(value));}
    });
  };
  const cancelTouch=()=>{
    const origin=touch.current;
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;pending.current=null;dragging.current=false;touch.current=null;
    if(!origin)return;
    if(input.current){input.current.value=String(origin.value);syncThumb(input.current,origin.value);}
    if(origin.previewed)startTransition(()=>callbacks.current.onPreview?.(origin.value));
  };
  const commit=()=>{
    if(touch.current?.axis==='vertical'){cancelTouch();return;}
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;dragging.current=false;touch.current=null;
    if(pending.current===null)return;
    const value=pending.current;pending.current=null;
    if(!mobile&&input.current)input.current.value=String(value);
    callbacks.current.onChange(value);
  };
  return <input ref={input} className="density-separator" type="range" min={MIN_PROJECT_GRID_COLUMNS} max={MAX_PROJECT_GRID_COLUMNS} step={mobile?1:'any'} defaultValue={columns}
    style={mobile?{'--density-position':thumbPosition(columns)} as React.CSSProperties:undefined}
    aria-valuetext={mobile?undefined:`${columns} per row`}
    aria-label={label} onChange={event=>{
      if(touch.current?.axis==='vertical'){event.currentTarget.value=String(touch.current.value);syncThumb(event.currentTarget,touch.current.value);return;}
      const value=mobile?Number(event.currentTarget.value):normalizeProjectGridColumns(Number(event.currentTarget.value));
      if(!mobile&&pending.current===value)return;
      pending.current=value;
      syncThumb(event.currentTarget,pending.current);
      // Native ranges may change on touch-down, before scroll intent is known.
      if(touch.current?.axis!=='pending')preview();
    }} onKeyDown={event=>{
      if(mobile||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      const current=normalizeProjectGridColumns(Number(event.currentTarget.value));
      const direction=event.key==='ArrowRight'||event.key==='ArrowUp'?1:-1;
      const rtl=(event.key==='ArrowLeft'||event.key==='ArrowRight')&&getComputedStyle(event.currentTarget).direction==='rtl';
      const value=normalizeProjectGridColumns(current+(rtl?-direction:direction));
      if(value===current)return;
      event.currentTarget.value=String(value);
      if(pending.current===value)return;
      pending.current=value;preview();
    }} onPointerDown={event=>{
      dragging.current=true;event.stopPropagation();
      if(mobile&&event.pointerType==='touch')touch.current={id:event.pointerId,x:event.clientX,y:event.clientY,value:Number(event.currentTarget.value),axis:'pending',previewed:false};
    }} onPointerMove={event=>{
      const origin=touch.current;
      if(!origin||origin.id!==event.pointerId||origin.axis!=='pending')return;
      const dx=Math.abs(event.clientX-origin.x),dy=Math.abs(event.clientY-origin.y);
      if(Math.max(dx,dy)<8)return;
      if(dy>=dx){origin.axis='vertical';pending.current=null;event.currentTarget.value=String(origin.value);syncThumb(event.currentTarget,origin.value);}
      else {origin.axis='horizontal';if(pending.current!==null)preview();}
      // No preventDefault or pointer capture: native vertical panning wins.
    }} onPointerUp={event=>{event.stopPropagation();commit();}}
    onPointerCancel={()=>{if(touch.current)cancelTouch();else commit();}} onKeyUp={commit} onBlur={()=>{if(touch.current)cancelTouch();else commit();}}
    onClick={event=>event.stopPropagation()} />;
}
