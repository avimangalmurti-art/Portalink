import React, { startTransition, useEffect, useRef } from 'react';
import { MIN_PROJECT_GRID_COLUMNS, MAX_PROJECT_GRID_COLUMNS } from '../../utils/projectGridDensity';
import './density-separator.css';

/** Native thumb moves immediately; previews are frame-limited and saves commit on release. */
export function DensitySeparator({columns,onChange,onPreview,label}:{columns:number;onChange:(value:number)=>void;onPreview?:(value:number)=>void;label:string}) {
  const input=useRef<HTMLInputElement>(null), frame=useRef<number|null>(null);
  const dragging=useRef(false), pending=useRef<number|null>(null);
  const callbacks=useRef({onChange,onPreview}); callbacks.current={onChange,onPreview};
  useEffect(()=>{if(!dragging.current&&pending.current===null&&input.current)input.current.value=String(columns);},[columns]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
  const commit=()=>{
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;dragging.current=false;
    if(pending.current===null)return;
    const value=pending.current;pending.current=null;
    callbacks.current.onChange(value);
  };
  return <input ref={input} className="density-separator" type="range" min={MIN_PROJECT_GRID_COLUMNS} max={MAX_PROJECT_GRID_COLUMNS} step={1} defaultValue={columns}
    aria-label={label} onChange={event=>{
      pending.current=Number(event.currentTarget.value);
      if(frame.current!==null)return;
      frame.current=requestAnimationFrame(()=>{
        frame.current=null;const value=pending.current;
        if(value!==null)startTransition(()=>callbacks.current.onPreview?.(value));
      });
    }} onPointerDown={event=>{dragging.current=true;event.stopPropagation();}}
    onPointerUp={event=>{event.stopPropagation();commit();}} onPointerCancel={commit} onKeyUp={commit} onBlur={commit}
    onClick={event=>event.stopPropagation()} />;
}