import React from 'react';
import { MIN_PROJECT_GRID_COLUMNS, MAX_PROJECT_GRID_COLUMNS } from '../../utils/projectGridDensity';
import './density-separator.css';

/** Native range over the existing hairline; values are accessible, never printed. */
export function DensitySeparator({columns,onChange,label}:{columns:number;onChange:(value:number)=>void;label:string}) {
  return <input className="density-separator" type="range" min={MIN_PROJECT_GRID_COLUMNS} max={MAX_PROJECT_GRID_COLUMNS} step={1} value={columns}
    aria-label={label} onChange={event=>onChange(Number(event.currentTarget.value))} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} />;
}
