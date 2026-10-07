import React from 'react';
import type { DraftMetadata } from '../../types/publishing';
export function ProjectCitationFields({ metadata, disabled, onChange }: {metadata: DraftMetadata; disabled: boolean; onChange: (value: Pick<DraftMetadata, 'accessLevel' | 'madeOn'>) => void}) {
  return <div className="project-citation-fields">
    <label>Made on<input type="date" value={metadata.madeOn ?? new Date().toISOString().slice(0,10)} min="1900-01-01" max={new Date(Date.now()+86400000).toISOString().slice(0,10)} disabled={disabled} onChange={e=>onChange({madeOn:e.target.value})}/></label>
    <label>Access<select value={metadata.accessLevel ?? 'public'} disabled={disabled} onChange={e=>onChange({accessLevel:e.target.value as 'private'|'public'|'citable'})}><option value="private">Private</option><option value="public">Public</option><option value="citable">Citable</option></select></label>
    {metadata.accessLevel==='citable'&&<p>Others' AI tools may use single pages or images from this project, always with your name and a link back.</p>}
  </div>;
}
