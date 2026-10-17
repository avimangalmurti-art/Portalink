import React from 'react';
import type { DraftMetadata } from '../../types/publishing';
export function ProjectCitationFields({ metadata, disabled, onChange }: {metadata: DraftMetadata; disabled: boolean; onChange: (value: Pick<DraftMetadata, 'accessLevel' | 'madeOn'>) => void}) {
  return <div className="project-citation-fields">
    <label>Made on<input type="date" value={metadata.madeOn ?? new Date().toISOString().slice(0,10)} min="1900-01-01" max={new Date(Date.now()+86400000).toISOString().slice(0,10)} disabled={disabled} onChange={e=>onChange({madeOn:e.target.value})}/></label>
    <label>Access<select value={metadata.accessLevel === 'citable' ? 'public' : metadata.accessLevel ?? 'private'} disabled={disabled} onChange={e=>onChange({accessLevel:e.target.value as 'private'|'public'|'citable'})}><option value="private">Private</option><option value="public">Public</option></select></label>
<p>Optional AI retrieval and reproduction are unavailable at launch.</p>
  </div>;
}
