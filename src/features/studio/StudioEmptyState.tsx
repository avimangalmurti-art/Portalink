import React from 'react';
const studioEmptyCopy = {
  drafts: ['No drafts.', 'Start something and it will wait here.'],
  published: ['Nothing published yet.', 'Your published work appears here.'],
  bookmarks: ['Nothing saved yet.', 'Use Save on any page or project.'],
  references: ['No references yet.', 'References you add appear here.'],
  cited: ['No citations yet.', 'When someone builds on your work, it appears here.'],
} as const;
export function StudioEmptyState({ kind, action }: { kind: keyof typeof studioEmptyCopy; action?: {label:string; onClick:()=>void} }) {
  const [title, description] = studioEmptyCopy[kind];
  return <div className="studio-empty-state" role="status"><p className="studio-empty-title">{title}</p><p>{description}</p>{action && <button type="button" onClick={action.onClick}>{action.label}</button>}</div>;
}
