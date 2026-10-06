import React, { useEffect, useState } from 'react';
import { EngagementBar } from '../../features/engagement/EngagementBar';
import type { ProjectEngagementLifecycle } from '../../features/engagement/useProjectEngagement';
import type { EngagementKind } from '../../types/engagement';
import { useServices } from '../../contexts/ServicesContext';
import { InternalContentShareDialog } from '../../features/sharing/InternalContentShare';
import { CreatorAvatar } from '../profile/CreatorAvatar';

export function ProjectPopupEngagement({ projectId, projectTitle, url, engagement, onRequireAccount }: { projectId: string; projectTitle: string; url: string; engagement: ProjectEngagementLifecycle; onRequireAccount?: () => void }) {
 const { engagement: service } = useServices();
 const [selected, setSelected] = useState<EngagementKind | 'share' | null>(null);
 const [people, setPeople] = useState<Array<{id: string; name: string; avatar: string}>>([]);
 const [offset, setOffset] = useState(0), [more, setMore] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
 const kind = selected && selected !== 'share' ? selected : null;
 const pending = kind ? engagement.isPending(kind) : false;
 useEffect(() => {
  if (!kind) return;
  let active = true; setLoading(true); setError('');
  if (!service.listProjectParticipants) { setLoading(false); setError('People who engaged are not available yet.'); return; }
  service.listProjectParticipants(projectId, kind, offset).then(rows => {
   if (active) { setPeople(previous => offset ? [...previous.filter(p => !rows.some(r => r.id === p.id)), ...rows] : rows); setMore(rows.length === 30); }
  }).catch(() => { if (active) setError('People who engaged could not be loaded.'); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [service, projectId, kind, offset, pending, retry]);
 const select = (next: EngagementKind) => { setPeople([]); setOffset(0); setSelected(next); setRetry(value => value + 1); };
 return <div className="project-popup-engagement">
  <EngagementBar engagement={engagement} projectTitle={projectTitle} showCounts variant="panel" onRequireAccount={onRequireAccount} onSelectAction={select} onShare={() => { setSelected('share'); }} />
  {selected === 'share' ? <InternalContentShareDialog inline target={{url,title:projectTitle}} onClose={() => setSelected(null)} /> : kind && <section className="project-engagement-people" aria-label={`${kind === 'like' ? 'Likes' : kind === 'save' ? 'Saves' : 'Reposts'}`} aria-busy={loading}>
   <h3>{kind === 'like' ? 'Likes' : kind === 'save' ? 'Saves' : 'Reposts'}{engagement.count(kind) !== null ? ` · ${engagement.count(kind)}` : ''}</h3>
   {error ? <p role="status">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></p> : <>
    {people.map(person => <div key={person.id} className="project-engagement-person"><CreatorAvatar name={person.name} avatar={person.avatar} shape="squircle" /><span>{person.name}</span></div>)}
    {loading ? <p role="status">Loading people…</p> : !people.length && <p>No visible profiles to show.</p>}
    {more && <button type="button" disabled={loading} onClick={() => setOffset(value => value + 30)}>Show more</button>}
   </>}
  </section>}
 </div>;
}
